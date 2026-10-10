#!/usr/bin/env python3
"""UberAware sensor stream -> TRUSTREAM tile pipeline demo.

A sensor frame is 64 samples x 16 float32 channels = 4096 bytes = one tile.
Frames are generated with UberAware-style semantics (temp/motion channels,
surprise scoring); quiet frames shrink via ZERO, calibration sweeps via MATH,
busy/spike frames are stored raw. Every frame round-trips exactly.
"""

from __future__ import annotations

import hashlib
import random
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trustream as ts

SAMPLES = 64
CHANNELS = 16
FRAME = SAMPLES * CHANNELS * 4  # 4096 = one tile
assert FRAME == ts.TILE


def surprise(temp: float, motion: float, baseline: float = 22.0) -> float:
    return (1.2 if motion >= 0.5 else 0.0) + abs(temp - baseline) * 0.4


def quiet_frame() -> bytes:
    """Sensors idle: all channels at rest (zeros)."""
    return bytes(FRAME)


def sweep_frame(start: int = 7, step: int = 3) -> bytes:
    """Calibration sweep: exact u8 ramp across the tile."""
    return bytes((start + step * i) % 256 for i in range(FRAME))


def busy_frame(rng: random.Random) -> bytes:
    """All channels live with noise: incompressible."""
    return bytes(rng.randrange(256) for _ in range(FRAME))


def spike_frame(rng: random.Random) -> bytes:
    """Mostly idle with one anomalous burst region."""
    b = bytearray(FRAME)
    at = rng.randrange(0, FRAME - 256)
    for i in range(256):
        b[at + i] = rng.randrange(256)
    return bytes(b)


def main() -> int:
    rng = random.Random(42)
    # Script: idle, idle, motion spike, idle, calibration sweep,
    #         busy, busy, spike, idle, busy, idle, idle
    plan = ["quiet", "quiet", "spike", "quiet", "sweep",
            "busy", "busy", "spike", "quiet", "busy", "quiet", "quiet"]
    makers = {"quiet": quiet_frame, "sweep": sweep_frame,
              "busy": lambda: busy_frame(rng), "spike": lambda: spike_frame(rng)}
    frames = []
    surprises = []
    for kind in plan:
        f = makers[kind]()
        frames.append(f)
        # UberAware-style surprise for the frame's headline reading
        if kind == "spike":
            surprises.append(surprise(31.0, 1.0))
        elif kind == "busy":
            surprises.append(surprise(23.5, 1.0))
        else:
            surprises.append(surprise(22.0, 0.0))

    raw = b"".join(frames)
    stream = ts.encode_stream(raw)
    back = ts.decode_stream(stream)
    assert back == raw, "round-trip mismatch"
    assert hashlib.sha256(back).digest() == hashlib.sha256(raw).digest()

    ops = ts.tile_ops(stream)
    in_total = len(raw)
    out_total = len(stream)
    print(f"frames={len(frames)} tile={ts.TILE}B "
          f"in={in_total} out={out_total} "
          f"ratio={out_total / in_total:.3f}")
    print(f"{'tile':>4} {'kind':>6} {'op':>6} {'surprise':>8} "
          f"{'in':>6} {'out':>6}")
    for i, ((tag, tlen, flen), kind, s) in enumerate(zip(ops, plan, surprises)):
        print(f"{i:>4} {kind:>6} {ts.TAG_NAME[tag]:>6} {s:>8.2f} "
              f"{tlen:>6} {flen:>6}")
    n_zero = sum(1 for t, _, _ in ops if t == ts.TAG_ZERO)
    n_store = sum(1 for t, _, _ in ops if t == ts.TAG_STORE)
    print(f"quiet tiles shrunk: {n_zero}, busy tiles stored raw: {n_store}, "
          f"round-trip: EXACT (sha256 match)")
    # never-expand check on content (framing is a fixed 3 bytes/tile)
    for (tag, tlen, flen), f in zip(ops, frames):
        content = flen - 3
        assert content <= len(f), "content expanded!"
    print("never-expand holds on every tile")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
