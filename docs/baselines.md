# Public baseline table (Aware residual vs gzip / zlib / bzip2 / xz)

Note: zstd/lz4 were not available in the measurement environment.
Aware = best of T_ZERO / RLE / Δ2+RLE / entropy estimate (public residual pathways).
Lower is better.

| Name | Size | Aware | gzip-9 | zlib-9 | bzip2-9 | xz-6 |
|---|---:|---:|---:|---:|---:|---:|
| pure_zeros_64k | 65,536 | 8 | 96 | 84 | 43 | 140 |
| prod_logs | 283,510 | 170,659 | 9,807 | 9,795 | 6,333 | 5,168 |
| json_rep | 24,800 | 13,164 | 168 | 156 | 175 | 184 |
| code_rep | 21,600 | 13,413 | 188 | 176 | 245 | 200 |
| floats | 12,000 | 10,497 | 7,653 | 7,641 | 6,089 | 3,800 |
| random | 8,192 | 101 | 365 | 353 | 702 | 348 |
| calgary/paper1 | 53,161 | 33,120 | 18,536 | 18,524 | 16,558 | 17,280 |
| calgary/bib | 80,000 | 51,964 | 25,596 | 25,584 | 20,757 | 22,972 |

Honest read: specialty pathways win hard on pure zeros and low-entropy random structure; general compressors win on rich text/logs. Full LZ+ANS native path is the product target for closing that gap.
