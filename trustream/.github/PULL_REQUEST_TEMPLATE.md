## What changed

<!-- One or two sentences. -->

## Checks

- [ ] `python3 test_trustream.py` passes
- [ ] `python3 demo_uberaware_trustream.py` round-trips exactly
- [ ] Content still never expands (each tile's payload <= its input size; framing is a fixed 3 bytes per tile)
- [ ] PHRASE stays reserved unless this PR implements it (decoder must refuse, not silently accept)
