#!/usr/bin/env python3
"""Tests for the TRUSTREAM reference tile pipeline."""

from __future__ import annotations

import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trustream as ts


def test_zero_tile_shrinks():
    tag, payload = ts.encode_tile(bytes(ts.TILE))
    assert tag == ts.TAG_ZERO and payload == b""
    assert ts.decode_tile(tag, ts.TILE, payload) == bytes(ts.TILE)
    print("ok ZERO: 4096B -> 3B frame")


def test_ramp_tile_shrinks():
    tile = bytes((i * 3 + 7) % 256 for i in range(ts.TILE))
    tag, payload = ts.encode_tile(tile)
    assert tag == ts.TAG_MATH, tag
    assert ts.decode_tile(tag, ts.TILE, payload) == tile
    print("ok MATH: 4096B ramp -> 5B frame")


def test_busy_tile_stored_raw_and_roundtrips():
    rng = random.Random(1)
    tile = bytes(rng.randrange(256) for _ in range(ts.TILE))
    tag, payload = ts.encode_tile(tile)
    assert tag == ts.TAG_STORE and payload == tile
    assert ts.decode_tile(tag, ts.TILE, payload) == tile
    print("ok STORE: busy tile preserved exactly")


def test_stream_roundtrip_mixed():
    rng = random.Random(2)
    parts = [bytes(ts.TILE),
             bytes((i * 5) % 256 for i in range(ts.TILE)),
             bytes(rng.randrange(256) for _ in range(ts.TILE)),
             b"short final tile"]
    raw = b"".join(parts)
    stream = ts.encode_stream(raw)
    assert ts.decode_stream(stream) == raw
    print("ok mixed stream round-trips (incl. short final tile)")


def test_never_expand_content():
    rng = random.Random(3)
    raws = [bytes(ts.TILE),
            bytes(rng.randrange(256) for _ in range(ts.TILE)),
            bytes((i * 7 + 1) % 256 for i in range(1000)),
            bytes(500)]
    for raw in raws:
        stream = ts.encode_stream(raw)
        content = sum(flen - 3 for _, _, flen in ts.tile_ops(stream))
        assert content <= len(raw), "content expanded"
    print("ok never-expand holds on content")


def test_corrupt_stream_rejected():
    stream = ts.encode_stream(bytes(100))
    try:
        ts.decode_stream(stream[:-1])
    except ValueError:
        print("ok truncated stream rejected")
    else:
        raise AssertionError("truncated stream accepted")


def test_phrase_reserved():
    try:
        ts.decode_tile(ts.TAG_PHRASE, 16, b"")
    except NotImplementedError:
        print("ok PHRASE reserved (decoder refuses honestly)")
    else:
        raise AssertionError("PHRASE silently accepted")



# --- FUZZ-BLOCK: property roundtrips (verse bench harness) ---
def test_fuzz_random_bytes_roundtrip():
    rng = random.Random(0xF02)
    for trial in range(60):
        n = rng.randrange(0, 9000)
        raw = bytes(rng.randrange(256) for _ in range(n))
        assert ts.decode_stream(ts.encode_stream(raw)) == raw, trial
    # adversarial shapes: edges of the 4KiB tile grid
    for n in (0, 1, 4095, 4096, 4097, 8192, 8193):
        raw = bytes(rng.randrange(256) for _ in range(n))
        assert ts.decode_stream(ts.encode_stream(raw)) == raw, n
    print("ok fuzz: 60 random + tile-edge roundtrips")


def test_fuzz_corrupt_input_refuses():
    rng = random.Random(0xBAD)
    # truncations of every length class must raise, never return partial
    raw = bytes(rng.randrange(256) for _ in range(5000))
    stream = ts.encode_stream(raw)
    for cut in (1, 2, 3, 4, 5, len(stream) // 2, len(stream) - 1):
        try:
            ts.decode_stream(stream[:cut])
        except (ValueError, NotImplementedError):
            pass
        else:
            raise AssertionError("truncated stream accepted (cut=%d)" % cut)
    # unknown tag forged into a real header is refused
    bad = bytearray(stream)
    bad[0] = 0x09
    try:
        ts.decode_stream(bytes(bad))
    except (ValueError, NotImplementedError):
        print("ok fuzz: truncations/forged-tag refused")
    else:
        raise AssertionError("forged tag accepted")
def main() -> int:
    test_zero_tile_shrinks()
    test_ramp_tile_shrinks()
    test_busy_tile_stored_raw_and_roundtrips()
    test_stream_roundtrip_mixed()
    test_never_expand_content()
    test_corrupt_stream_rejected()
    test_phrase_reserved()
    test_fuzz_random_bytes_roundtrip()
    test_fuzz_corrupt_input_refuses()
    print("ALL TRUSTREAM TESTS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
