## What changed

<!-- One or two sentences. -->

## Components touched

<!-- e.g. index.mjs, server.mjs, mcp-server.mjs, license.mjs / license-box.mjs,
          bin/zrw-api.mjs, PRICING.md, or "docs only" -->

## Checks

- [ ] `npm test` passes (compress/decompress roundtrip stays bit-exact)
- [ ] `node --check` passes on any touched `.js` / `.mjs` file
- [ ] License gates still enforced (`requireLicense`, tier limits) — no silent unlocks
- [ ] No keys, tokens, or secrets added (see FREE_KEYS_ISSUED.json.example — schema only, never real keys)
- [ ] API surface documented (API.md updated if endpoints changed)
- [ ] PRICING.md updated if any tier, price, or limit changed
