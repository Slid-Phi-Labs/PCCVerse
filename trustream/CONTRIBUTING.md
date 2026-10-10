# Contributing to TRUSTREAM

Thanks for helping pack the world's live streams.

## Ground rules

- **Lossless, always.** A replayed event must be the exact event — byte for byte.
- **Content never expands.** Each tile's content encodes to <= its input size.
  Framing is a fixed 3 bytes per tile on top; that is the only overhead.
- **Cheap wins first.** The op order in `trustream.py` is ZERO → MATH →
  PHRASE → STORE, and new tile ops must keep that ladder: try cheap patterns
  before expensive ones so the stream keeps up in real time.
- **PHRASE is reserved.** The encoder must never emit tag 0x02 and the decoder
  must refuse it with `NotImplementedError`, never silently accept it — unless
  your PR is the one that implements it end to end (tests included).
- **Corrupt streams must raise.** Truncated headers, truncated payloads, and
  unknown tags are errors, never silent skips.

## Quick checks (no compiler needed)

```sh
python3 test_trustream.py        # the full tile-pipe test suite
python3 demo_uberaware_trustream.py  # the sensor-stream demo, must round-trip exactly
```

CI runs the test suite, the demo, and a 25-trial fuzz check (random bytes:
content never expands, decode round-trips) on every pull request.

## Changing tile ops

1. Add or edit the op in `trustream.py`.
2. Add tests in `test_trustream.py` covering shrink, round-trip, and
   never-expand for the new op.
3. Run both checks above. Both must pass.
4. Open a pull request using the template.

## Licensing

TRUSTREAM is dual-licensed (AGPL-3.0-or-later or the Slid Phi Labs Commercial
License). By contributing you agree your contribution may be distributed under
both.
