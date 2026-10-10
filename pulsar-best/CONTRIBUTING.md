# Contributing to pulsar

Thanks for helping on the open demonstrator.

## Ground rules

- **Lossless is sacred.** `decode(encode(x))` must be byte-for-byte identical
  to `x` on every input. A roundtrip break stops the line.
- The public name is **pulsar**. The hosted **PCC** product, Combined GC,
  AWARE residuals, and any taught weights live nowhere in this tree —
  never bring them here, not even as comments.
- **2.4.0+ is GPL-3.0-or-later** (2.3.1 and earlier snapshots remain MIT;
  see `LICENSE-CHANGE.md`). By contributing you agree your work in this
  tree is distributed under GPL-3.0-or-later.
- Bench claims are load-bearing: any number you cite must be re-run from
  your branch. The OSCB line (55,745,438 on Silesia, emailed to Matt
  Mahoney 2026-09-02) stays frozen — do not send another line until a live
  total beats it.

## Quick checks

```sh
cargo test --lib        # all 32 unit tests
```

CI also runs a release encode/decode roundtrip on a generated fixture and
requires the SHA-256 of the decoded output to match the input.

## Changing the encode path

1. Edit `src/` — the picker arms live next to the BWT / ANS / LZ code.
2. Run `cargo test --lib`. Every test must pass.
3. Roundtrip a real file yourself:
   `pulsar encode IN -o OUT`, `pulsar decode OUT -o BACK`,
   then `sha256sum IN BACK` — the hashes must match.
4. If you touch benchmarks, re-run Silesia and update `BENCH.md` and the
   README headline from your own numbers. Never copy-paste old figures.
5. Open a pull request using the template.

## Licensing

This tree is **GPL-3.0-or-later** from 2.4.0. See `LICENSE`,
`LICENSE-CHANGE.md`, and `COMMERCIAL.md` (paid exception for closed-source
embedding: corey@slidphilabs.com).
