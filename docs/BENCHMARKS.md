# Verse benchmarks

Date: 2026-11-06. Method: `python3 bench/roundtrip.py` from the verse root
(stdlib only + node on PATH for the ZRW column). Every cell is a real
compress→decompress round-trip; the harness exits nonzero on any mismatch.

Corpora are in-repo files plus seeded synthetic controls. Hashes pin the
exact bytes measured:

| corpus | bytes | sha256[:16] | what it is |
|---|---|---|---|
| src-trustream.py | 5133 | `c3d403646388683b` | `trustream/trustream.py` source |
| src-swarm_nca.py | 17982 | `df609b9b04ef18bd` | `swarm-nca/swarm_nca.py` source |
| src-npcc-api.py | 1143 | `51734540501eb419` | `neural-pcc/npcc/api.py` source |
| json-zrw-package | 3158 | `6a374f8d215ebb2d` | `zero-range-wave-compression/package.json` |
| docs-trustream-readme | 4009 | `73545763ff5a02bc` | `trustream/README.md` docs text |
| syn-zeros-4k | 4096 | `ad7facb2586fc6e9` | all-zero control |
| syn-ramp-4k | 4096 | `c8f5d0341d54d951` | `i % 256` ramp control |
| syn-random-4k | 4096 | `ae9036b4213960d1` | seeded (`0xC0DEC`) random control |

## Compressed sizes (bytes; best per row last)

| corpus | raw (B) | sha256[:16] | gzip-9 (B) | trustream (B) | neural-pcc (B) | swarm-nca (B) | zrw (B) | best |
|---|---|---|---|---|---|---|---|---|
| src-trustream.py | 5133 | `c3d403646388683b` | 1658 | 5139 | 2381 | 2317 | 5991 | gzip |
| src-swarm_nca.py | 17982 | `df609b9b04ef18bd` | 5608 | 17997 | 8334 | 7702 | 22471 | gzip |
| src-npcc-api.py | 1143 | `51734540501eb419` | 478 | 1146 | 669 | 602 | 1506 | gzip |
| json-zrw-package | 3158 | `6a374f8d215ebb2d` | 1226 | 3161 | 1757 | 1676 | 3835 | gzip |
| docs-trustream-readme | 4009 | `73545763ff5a02bc` | 1953 | 4012 | 2800 | 2836 | 8394 | gzip |
| syn-zeros-4k | 4096 | `ad7facb2586fc6e9` | 38 | 3 | 19 | 18 | 8 | trustream |
| syn-ramp-4k | 4096 | `c8f5d0341d54d951` | 327 | 5 | 420 | 307 | 12 | trustream |
| syn-random-4k | 4096 | `ae9036b4213960d1` | 4119 | 4099 | 4115 | 4622 | 15499 | trustream |

## Encode time (ms; this machine, single run wall clock, not a harness)

| corpus | gzip-9 | trustream | neural-pcc | swarm-nca | zrw |
|---|---|---|---|---|---|
| src-trustream.py | 0.10 | 0.02 | 2036.22 | 42.39 | 11.39 |
| src-swarm_nca.py | 0.58 | 0.03 | 15750.60 | 203.06 | 28.50 |
| src-npcc-api.py | 0.03 | 0.01 | 491.78 | 6.71 | 1.32 |
| json-zrw-package | 0.06 | 0.01 | 1394.96 | 26.87 | 3.86 |
| docs-trustream-readme | 0.07 | 0.01 | 1835.85 | 16.01 | 5.54 |
| syn-zeros-4k | 0.01 | 0.01 | 1626.81 | 4.36 | 0.43 |
| syn-ramp-4k | 0.03 | 0.17 | 1670.08 | 32.12 | 0.44 |
| syn-random-4k | 0.04 | 0.01 | 1981.24 | 9.25 | 6.62 |

Notes: ZRW encodes each input byte as one 0-255 int, chunked at 8000
ints/call (Free-Gate per-call limit); sizes are summed over chunks.
swarm-nca uses defaults (steps=3, chained 32KB window). neural-pcc uses
`npcc.compress` defaults. trustream uses 4KiB tiles. Honest summary:
gzip-9 wins on every compressible corpus here. trustream wins the synthetic
rows by construction (ZERO/MATH tiles; raw STORE on random, where it beats
gzip only on framing). neural-pcc and swarm-nca land between gzip and raw;
ZRW expands byte-valued data (it is an integer-sequence codec, not a byte
codec). These are research prototypes: the table refuses any 10x claim.

## Fuzz / property coverage (all green in CI)

- `trustream/test_trustream.py`: 60 seeded random + tile-edge round-trips;
  truncations and forged tags refused.
- `neural-pcc/tests/test_npcc.py`: 40 seeded random round-trips;
  truncations, garbage, and bit-flips refused-or-exact.
- `swarm-nca/swarm_nca.py` self-test: seeded random round-trips over
  1–3-chunk sizes × steps {1,3} × windows {isolated,chained}, zero-heavy
  shapes, corrupt-input refusal. Regression: chunk-boundary
  repeat-offset/clone disambiguation (fixed 2026-11-06).
- `zero-range-wave-compression/test/roundtrip-fuzz.test.mjs`: 300 seeded
  random + zero-heavy + text-like round-trips; mutation/truncation refusal.
  Regression: Fib/omega escape forgery (fixed 2026-11-06). Note: ZRW has no
  checksum — payload bit-flips can decode to different values; the suite
  asserts refusal of structural damage, not integrity.

## Reproduce

```sh
python3 bench/roundtrip.py          # prints the tables above
python3 trustream/test_trustream.py # includes fuzz blocks
python3 neural-pcc/tests/test_npcc.py
python3 swarm-nca/swarm_nca.py
node --test zero-range-wave-compression/test/
```
