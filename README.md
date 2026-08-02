# Zero Range Wave Compression (ZRW) v5

[![site](https://img.shields.io/badge/site-slidphilabs.vercel.app-blue)](https://slidphilabs.vercel.app)
[![GitHub](https://img.shields.io/badge/github-ceedot--rock%2Fzero--range--wave--compression-black)](https://github.com/ceedot-rock/zero-range-wave-compression)
[![version](https://img.shields.io/badge/version-5.0.1-teal)](https://github.com/ceedot-rock/zero-range-wave-compression/releases)

**Pure-JavaScript integer compressor that beats gzip and brotli on zeros, ramps, and walks.**

Zero Range Wave is a specialized lossless codec for integer sequences. It is designed for sensor data, counters, scores, time-series deltas, and any stream that contains long runs, smooth ramps, or small random walks. On those patterns it routinely produces dramatically smaller output than general-purpose compressors.

| Input | ZRW packed | vs brotli | vs gzip | Win |
|-------|------------|----------|---------|-----|
| zeros × 1 000 | **8 B** | 13 B | 39 B | clear win |
| ramp × 1 000 | **8 B** | 1 132 B | 1 436 B | **~141×** |
| walk 10k (step 1) | **128 B** | — | ~5 223 B | **~40×** |
| walk 10k (step 5) | **420 B** | — | ~11 231 B | **~26×** |

Full encode/decode round-trip. Library + HTTP API + MCP server.

## Install

```bash
npm i zero-range-wave-compression
```

[npm package](https://www.npmjs.com/package/zero-range-wave-compression) · Node ≥ 18 · ESM only.

Git install (optional): `npm i github:ceedot-rock/zero-range-wave-compression`

## Quick start

```js
import { compress, decompress, setLicenseKey } from "zero-range-wave-compression";

// Free Gate or paid key
setLicenseKey(process.env.ZRW_LICENSE); // ZRW-FREE-… / ZRW-START-… / ZRW-PRO-… / ZRW-L33T-…

const packed = compress([0, 0, 0, 1, 2, 3, 4, 5]); // Uint8Array
const back = decompress(packed);                   // exact round-trip
```

## Why it wins on these patterns

- Single-op prefix-free codes for the common cases (repeat, ±1, second difference, Rice, fallback)
- Run-length escape only when a run is long enough (threshold = 4) so short walks stay fast
- Fibonacci coding for small integers, Elias ω escape for large values
- No dictionary warmup cost — excellent on short and medium sequences

## Pricing (one-time license)

| Tier | Price | Ops / month | Max ints / call | Livestream |
|------|------:|-------------|-----------------|------------|
| **Free Gate** (25 seats) | $0 | 100 k | 10 k | No |
| **Starting Gate** | **$79** | 5 M | 100 k | No |
| **Pro Starter** | **$249** | 50 M | 1 M | Yes |
| **l33t Unlimited** | **$699** | Unlimited | Unlimited | Yes |

- [Starting Gate](https://buy.stripe.com/28EfZic3z69i3P72Wc6wE0b)
- [Pro Starter](https://buy.stripe.com/cNidRaebHbtC71j8gw6wE0c)
- [l33t Unlimited](https://buy.stripe.com/14AeVe9Vr8hqadvbsI6wE0d)

Details: [PRICING.md](./PRICING.md) · Free key process: [FREE_KEYS.md](./FREE_KEYS.md)

## Surfaces

| Surface | How |
|---------|-----|
| Library | `import { compress, decompress } from "zero-range-wave-compression"` |
| HTTP API | `npx zrw-api` or `node server.mjs` → [API.md](./API.md) |
| MCP | `npx zrw-mcp` or `node mcp-server.mjs` |

Same license key works for all three.

## Related packages (SlidPhiLabs)

| Package | Role |
|---------|------|
| [blackjack-compression](https://www.npmjs.com/package/blackjack-compression) | General-purpose pure-JS compressor (Fib / Rice / ω / LZ77) |
| [shard-zip](https://www.npmjs.com/package/shard-zip) | Adaptive Fibonacci + Blackjack V2 |
| [slid-phi](https://www.npmjs.com/package/slid-phi) | Omni-Dormant integer codecs |
| [shard-tsdb](https://www.npmjs.com/package/shard-tsdb) | Time-series DB using this family |
| [CuNi Studio](https://cuni-studio.fly.dev/) | Exact multi-target code playground |

Site: [slidphilabs.vercel.app](https://slidphilabs.vercel.app)

## License

Commercial license (see PRICING.md). Free Gate limited to 25 evaluation seats.
