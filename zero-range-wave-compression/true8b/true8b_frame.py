"""
true8b Frame Format v0.1
========================

[MAGIC "TRUE8B"][Version u8][Flags u8]
[Block 0]
[Block 1]
...

Each Block:
  [Block Header]
    original_count   : u32
    total_bits       : u32
    payload_bytes    : u32
  [Payload]
    true8b bit-stream (byte-aligned, zero-padded)

Flags:
  bit 0 : Path A = pure true8b
  bit 1 : Path B = residual / delta pre-pass
"""

from __future__ import annotations
import struct
from typing import List

# Minimal inline encode/decode so this file is self-contained
def _encode_ints(nums: List[int]):
    bits = []
    last = 0
    i = 0
    n = len(nums)
    while i < n:
        v = nums[i]
        run = 1
        while i + run < n and nums[i + run] == v and run < 65:
            run += 1
        def emit(val):
            nonlocal last
            if val == 0:
                bits.extend([0, 0])
            elif 1 <= val <= 15:
                bits.extend([0, 1] + [(val >> b) & 1 for b in range(3, -1, -1)])
            elif val <= 255:
                bits.extend([1, 0] + [(val >> b) & 1 for b in range(7, -1, -1)])
            elif val <= 65535:
                bits.extend([1, 1, 0, 1] + [(val >> b) & 1 for b in range(15, -1, -1)])
            else:
                bits.extend([1, 1, 1, 0] + [(val >> b) & 1 for b in range(31, -1, -1)])
            last = val
        if run >= 3:
            emit(v)
            bits.extend([1, 1, 0, 0])
            cnt = (run - 1) - 1
            bits.extend([(cnt >> b) & 1 for b in range(5, -1, -1)])
            i += run
        else:
            emit(v)
            i += 1
    total_bits = len(bits)
    while len(bits) % 8:
        bits.append(0)
    out = bytearray()
    for j in range(0, len(bits), 8):
        b = 0
        for k in range(8):
            b = (b << 1) | bits[j + k]
        out.append(b)
    return bytes(out), total_bits

MAGIC = b"TRUE8B"
VERSION = 1
FLAG_PATH_A = 1 << 0
DEFAULT_BLOCK_SIZE = 65536

def encode_frame(nums: List[int], block_size: int = DEFAULT_BLOCK_SIZE, flags: int = FLAG_PATH_A) -> bytes:
    out = bytearray()
    out += MAGIC
    out += struct.pack("<BB", VERSION, flags)
    for start in range(0, len(nums), block_size):
        block = nums[start:start + block_size]
        payload, total_bits = _encode_ints(block)
        header = struct.pack("<III", len(block), total_bits, len(payload))
        out += header
        out += payload
    return bytes(out)

def frame_info(data: bytes) -> dict:
    if not data.startswith(MAGIC):
        return {"error": "bad magic"}
    version, flags = struct.unpack_from("<BB", data, 6)
    info = {"magic": "TRUE8B", "version": version, "flags": flags, "blocks": [], "total_ints": 0}
    pos = 8
    while pos + 12 <= len(data):
        count, total_bits, payload_len = struct.unpack_from("<III", data, pos)
        pos += 12 + payload_len
        info["blocks"].append({"count": count, "total_bits": total_bits, "payload_bytes": payload_len})
        info["total_ints"] += count
    return info

if __name__ == "__main__":
    nums = [0] * 100 + [1, 2, 3] * 50
    framed = encode_frame(nums)
    print("frame", len(framed), "bytes", frame_info(framed))
