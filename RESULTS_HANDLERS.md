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

This deadlock fires for every non-text-like input > 4 MB (the `emit_thin_xz`
gate), i.e. it is the "timeout" the SILESIA_SUBMIT notes reported for
dickens/mozilla/webster/nci/samba-class files. The stock 0.3.0 binary used
for the baseline below still has the bug, so stock **times out** on those
files; that is recorded honestly, not substituted.

## Held-out results (one shot, 2026-09-16)

Corpus: `~/workspace/helix-match-exp/corpus/` (dev: dickens ooffice samba xml;
heldout: mozilla mr nci osdb reymont sao webster x-ray).
Stock = pristine 0.3.0 release build; New = this tree. 3600 s timeout per file.
Every decode SHA-256 verified against the original.

| file | raw | stock packed (op) | new packed (op) | Δ bytes | verify |
|---|---|---|---|---|---|
| _to be filled_ ||||||

## Assessment

_to be filled after the run._
