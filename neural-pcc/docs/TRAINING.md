# riser training — status: trained (riser-v2, 2026-10-18)

The shipped C riser (`src/riser.c`, `model_init`) now loads trained int16
tables from `src/riser_weights.h` when present, else falls back to the
portable-LCG riser-v1 (`seed 0x52495331`). Wiring: `riser.c` includes the
(dead-until-now) `src/riser_bind.inc` via `__has_include`, so no build-system
change was needed; `make test` covers both paths (header present / removed).

## Recipe (reproducible)

- Corpus: `train/train_riser.py::build_corpus()` — zeros, runs, fox,
  xml-ish, logs, json, ramps = exactly 314,260 bytes, seed `0x52495331`.
- Model: exact C `net_logits` form in normalized units
  (CTX=8, HID=16, F=9; 4,512 params).
- Runs (Modal T4, `train/modal_riser_train.py`):
  SGD 4000 steps x batch 32 lr 0.03 → CE 5.55 → 3.48;
  +SGD 4000 lr 0.01 → 3.43; +Adam 3000 lr 0.003 → 3.31.
  (Lab note said 4.86 → 3.07; the HID=16 net plateaus near 3.3. Kept HID=16:
  it is the shipped ABI, not a tunable.)
- Quantize: `train/quantize_riser.py`. Objective is DEPLOYED codelength
  (bit-exact Python sim of `mixed_freqs`+`normalize`+1:7 mixer → ideal bits),
  NOT softmax CE — the deployed d+4096 map clips, so CE picks bad scales
  (quantized CE 4.3–5.0 at the same scales that give the best deployed bits).
  Picked S1=128, logit spread 24000.
- Artifact: `train/riser_v2_float.json` (float weights + metrics).

## Result (A/B, `bin/npcc bench <file> riser`, roundtrip ok=true everywhere)

| input | trained packed | LCG packed | delta |
| fox 49,152 | 28,816 | 30,112 | −4.3% |
| json 49,152 | 27,641 | 30,207 | −8.5% |
| logs 65,536 | 38,625 | 41,447 | −6.8% |
| ramps 19,348 | 18,953 (net path) | 19,374 (fell back to RAW) | −2.2% |
| runs 32,768 | 28,774 | 31,040 | −7.3% |
| xml 65,536 | 41,178 | 43,934 | −6.3% |
| zeros 32,768 | 469 | 1,275 | −63% |
| full 314,260 | 222,283 | 250,597 | −11.3% |

Deployed-ideal sim agreed: trained 5.73 vs LCG 6.38 bits/byte (held-out).

## Known cost: encode/decode speed

Trained net is ~2–3x slower per byte (full: enc 17.3s vs 7.1s, dec
22.1s vs 6.4s). Root cause measured in sim: `normalize()`'s
`while (acc > FREQ_SUM)` max-scan fix-up averages 182 iters/symbol with
trained weights vs 14 with LCG (flatter `nc` → more clamped-to-1 symbols →
bigger overshoot). Fix belongs in C (e.g. proportional fix-up, no rescan),
not in the weights — retraining is not needed. Sharper calibrations
(spread 48000: 113 iters) trade ~2.5% ratio for speed; kept the
ratio-optimum.

## Out of scope (deliberately not trained)

Library-wide sweep (`stub|untrained|never committed|session artifact|not
implemented here` over `src/`): riser-v2 was the only genuine
meant-to-be-trained item. The rest:

- `settleOnchain` stub (Agent-Rider toll-3) — intentional safety stub: no
  real USDC moves without per-charge x402 approval. Must stay a stub.
- toll-5 default byte-compare — test double, fine as-is.
- slid-phi 2.2.x "stub" note (teachaid) — version gate, not ML.
- Retired host skins / private-encoder notes — retired content,
  not missing training.
