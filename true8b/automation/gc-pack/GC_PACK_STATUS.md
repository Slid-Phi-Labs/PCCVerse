# Lossless GC Pack — Step 9 status

## Done
- Calgary (18 files) vs true8b Path A / gzip-9 / bzip2-9 / xz-9
- Canterbury (11 files) same matrix
- All true8b round-trips passed
- JSON: `true8b_public_bench.json`

## Ratios (honest)
| Corpus     | true8b Path A | gzip-9 | bzip2-9 | xz-9  |
|------------|---------------|--------|---------|-------|
| Calgary    | 64.5%         | 32.6%  | 26.6%   | 27.2% |
| Canterbury | 45.2%         | 26.0%  | 19.3%   | 17.5% |

true8b Path A is a residual specialist — does **not** beat xz/bzip2 on general text.

## Still open
- enwik8 (100 MB) — not present in sandbox
- Optional: stamp a public-facing markdown table (no 6.03× claims)

## Do not
- Claim 6.03×
- Re-bench sealed ZRW 8B zeros×10k
