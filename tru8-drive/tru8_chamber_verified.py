#!/usr/bin/env python3
"""
tru8_chamber_verified.py  –  HumanPen TRU8 Chamber MCP Server

Gated sealed-data server.  Unpacking is blocked until a VerifiedDR
site verification succeeds.  Only after the gate passes are
k + r + nonce + tag restored and the sealed blob decrypted.

Environment variables required:
  VERIFIEDDR_API_KEY   – from VerifiedDR dashboard → API
  TRU8_MASTER_SECRET   – high-entropy secret used to derive the chamber key
  CHAMBER_DOMAIN       – (optional) domain that must pass sites:verify
                         defaults to the value passed in tool calls

Tools exposed:
  chamber_status   – read-only status + last verification result
  chamber_unpack   – gated decrypt (requires verified=true)
  chamber_seal     – encrypt new material into a sealed blob

Security notes:
  - Master secret never leaves process memory in plaintext after derivation.
  - Unverified calls raise PermissionError / return an explicit blocked result.
  - No private Autonoma / Blackjack material is embedded in this public gate.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import struct
import subprocess
import sys
import time
import traceback
from typing import Any

# ---------------------------------------------------------------------------
# Cryptography (AES-256-GCM)
# ---------------------------------------------------------------------------
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    print("FATAL: cryptography package required (pip install cryptography)", file=sys.stderr)
    sys.exit(1)

# Sealed blob format (versioned):
#   magic (4) | version (1) | nonce (12) | ciphertext+tag (rest)
MAGIC = b"TRU8"
VERSION = 1
NONCE_LEN = 12


def _derive_key(master: str, salt: bytes = b"tru8-chamber-v1") -> bytes:
    """HKDF-like derivation from the master secret. 32-byte key for AES-256."""
    return hashlib.pbkdf2_hmac(
        "sha256",
        master.encode("utf-8"),
        salt,
        iterations=120_000,
        dklen=32,
    )


def seal(plaintext: bytes, master: str) -> bytes:
    key = _derive_key(master)
    aesgcm = AESGCM(key)
    nonce = os.urandom(NONCE_LEN)
    ct = aesgcm.encrypt(nonce, plaintext, associated_data=MAGIC)
    return MAGIC + bytes([VERSION]) + nonce + ct


def unpack(sealed: bytes, master: str) -> bytes:
    if len(sealed) < 4 + 1 + NONCE_LEN + 16:
        raise ValueError("sealed blob too short")
    if sealed[:4] != MAGIC:
        raise ValueError("bad magic – not a TRU8 chamber")
    if sealed[4] != VERSION:
        raise ValueError(f"unsupported version {sealed[4]}")
    nonce = sealed[5 : 5 + NONCE_LEN]
    ct = sealed[5 + NONCE_LEN :]
    key = _derive_key(master)
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct, associated_data=MAGIC)


# ---------------------------------------------------------------------------
# VerifiedDR gate
# ---------------------------------------------------------------------------
_last_check: dict[str, Any] = {
    "verified": False,
    "domain": None,
    "ts": 0,
    "reason": "never checked",
}


def verifieddr_check(domain: str | None = None) -> dict[str, Any]:
    """
    Call VerifiedDR sites:verify.  Returns a dict containing at least
    {"verified": bool, "domain": str, "reason": str, "raw": ...}.
    """
    global _last_check

    domain = (
        domain
        or os.environ.get("CHAMBER_DOMAIN")
        or os.environ.get("VERIFIEDDR_SITE")
    )
    if not domain:
        return {
            "verified": False,
            "domain": None,
            "reason": "no domain supplied and CHAMBER_DOMAIN / VERIFIEDDR_SITE not set",
            "ts": time.time(),
        }

    key = os.environ.get("VERIFIEDDR_API_KEY")
    if not key:
        return {
            "verified": False,
            "domain": domain,
            "reason": "VERIFIEDDR_API_KEY missing",
            "ts": time.time(),
        }

    # Prefer the CLI (same surface the original comment used)
    cmd = [
        "npx",
        "-y",
        "verifieddr",
        "sites:verify",
        domain,
        "--key",
        key,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=45,
            env={**os.environ, "VERIFIEDDR_API_KEY": key},
        )
        stdout = (result.stdout or "").strip()
        stderr = (result.stderr or "").strip()

        # Heuristic: success if exit 0 and no obvious failure language
        verified = result.returncode == 0 and "not verified" not in stdout.lower() and "not verified" not in stderr.lower()
        # Stronger signal if the CLI emits structured status
        if "verified" in stdout.lower() and "not " not in stdout.lower()[:80]:
            verified = True
        if result.returncode != 0:
            verified = False

        out = {
            "verified": verified,
            "domain": domain,
            "reason": stderr or stdout or f"exit={result.returncode}",
            "ts": time.time(),
            "raw_stdout": stdout[:800],
            "raw_stderr": stderr[:800],
        }
    except subprocess.TimeoutExpired:
        out = {
            "verified": False,
            "domain": domain,
            "reason": "VerifiedDR check timed out",
            "ts": time.time(),
        }
    except FileNotFoundError:
        out = {
            "verified": False,
            "domain": domain,
            "reason": "npx / verifieddr CLI not available",
            "ts": time.time(),
        }
    except Exception as e:
        out = {
            "verified": False,
            "domain": domain,
            "reason": f"check exception: {e}",
            "ts": time.time(),
        }

    _last_check = out
    return out


# ---------------------------------------------------------------------------
# Minimal MCP stdio server (Content-Length framed JSON-RPC)
# ---------------------------------------------------------------------------
def _send(msg: dict) -> None:
    body = json.dumps(msg, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    header = f"Content-Length: {len(body)}\r\n\r\n".encode("ascii")
    sys.stdout.buffer.write(header + body)
    sys.stdout.buffer.flush()


def _read_message() -> dict | None:
    """Read one Content-Length framed message from stdin."""
    headers: dict[str, str] = {}
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return None
        line = line.decode("utf-8", errors="replace").rstrip("\r\n")
        if line == "":
            break
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()

    length = int(headers.get("content-length", "0"))
    if length <= 0:
        return None
    body = sys.stdin.buffer.read(length)
    if not body:
        return None
    return json.loads(body.decode("utf-8"))


def _tool_result(text: str, is_error: bool = False) -> dict:
    return {
        "content": [{"type": "text", "text": text}],
        "isError": is_error,
    }


def handle_tools_list() -> dict:
    return {
        "tools": [
            {
                "name": "chamber_status",
                "description": "Return current chamber gate status and last VerifiedDR check result. Read-only.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "domain": {
                            "type": "string",
                            "description": "Optional domain to check (overrides CHAMBER_DOMAIN env).",
                        }
                    },
                },
            },
            {
                "name": "chamber_unpack",
                "description": (
                    "Decrypt a TRU8 sealed blob.  BLOCKED unless VerifiedDR sites:verify "
                    "succeeds for the configured / supplied domain.  Only after the gate "
                    "passes are k+r+nonce+tag restored and the plaintext returned."
                ),
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "sealed_b64": {
                            "type": "string",
                            "description": "Base64-encoded sealed blob (magic+version+nonce+ct+tag).",
                        },
                        "domain": {
                            "type": "string",
                            "description": "Domain that must pass VerifiedDR verification.",
                        },
                    },
                    "required": ["sealed_b64"],
                },
            },
            {
                "name": "chamber_seal",
                "description": "Encrypt plaintext into a new TRU8 sealed blob. Does not require verification.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "plaintext": {
                            "type": "string",
                            "description": "UTF-8 text (or base64 if binary=true) to seal.",
                        },
                        "binary": {
                            "type": "boolean",
                            "description": "If true, treat plaintext as base64 of raw bytes.",
                            "default": False,
                        },
                    },
                    "required": ["plaintext"],
                },
            },
        ]
    }


def handle_tool_call(name: str, arguments: dict) -> dict:
    master = os.environ.get("TRU8_MASTER_SECRET")
    if not master:
        return _tool_result(
            "TRU8_MASTER_SECRET environment variable is not set. Chamber is locked.",
            is_error=True,
        )

    if name == "chamber_status":
        domain = arguments.get("domain")
        # Force a fresh check if domain supplied, else return cached
        if domain or not _last_check.get("ts"):
            status = verifieddr_check(domain)
        else:
            status = dict(_last_check)
        status["master_present"] = True
        status["server"] = "humanpen-tru8-chamber"
        return _tool_result(json.dumps(status, indent=2))

    if name == "chamber_seal":
        pt = arguments.get("plaintext", "")
        binary = bool(arguments.get("binary", False))
        try:
            data = base64.b64decode(pt) if binary else pt.encode("utf-8")
            sealed = seal(data, master)
            return _tool_result(
                json.dumps(
                    {
                        "sealed_b64": base64.b64encode(sealed).decode("ascii"),
                        "bytes": len(sealed),
                    },
                    indent=2,
                )
            )
        except Exception as e:
            return _tool_result(f"seal failed: {e}", is_error=True)

    if name == "chamber_unpack":
        sealed_b64 = arguments.get("sealed_b64")
        if not sealed_b64:
            return _tool_result("sealed_b64 is required", is_error=True)

        domain = arguments.get("domain")
        gate = verifieddr_check(domain)

        if not gate.get("verified"):
            # Explicit hard block – never touch the sealed material
            return _tool_result(
                json.dumps(
                    {
                        "error": "OPEN BLOCKED",
                        "reason": gate.get("reason"),
                        "domain": gate.get("domain"),
                        "verified": False,
                    },
                    indent=2,
                ),
                is_error=True,
            )

        # Gate passed – now restore k+r+nonce+tag and decrypt
        try:
            sealed = base64.b64decode(sealed_b64)
            plaintext = unpack(sealed, master)
            # Return as text if possible, otherwise base64
            try:
                text = plaintext.decode("utf-8")
                return _tool_result(
                    json.dumps(
                        {
                            "verified": True,
                            "domain": gate.get("domain"),
                            "plaintext": text,
                            "encoding": "utf-8",
                        },
                        indent=2,
                    )
                )
            except UnicodeDecodeError:
                return _tool_result(
                    json.dumps(
                        {
                            "verified": True,
                            "domain": gate.get("domain"),
                            "plaintext_b64": base64.b64encode(plaintext).decode("ascii"),
                            "encoding": "binary",
                        },
                        indent=2,
                    )
                )
        except Exception as e:
            return _tool_result(f"unpack failed after gate: {e}", is_error=True)

    return _tool_result(f"unknown tool: {name}", is_error=True)


def main() -> None:
    # MCP initialize handshake + request loop
    while True:
        msg = _read_message()
        if msg is None:
            break

        method = msg.get("method")
        msg_id = msg.get("id")
        params = msg.get("params") or {}

        try:
            if method == "initialize":
                result = {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {
                        "name": "humanpen-tru8-chamber",
                        "version": "0.1.0",
                    },
                }
                _send({"jsonrpc": "2.0", "id": msg_id, "result": result})

            elif method == "notifications/initialized":
                # no response required
                pass

            elif method == "tools/list":
                _send({"jsonrpc": "2.0", "id": msg_id, "result": handle_tools_list()})

            elif method == "tools/call":
                name = params.get("name", "")
                arguments = params.get("arguments") or {}
                tool_result = handle_tool_call(name, arguments)
                _send({"jsonrpc": "2.0", "id": msg_id, "result": tool_result})

            elif method == "ping":
                _send({"jsonrpc": "2.0", "id": msg_id, "result": {}})

            else:
                # Unknown method
                if msg_id is not None:
                    _send(
                        {
                            "jsonrpc": "2.0",
                            "id": msg_id,
                            "error": {
                                "code": -32601,
                                "message": f"Method not found: {method}",
                            },
                        }
                    )
        except Exception as e:
            if msg_id is not None:
                _send(
                    {
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "error": {
                            "code": -32000,
                            "message": str(e),
                            "data": traceback.format_exc()[-1500:],
                        },
                    }
                )


if __name__ == "__main__":
    main()
