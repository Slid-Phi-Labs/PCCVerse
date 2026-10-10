"""
true8b v2.1 - Fixed + hardened
Delta / small-value + RLE + zero-optimized integer packer
Target: sorted DB deltas (many 0s, runs of identical small values)

Encoding:
  00          → 0                          (2 bits)
  01 + 4b     → 1..15                      (6 bits)
  10 + 8b     → 16..255                    (10 bits)
  11 00 + 6b  → RLE last value (count 1..64) (10 bits)
  11 01 +16b  → 256..65535                 (20 bits)
  11 10 +32b  → 32-bit                     (36 bits)
  11 11       → reserved
"""

from typing import List, Tuple, Optional

def encode(nums: List[int]) -> Tuple[bytes, int]:
    bits: List[int] = []
    i = 0
    last = 0
    n = len(nums)

    def emit_value(v: int):
        nonlocal last
        if v == 0:
            bits.extend([0, 0])
        elif 1 <= v <= 15:
            bits.extend([0, 1])
            for b in range(3, -1, -1):
                bits.append((v >> b) & 1)
        elif v <= 255:
            bits.extend([1, 0])
            for b in range(7, -1, -1):
                bits.append((v >> b) & 1)
        elif v <= 65535:
            bits.extend([1, 1, 0, 1])
            for b in range(15, -1, -1):
                bits.append((v >> b) & 1)
        else:
            bits.extend([1, 1, 1, 0])
            for b in range(31, -1, -1):
                bits.append((v >> b) & 1)
        last = v

    while i < n:
        v = nums[i]
        run = 1
        while i + run < n and nums[i + run] == v and run < 65:
            run += 1

        if run >= 3:
            emit_value(v)
            remaining = run - 1
            bits.extend([1, 1, 0, 0])
            cnt = remaining - 1
            for b in range(5, -1, -1):
                bits.append((cnt >> b) & 1)
            i += run
            continue

        emit_value(v)
        i += 1

    total_bits = len(bits)
    while len(bits) % 8 != 0:
        bits.append(0)

    out = bytearray()
    for j in range(0, len(bits), 8):
        b = 0
        for k in range(8):
            b = (b << 1) | bits[j + k]
        out.append(b)
    return bytes(out), total_bits


def decode(data: bytes, total_bits: int, count: Optional[int] = None) -> List[int]:
    bits: List[int] = []
    for b in data:
        for i in range(7, -1, -1):
            bits.append((b >> i) & 1)
    bits = bits[:total_bits]

    out: List[int] = []
    pos = 0
    last = 0

    while pos + 2 <= len(bits):
        if bits[pos] == 0 and bits[pos + 1] == 0:
            out.append(0)
            last = 0
            pos += 2
        elif bits[pos] == 0 and bits[pos + 1] == 1:
            if pos + 6 > len(bits):
                break
            v = 0
            for i in range(4):
                v = (v << 1) | bits[pos + 2 + i]
            out.append(v)
            last = v
            pos += 6
        elif bits[pos] == 1 and bits[pos + 1] == 0:
            if pos + 10 > len(bits):
                break
            v = 0
            for i in range(8):
                v = (v << 1) | bits[pos + 2 + i]
            out.append(v)
            last = v
            pos += 10
        else:
            if pos + 4 > len(bits):
                break
            sub = (bits[pos + 2] << 1) | bits[pos + 3]
            pos += 4
            if sub == 0:
                if pos + 6 > len(bits):
                    break
                cnt = 0
                for i in range(6):
                    cnt = (cnt << 1) | bits[pos + i]
                pos += 6
                repeat = cnt + 1
                out.extend([last] * repeat)
            elif sub == 1:
                if pos + 16 > len(bits):
                    break
                v = 0
                for i in range(16):
                    v = (v << 1) | bits[pos + i]
                pos += 16
                out.append(v)
                last = v
            elif sub == 2:
                if pos + 32 > len(bits):
                    break
                v = 0
                for i in range(32):
                    v = (v << 1) | bits[pos + i]
                pos += 32
                out.append(v)
                last = v
            else:
                break

        if count is not None and len(out) >= count:
            break

    return out[:count] if count is not None else out


if __name__ == "__main__":
    # Quick self-test
    nums = [0, 0, 0, 1, 2, 2, 2, 2, 100, 256, 1000]
    data, bits = encode(nums)
    assert decode(data, bits, len(nums)) == nums
    print("true8b_v2_fixed self-test OK", len(data), "bytes")
