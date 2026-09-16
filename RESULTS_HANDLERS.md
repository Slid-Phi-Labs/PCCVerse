# PCCX special-case arms — RESULTS_HANDLERS.md

Date: 2026-09-16. Base: pristine PCCX 0.3.0 (`~/workspace/pccx-base/pccx-0.3.0.zip`),
work tree `~/workspace/pccx-handlers/` (fresh git repo, this commit).

## What was built

Two new compression arms, wired as new `Op` codes in the PCC1 frame so the
existing try-all-pathways + decode-verify picker selects them automatically
when (and only when) they win. Frame format and CLI contract unchanged.

- **Op 13 `Sao` — SAO star-catalog columnar arm** (`src/arms.rs::sao_encode/_decode`).
  Sniffs the 28-byte record layout from record 0: requires field[6]==28
  (record size) and (field[2]+1)*28 == file length. Splits the R records into
  7 u32 columns; delta-codes the sorted coordinate column (1); dictionary +
  rank-codes the low-cardinality columns (4,5,6); passes the rest as raw u32
  bytes. Each transformed column goes through raw-vs-own-LZ-vs-BWT-ANS and
  keeps the smallest. Dictionaries stored explicitly (sorted unique u32s).
- **Op 14 `Delt16` — generic 16-bit left-delta arm** (`src/arms.rs::d16_encode/_decode`).
  Attempted on any even-length input ≥ 64 KiB: interprets bytes as u16 LE,
  stores v[0] then wrapping left deltas, second stage raw-vs-LZ-vs-BWT-ANS.
  The picker keeps it only when it is the smallest candidate.

Both arms are exact: every transform is inverted in decode, and the frame
CRC32 still guards the final bytes. `encode()`'s built-in decode-verify
covers the new arms.

## Stock bug found and fixed (in this tree only)

`vendor/combined-gc/src/xz_thin.rs::xz_encode`/`xz_decode` deadlocked: the
parent did `stdin.write_all(data)` and only then read the child's stdout.
Once `xz -9`'s 64 KiB stdout pipe filled, xz blocked on write and stopped
draining stdin — the parent blocked on write forever. Reproduced live (parent
stuck in `anon_pipe_write`, `xz` at 0 CPU) and with a 5 MB random-data probe
(timed out at 30 s). Fix: write stdin on a scoped thread while the main
thread drains stdout via `wait_with_output`; the writer drops its stdin
handle (EOF to child). Probe after fix: 5 MB → xz in ~2 s, roundtrip OK.

Trigger condition (narrower than first thought): input > 4 MB **and** not
text-like **and** the analyzer rates it compressible. sao escapes because the
analyzer returns "not compressible" before the xz branch; nci escapes because
it is text-like (xz branch skipped). Confirmed deadlocks: ooffice, samba,
mozilla, mr, osdb, x-ray.

## Held-out results (2026-09-16)

Corpus: `~/workspace/helix-match-exp/corpus/heldout/` — the full 12-file
Silesia set (raw total 211,938,580 bytes, matches public Silesia size).
Stock = pristine 0.3.0 release build; New = this tree. 3600 s timeout per file.
Every successful decode SHA-256 verified against the original.

| file | raw | stock packed (op) | new packed (op) | Δ (new−stock) | verify |
|---|---:|---:|---:|---:|---|
| dickens | 10,192,446 | 2,765,611 (12) | 2,765,611 (12) | 0 | OK |
| ooffice | 6,152,192 | TIMEOUT (deadlock) | 2,950,594 (2) | — (stock hangs) | OK |
| samba | 21,606,400 | TIMEOUT (deadlock) | 4,699,289 (2) | — (stock hangs) | OK |
| xml | 5,345,280 | 432,513 (12) | 432,513 (12) | 0 | OK |
| mozilla | 51,220,480 | TIMEOUT (deadlock) | 18,110,539 (2) | — (stock hangs) | OK |
| mr | 9,970,564 | TIMEOUT (deadlock) | 2,481,649 (12) | — (stock hangs) | OK |
| nci | 33,553,445 | 1,736,579 (12) | 1,736,579 (12) | 0 | OK |
| osdb | 10,085,684 | TIMEOUT (deadlock) | 2,772,434 (12) | — (stock hangs) | OK |
| reymont | 6,627,202 | 1,242,663 (12) | 1,242,663 (12) | 0 | OK |
| sao | 7,251,944 | 5,150,500 (2) | **4,207,542 (13)** | **−942,958** | OK |
| webster | 41,458,703 | 8,502,686 (12) | 8,502,686 (12) | 0 | OK |
| x-ray | 8,474,240 | TIMEOUT (deadlock) | 3,837,303 (12) | — (stock hangs) | OK |

**New 12-file total: 53,739,402 bytes (~53.74 MB). All 12 decodes SHA-256 verified.**

**Comparable 6 files (both builds completed):** stock 19,830,552 → new
18,887,594, **saving 942,958 bytes, all from sao.**

## Assessment

- **sao arm: genuine win.** Op 13 takes sao 5,150,500 → 4,207,542
  (−942,958). Below the triage's ~3.0 MB estimate: per-column analysis shows
  columns 0 and 2 (1,035,992 bytes each) fell back to raw — the byte-level
  BWT second stage cannot reach the triage's value-level entropy bound on
  wide u32 columns. Byte-plane splitting is the obvious next step (future
  work; not tuned here).
- **x-ray arm: did not win.** Aware V6 won at 3,837,303 (blob starts with
  `AWAREv6`, not the xz branch); Delt16 lost the bake-off. The x-ray result
  exists at all only because the deadlock fix lets the Aware pathway
  complete — stock hangs. Versus the no-Aware Bwt baseline (4,307,078) the
  unlocked Aware path saves 469,775 bytes, but that credit belongs to the
  deadlock fix, not the Delt16 arm.
- **Combined arm-attributable saving: 942,958 bytes** — short of the ~2.8 MB
  target.
- **No regressions:** every file stock completes, new matches or beats
  byte-for-byte.
- **The historical ~51.2 MB "stock" estimate is not reproduced** by a unified
  stock 0.3.0 run. It mixed in Aware-pathway numbers (mozilla ~14.1 MB,
  webster 8,169,000) that do not materialize in stock 0.3.0's bake-off:
  pristine stock gives webster 8,502,686 (op 12) and deadlocks on mozilla.
  The 53.74 MB above is the first complete, verified 12-file measurement of
  this tree.
- **Benchmark caveats:** three service restarts wiped `/tmp` and killed the
  in-progress run each time; the script is resumable (skips recorded pairs),
  so no row was measured twice and no partial row was kept — but the "one
  uninterrupted shot" framing no longer applies literally. Another agent's
  benchmark ran concurrently for part of the session (load ~5–8); affects
  wall-clock times only, not output bytes.
