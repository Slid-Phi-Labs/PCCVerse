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


def main() -> int:
    test_zero_tile_shrinks()
    test_ramp_tile_shrinks()
    test_busy_tile_stored_raw_and_roundtrips()
    test_stream_roundtrip_mixed()
    test_never_expand_content()
    test_corrupt_stream_rejected()
    test_phrase_reserved()
    print("ALL TRUSTREAM TESTS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
