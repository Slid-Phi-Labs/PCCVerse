# Contributing to zero-range-wave-compression

Thanks for helping make Zero Range Wave better.

## Ground rules

- The codec is lossless. `decompress(compress(x))` must be **bit-identical**
  to `x` for every input — a change that breaks the roundtrip is a bug,
  not a tradeoff.
- Integer math only in the codec path. No floats in `compress`/`decompress`.
- The license gates stay enforced: do not touch `license.mjs`,
  `license-box.mjs`, tier limits, or `assertLicense` behavior without an
  explicit maintainer decision.
- No Slid Phi Labs internal keys, issued license keys, or credentials in
  the repo — `FREE_KEYS_ISSUED.json.example` is schema-only; real keys
  never get committed.

## Quick checks

```sh
npm test             # compress/decompress roundtrip smoke test
node --check index.mjs
```

CI runs these on every pull request.

## Making a change

1. Change the smallest surface that fixes or adds the thing.
2. Extend `npm test` (or add a bench note in the PR) for any codec
   behavior change — show before/after byte counts.
3. Run `npm test` — the roundtrip must stay bit-exact.
4. If you touched `server.mjs` or `mcp-server.mjs`, update API.md.
5. Open a pull request using the template.

## Reporting bugs

Use the bug report issue template and include a minimal
`compress` → `decompress` reproduction so the failure can be
verified byte-for-byte.

## Security

See SECURITY.md. Do not open a public issue for a security problem —
use GitHub's private vulnerability reporting instead.

## Licensing

Zero Range Wave is **not** open source. Licensing, tiers, and commercial
terms are in PRICING.md (see also LICENSE_BOX.md). By contributing you
agree your contribution may be distributed under those terms.
