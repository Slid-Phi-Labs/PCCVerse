# S2S6 ANS Gaps

Interactive demo of **Zeckendorf / Tribonacci gap encoding** plus **ANS (Asymmetric Numeral Systems)** entropy coding.

## Idea

Classic Fibonacci bitmaps pay ~1 bit per scanned position. After Zeckendorf, the *gaps* between used positions are tiny and skewed (mean ≈ 2.7, P(g=2)≈0.5). Encoding those gaps with rANS costs ~1.2 bits per gap and closes most of the remaining distance to the Shannon bound.

At M = 10,000:

| Scheme | Avg bits |
|--------|----------|
| Shannon lower bound | 13.29 |
| Classic Fib bitmap | 18.23 |
| Hybrid + ANS gaps | **14.80** (~18.8% better than classic) |

## Open the demo

Open [`s2s6_ans_gaps.html`](./s2s6_ans_gaps.html) in a browser (self-contained, no build step).

Or view via GitHub Pages once enabled: raw file works offline too.

## Pipeline

```
N → Zeckendorf positions → gaps (≥2) → rANS over gap frequencies
```

## Repo notes

- Public under `ceedot-rock/s2s6-ans-gaps`
- Standalone HTML (no React bundle); same math and benchmark numbers as the original S2S6 artifact
