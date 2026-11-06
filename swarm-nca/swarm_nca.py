#!/usr/bin/env python3
"""
SWARM-NCA  SWM2 — research prototype
Lossless general compressor: NCA consensus tags + chunked swarm decode.

No third-party deps. Laptop / Colab CPU is enough.

SWM2
  - ULEB lengths — runs and matches can span a whole chunk
  - Hash-chain match finder
  - Parse: greedy (steps=1), lazy (2), DP optimal (3+)
  - Repeat-offset matches (111 inside a chunk) after a prior match
  - Isolated 4 KB workers (parallel) or chained 32 KB history (better ratio)
  - Identical-chunk clones so later swarm workers copy a prior worker
"""

from __future__ import annotations

import argparse
import math
import time
import zlib
from dataclasses import dataclass
from typing import Iterable, List, Literal, Optional, Tuple

MAGIC = b"SWM2"
CHUNK = 4096
ISOLATED_WINDOW = 4095
CHAINED_WINDOW = 32767
WINDOW = CHAINED_WINDOW
MIN_MATCH, MIN_RUN = 3, 2
HASH_SIZE = 1 << 16
CHAIN = 64
FLAG_CHAINED = 0x01


class BitWriter:
    def __init__(self) -> None:
        self.bits: List[int] = []

    def write_bits(self, value: int, width: int) -> None:
        for i in range(width - 1, -1, -1):
            self.bits.append((value >> i) & 1)

    def write_byte(self, value: int) -> None:
        self.write_bits(value & 0xFF, 8)

    def write_uleb(self, n: int) -> None:
        x = n & 0xFFFFFFFF
        while x >= 0x80:
            self.write_byte((x & 0x7F) | 0x80)
            x >>= 7
        self.write_byte(x)

    def to_bytes(self) -> bytes:
        out = bytearray(math.ceil(len(self.bits) / 8) if self.bits else 0)
        for i, b in enumerate(self.bits):
            if b:
                out[i >> 3] |= 1 << (7 - (i & 7))
        return bytes(out)


class BitReader:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.i = 0

    def remaining(self) -> int:
        return len(self.data) * 8 - self.i

    def read_bits(self, width: int) -> int:
        v = 0
        for _ in range(width):
            if self.i >= len(self.data) * 8:
                raise ValueError("truncated bitstream")
            byte = self.data[self.i >> 3]
            v = (v << 1) | ((byte >> (7 - (self.i & 7))) & 1)
            self.i += 1
        return v

    def read_uleb(self) -> int:
        shift = v = 0
        while True:
            b = self.read_bits(8)
            v |= (b & 0x7F) << shift
            if (b & 0x80) == 0:
                return v
            shift += 7
            if shift > 28:
                raise ValueError("uleb overflow")


def uleb_bits(n: int) -> int:
    x, bits = n & 0xFFFFFFFF, 8
    while x >= 0x80:
        x >>= 7
        bits += 8
    return bits


TagKind = Literal["lit", "run", "match", "idle"]


@dataclass
class Tag:
    kind: TagKind
    bits: float = 0
    value: int = 0
    length: int = 1
    offset: int = 0


def _cost(tag: Tag) -> float:
    if tag.kind in ("run", "match"):
        return tag.bits / tag.length
    if tag.kind == "lit":
        return tag.bits
    return 99.0


def _hash3(a: int, b: int, c: int) -> int:
    h = ((a * 0x9E3779B1) ^ b) & 0xFFFFFFFF
    h = ((h * 0x9E3779B1) ^ c) & 0xFFFFFFFF
    return h & (HASH_SIZE - 1)


def scan(data: bytes, history: bytes = b"", window: int = ISOLATED_WINDOW):
    n = len(data)
    hist = history[-window:] if history else b""
    hist_len = len(hist)
    view = hist + data if hist_len else data
    total = len(view)
    run_at = [1] * n
    for i in range(n - 2, -1, -1):
        if data[i] == data[i + 1]:
            run_at[i] = run_at[i + 1] + 1
    head = [-1] * HASH_SIZE
    prev = [-1] * total

    def insert(pos: int) -> None:
        if pos + 2 >= total:
            return
        h = _hash3(view[pos], view[pos + 1], view[pos + 2])
        prev[pos] = head[h]
        head[h] = pos

    for p in range(hist_len):
        insert(p)

    feats = []
    for j in range(n):
        i = hist_len + j
        value = data[j]
        run = run_at[j]
        moff = mlen = 0
        remain = n - j
        if j > 0:
            _pv, _pr, prev_off, prev_len = feats[j - 1]
            if prev_len > 1 and prev_off > 0:
                mlen, moff = prev_len - 1, prev_off
        skip = (run >= remain and run >= MIN_RUN) or mlen >= remain
        if not skip and i + 2 < total:
            h = _hash3(view[i], view[i + 1], view[i + 2])
            pos, probes = head[h], 0
            while pos >= 0 and probes < CHAIN:
                dist = i - pos
                if dist > window:
                    break
                if dist > 0:
                    k = 0
                    while k < remain and view[i + k] == view[pos + k]:
                        k += 1
                    if k > mlen or (k == mlen and k > 0 and dist < moff):
                        mlen, moff = k, dist
                        if mlen == remain:
                            break
                pos = prev[pos]
                probes += 1
                if mlen >= 64 and probes >= 8:
                    break
        run_interior = run > 3 and j > 0 and data[j] == data[j - 1]
        if not run_interior:
            insert(i)
        feats.append((value, run, moff, mlen))
    return feats


def propose(f) -> Tag:
    value, run, moff, mlen = f
    cands = [Tag("lit", bits=9, value=value)]
    if run >= MIN_RUN:
        cands.append(Tag("run", bits=2 + uleb_bits(run - MIN_RUN) + 8, value=value, length=run))
    if mlen >= MIN_MATCH:
        cands.append(
            Tag(
                "match",
                bits=3 + uleb_bits(mlen - MIN_MATCH) + uleb_bits(moff - 1),
                length=mlen,
                offset=moff,
            )
        )
    return min(cands, key=_cost)


def settle(tags: List[Tag], feats, lazy: bool) -> List[Tag]:
    out = [Tag("idle") for _ in tags]
    i = 0
    while i < len(tags):
        t = tags[i]
        if lazy and t.kind == "match" and i + 1 < len(tags):
            nxt = tags[i + 1]
            if nxt.kind == "match" and nxt.length > t.length:
                t = Tag("lit", bits=9, value=feats[i][0])
        if t.kind in ("run", "match"):
            out[i] = t
            i += t.length
        else:
            out[i] = t if t.kind == "lit" else Tag("lit", bits=9, value=feats[i][0] if i < len(feats) else 0)
            i += 1
    return out


def optimal(feats) -> List[Tag]:
    n = len(feats)
    if n == 0:
        return []
    inf = 1e15
    dp = [inf] * (n + 1)
    dp[0] = 0.0
    via: List[Optional[Tag]] = [None] * (n + 1)
    for i, f in enumerate(feats):
        base = dp[i]
        if base >= inf:
            continue
        value, run, moff, mlen = f
        lit_c = base + 9
        if lit_c < dp[i + 1] - 1e-9:
            dp[i + 1] = lit_c
            via[i + 1] = Tag("lit", bits=9, value=value)
        if run >= MIN_RUN:
            bits = 2 + uleb_bits(run - MIN_RUN) + 8
            j = i + run
            c = base + bits
            if j <= n and c < dp[j] - 1e-9:
                dp[j] = c
                via[j] = Tag("run", bits=bits, value=value, length=run)
        if mlen >= MIN_MATCH:
            lengths = list(range(MIN_MATCH, min(mlen, 32) + 1))
            if mlen > 32:
                lengths.append(mlen)
            for bound in (127 + MIN_MATCH, 128 + MIN_MATCH, 255 + MIN_MATCH):
                if 32 < bound < mlen:
                    lengths.append(bound)
            for L in lengths:
                bits = 3 + uleb_bits(L - MIN_MATCH) + uleb_bits(moff - 1)
                j = i + L
                c = base + bits
                if j <= n and c < dp[j] - 1e-9:
                    dp[j] = c
                    via[j] = Tag("match", bits=bits, length=L, offset=moff)
    placed = [Tag("idle") for _ in range(n)]
    i = n
    while i > 0:
        t = via[i]
        if t is None:
            i -= 1
            continue
        start = i - t.length if t.kind in ("run", "match") else i - 1
        if start < 0:
            break
        placed[start] = t
        i = start
    return placed


def pack(tags: List[Tag], data: bytes, w: BitWriter, last_off: int = 0) -> int:
    i = 0
    while i < len(tags):
        t = tags[i]
        if t.kind == "run":
            w.write_bits(0b10, 2)
            w.write_uleb(t.length - MIN_RUN)
            w.write_byte(t.value)
            i += t.length
        elif t.kind == "match":
            if last_off == t.offset and last_off > 0:
                w.write_bits(0b111, 3)
                w.write_uleb(t.length - MIN_MATCH)
            else:
                w.write_bits(0b110, 3)
                w.write_uleb(t.length - MIN_MATCH)
                w.write_uleb(t.offset - 1)
            last_off = t.offset
            i += t.length
        else:
            w.write_bits(0, 1)
            w.write_byte(data[i])
            i += 1
    return last_off


def unpack(r: BitReader, dest: bytearray, start: int, length: int, last_off: int) -> int:
    i = start
    end = start + length
    while i < end:
        if r.read_bits(1) == 0:
            dest[i] = r.read_bits(8)
            i += 1
            continue
        if r.read_bits(1) == 0:
            n = r.read_uleb() + MIN_RUN
            v = r.read_bits(8)
            for _ in range(n):
                if i >= end:
                    break
                dest[i] = v
                i += 1
            continue
        if r.read_bits(1) != 0:
            if last_off <= 0 or last_off > i:
                raise ValueError("bad repeat offset")
            n = r.read_uleb() + MIN_MATCH
            off = last_off
        else:
            n = r.read_uleb() + MIN_MATCH
            off = r.read_uleb() + 1
            last_off = off
        for _ in range(n):
            if i >= end:
                break
            dest[i] = dest[i - off]
            i += 1
    return last_off


def fnv1a(data: bytes) -> int:
    h = 0x811C9DC5
    for b in data:
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def parse_tags(chunk: bytes, steps: int, history: bytes = b"", window: int = ISOLATED_WINDOW) -> List[Tag]:
    feats = scan(chunk, history, window)
    if steps <= 1:
        return settle([propose(f) for f in feats], feats, lazy=False)
    if steps == 2:
        return settle([propose(f) for f in feats], feats, lazy=True)
    return optimal(feats)


def encode(data: bytes, steps: int = 3, window_mode: str = "chained") -> bytes:
    chained = window_mode == "chained"
    win = CHAINED_WINDOW if chained else ISOLATED_WINDOW
    chunks = [data[i : i + CHUNK] for i in range(0, len(data), CHUNK)] or [b""]
    w = BitWriter()
    seen: dict[tuple[int, int], int] = {}
    last_off = 0
    for idx, chunk in enumerate(chunks):
        key = (len(chunk), fnv1a(chunk))
        prev = seen.get(key)
        if prev is not None and chunks[prev] == chunk:
            w.write_bits(0b111, 3)
            w.write_uleb(prev)
            seen[key] = idx
            last_off = 0
            continue
        seen[key] = idx
        origin = idx * CHUNK
        hist = data[max(0, origin - win) : origin] if chained and origin else b""
        # Chunk frames are self-describing: a repeat-offset match
        # (0b111) must never open a chunk, or decode reads it as
        # a clone marker.
        last_off = 0
        last_off = pack(parse_tags(chunk, steps, hist, win), chunk, w, last_off)
    header = bytearray(14)
    header[0:4] = MAGIC
    header[4:8] = len(data).to_bytes(4, "big")
    header[8] = steps & 0xFF
    header[9] = FLAG_CHAINED if chained else 0
    header[10:12] = CHUNK.to_bytes(2, "big")
    header[12:14] = min(65535, len(chunks)).to_bytes(2, "big")
    return bytes(header) + w.to_bytes()


def decode(blob: bytes) -> bytes:
    if blob[:4] != MAGIC or len(blob) < 14:
        raise ValueError("not SWM2")
    original = int.from_bytes(blob[4:8], "big")
    flags = blob[9]
    chained = bool(flags & FLAG_CHAINED)
    chunk = int.from_bytes(blob[10:12], "big") or CHUNK
    r = BitReader(blob[14:])
    out = bytearray(original)
    prior: List[bytes] = []
    offset = 0
    last_off = 0
    while offset < original:
        n = min(chunk, original - offset)
        saved = r.i
        flag = r.read_bits(3) if r.remaining() >= 3 else 0
        if flag == 0b111:
            src = r.read_uleb()
            piece = prior[src][:n]
            out[offset : offset + n] = piece
            last_off = 0
        else:
            r.i = saved
            last_off = 0  # mirror of the encoder-side reset above
            last_off = unpack(r, out, offset, n, last_off)
            piece = bytes(out[offset : offset + n])
        prior.append(bytes(piece) if not isinstance(piece, (bytes, bytearray)) else bytes(piece))
        offset += n
    return bytes(out)


def _fuzz_self_test() -> None:
    """FUZZ-BLOCK (verse bench harness): seeded random roundtrips over sizes
    spanning 1-3 chunks x steps {1, 3} x windows {isolated, chained}, plus
    corrupt-input refusal and the chunk-boundary repeat/clone regression
    (a chunk opening with a repeat-offset match must not decode as a
    clone marker)."""
    import random as _random

    rng = _random.Random(0xF02)
    sizes = [0, 1, 7, 100, 1000, 4095, 4096, 4097, 5000, 8192, 9000, 12500]
    for n in sizes:
        payload = bytes(rng.randrange(256) for _ in range(n))
        for steps in (1, 3):
            for window in ("isolated", "chained"):
                back = decode(encode(payload, steps=steps, window_mode=window))
                assert back == payload, (n, steps, window)
    # zero-heavy adversarial shapes (repeat-offset heavy)
    for trial in range(10):
        parts = []
        for _ in range(1 + rng.randrange(5)):
            parts += [0] * rng.randrange(9)
            parts.append(rng.randrange(256))
        payload = bytes(parts) * (1 + rng.randrange(3))
        for window in ("isolated", "chained"):
            assert decode(encode(payload, window_mode=window)) == payload
    # corrupt input refuses: truncations, garbage, bad magic
    payload = bytes(rng.randrange(256) for _ in range(5000))
    blob = encode(payload)
    for cut in (0, 1, 5, 13, 14, 15, len(blob) // 2, len(blob) - 1):
        try:
            decode(blob[:cut])
        except Exception:
            pass
        else:
            raise AssertionError("truncated blob accepted (cut=%d)" % cut)
    for trial in range(20):
        junk = bytes(rng.randrange(256) for _ in range(rng.randrange(0, 30)))
        try:
            decode(junk)
        except Exception:
            pass
        else:
            raise AssertionError("garbage accepted (trial=%d)" % trial)
    try:
        decode(b"XXXX" + blob[4:])
    except ValueError:
        pass
    else:
        raise AssertionError("bad magic accepted")
    print("fuzz  random/chunk-edge/corrupt roundtrips OK")


def _demo(payload: bytes, label: str = "", window_mode: str = "chained") -> None:
    t0 = time.perf_counter()
    packed = encode(payload, window_mode=window_mode)
    t1 = time.perf_counter()
    back = decode(packed)
    t2 = time.perf_counter()
    ok = back == payload
    ratio = (len(packed) / len(payload)) if payload else 1.0
    gz = len(zlib.compress(payload, 9)) if payload else 0
    vs = (len(packed) / gz) if gz else 0.0
    tag = f"{label}  " if label else ""
    print(
        f"{tag}{window_mode:9} in={len(payload)}  out={len(packed)}  gzip={gz}  "
        f"ratio={ratio:.4f}  vs={vs:.2f}x  "
        f"enc={(t1 - t0) * 1e3:.2f}ms  dec={(t2 - t1) * 1e3:.2f}ms  lossless={ok}"
    )
    if not ok:
        raise SystemExit("round-trip failed")


def main(argv: Optional[Iterable[str]] = None) -> None:
    p = argparse.ArgumentParser(description="SWARM-NCA SWM2 research compressor")
    p.add_argument("path", nargs="?", help="file to compress (omit for self-test)")
    p.add_argument("-o", "--out", help="write .swm2 payload here")
    p.add_argument("--decode", action="store_true", help="treat input as SWM2")
    p.add_argument("--steps", type=int, default=3)
    p.add_argument("--window", choices=("isolated", "chained"), default="chained")
    args = p.parse_args(list(argv) if argv is not None else None)

    if not args.path:
        import json

        json_blob = json.dumps(
            {
                "model": "swarm-nca",
                "steps": 3,
                "workers": 8,
                "tags": ["lit", "run", "match", "clone"],
                "notes": [{"i": i, "ok": i % 2 == 0, "msg": "cell consensus"} for i in range(24)],
            },
            indent=2,
        ).encode() * 3
        fixtures = [
            (b"0" * 2048, "zeros"),
            (b"swarm-nca-pack " * 180, "motif"),
            (bytes(range(256)) * 4, "range"),
            ((b"{" + b"cell:1," * 80 + b"}") * 3, "struct"),
            (json_blob, "json"),
            (b"aaaabaaaab", "school"),
            (b"0123456789abcdef" * 256 * 2, "clone"),
        ]
        for payload, label in fixtures:
            _demo(payload, label, "isolated")
            _demo(payload, label, "chained")
        _fuzz_self_test()
        return

    data = open(args.path, "rb").read()
    if args.decode:
        raw = decode(data)
        if args.out:
            open(args.out, "wb").write(raw)
        else:
            print(raw[:200])
        return

    packed = encode(data, steps=args.steps, window_mode=args.window)
    if args.out:
        open(args.out, "wb").write(packed)
    _demo(data, window_mode=args.window)


if __name__ == "__main__":
    main()
