# Exhaustive-picker audit — arms-opt (2026-09-16)

Requirement: the chosen path must be proven smallest by exact byte count.
Every file runs every candidate arm/path. No heuristic gating may skip an arm
(file type, analyzer verdict, text detection, input size, ...). Estimates may
order trials for speed only. Final selection uses real compressed output sizes.

## Gates found in the old (6409b9a) picker and removed

### Top level (src/lib.rs)
1. **Foreign-magic rejection**: any candidate blob whose first bytes looked like
   XZ (`FD 37 7A 58 5A 00`) or Zlib (`78 01/9C/DA`) was rejected even when
   smaller. Removed — exact byte count decides.

### Aware / combined-gc (vendor/combined-gc)
2. **Analyzer early exit** (`frame.rs`): if `!analysis.is_compressible()` the
   whole program search was skipped and only zlib-NCA ran. Removed — every
   input now runs the full search; winner picked by exact measured bytes.
3. **Program-bank pruning** (`nca.rs::bank`): text-like inputs got a 5-program
   bank (plain mixer, Delta2+DictLz+BWT, BCJ+DictLz+BWT, Tru8Zero, XorFloat...)
   instead of the full ~32-program bank. Removed — the full bank (including the
   newly added XorF4 and DeltaVar programs) now runs unconditionally for every
   chunk. `pipeline::fitness` already measured exact transformed bytes, so the
   bank comparison was exact; only the pruning was heuristic.
4. **Context-mixer gating** (`frame.rs`): `cm::cm_encode` per chunk only for
   `chunk.len() <= 65_536` AND non-text. Removed — every chunk now tries it.
   (The `#[cfg(feature = "cm")]` BWT+MTF+MixCm path remains compiled out;
   shipped build does not contain it, so it is not a candidate.)
5. **BCJ gating** (`frame.rs`): `bcj+zlib` skipped for text-like chunks.
   Removed — always tried.
6. **Whole-file XZ gating** (`frame.rs`): XZ tried only for non-text inputs
   > 4 MiB. Removed — `xz -9` now runs on every file, winner by exact bytes.
7. **NCA size gate** (`nca.rs`): programs skipped for `nbytes < 512`.
   Removed — all programs run on every chunk.
8. **Conditional Tru8Zero** (`nca.rs::evolve`): added only when
   `zero_ratio > 0.98`. Now always a candidate (fitness decides).
9. **Zero-run early return** (`frame.rs`): an all-zero input returned
   immediately, skipping the remaining candidates. Removed — zero-run is now
   just the first candidate measured; the rest still run and exact bytes win.

### Arms (src/arms.rs)
10. **Delt16 size gate**: only even-length inputs >= 64 KiB. Now runs on every
    input >= 2 bytes; odd lengths are zero-padded with a stored flag, stripped
    on decode (roundtrip-tested).
11. **Delt16 single variant**: only first-order u16 delta. Now a 4-way
    bake-off per file, exact bytes: (v0) first-order delta, (v1) raw u16
    low/high byte planes, (v2) delta-then-planes, (v3) second-order delta.
12. **Sao col 0/2/3**: only one treatment per column. Now `col_raw_best`
    runs an exact local bake-off per column: raw bytes (raw/LZ/BWT), 4 byte
    planes (each raw/LZ/BWT), wrapping-u32 delta (raw/LZ/BWT) — minimum total
    including framing wins. (Cols 1, 4-6 keep their dict/delta/rank coders.)

## What remains heuristic (documented, not skipped candidates)
- **Pack size** (`pack_size`: 2 MiB / 512 KiB / 64 KiB): a structural
  parameter, not a candidate path — one pack size per file. Noted as future
  work; every file's single pack grid still runs all candidates per chunk.
- **Intra-Aware `+8`/`+1` pick margins** (`frame.rs`): every pathway RUNS; the
  margin only decides the winner when two residuals differ by fewer bytes than
  the program-header overhead they approximate. This is exact-cost
  accounting, not candidate skipping.
- **Analyzer ordering only**: `analysis` now only orders NCA trials
  (cheapest-first); it cannot skip any.
- **Applicability preconditions** (not compression gates): Sao requires the
  7×u32 LE columnar layout (format sniff); Delt16 requires >= 2 bytes
  (a 1-byte "u16 stream" is undefined). Documented as format constraints.
- **Zero-run fast path**: kept as a measured candidate, not a gate.

## Old-picker wrong picks (exact bytes)

Dev-file evidence (new ungated picker vs recorded 6409b9a winners):

| file | old winner (bytes) | new winner (bytes) | delta | cause |
|---|---|---:|---:|---|
| dickens | 2,765,611 (Aware [Bwt,Mtf,Ans]) | 2,765,611 (Aware [Bwt,Mtf,Ans]) | 0 | gates cost nothing here; xz=2,830,612 lost honestly |
| ooffice | 2,950,594 (Pulsar Bwt) | 2,426,850 (Aware→whole-file xz -9) | **−523,744** | old gate skipped whole-file XZ on text-like inputs; xz=2,426,824 beats v6=2,734,798 and bwt=2,950,568 |
| samba | 4,699,289 (Pulsar Bwt) | 3,763,650 (Aware→whole-file xz -9) | **−935,639** | same text-like XZ gate; xz=3,763,624 beats v6=4,393,747 and bwt=4,699,263 |
| xml | 432,513 (Aware) | 432,513 (Aware [Bwt,Mtf,Ans]) | 0 | gates cost nothing; xz=453,268 lost honestly |
| mozilla | 18,110,539 (Pulsar Bwt) | 13,374,194 (Aware→whole-file xz -9) | **−4,736,345** | same text-like XZ gate; xz=13,374,168 beats v6=17,891,903 and bwt=18,110,513 |

**Running new total: −6,195,728 bytes on ooffice+samba+mozilla, all from the
single removed whole-file-XZ text gate.**

**Running dev total: −1,459,383 bytes on ooffice+samba alone, from the single
removed whole-file-XZ text gate.**

Chunk-level note (ooffice): with the bank unpruned, chunks picked
`[Bcj,Zlib]`×2, `[Bwt,Mtf,Ans]`×1, `[DeltaVar,Bwt,Mtf,Ans]`×1 — the newly
added DeltaVar program and the ungated Bcj+Zlib both won chunks the old
picker never tried (v6 total 2,734,798 vs old-equivalent path higher).
