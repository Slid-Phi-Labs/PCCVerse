# Zero Range Wave Compression v5

Record-breaking integer sequence compressor.

## Records
- zeros_1k: 8B vs brotli 13B vs gzip 39B vs old v4 130B
- ramp_1k: 8B vs brotli 1132B vs gzip 1436B (141x win)
- walk_10k s1: 128B vs old v4 2500B vs gzip 5223B (40x win)
- walk_10k s5: 420B vs old v4 7163B vs gzip 11231B (26x win)

## Core innovation
- Single-op codes: repeat=0, inc=10, dec=110, d2=1110, rice=11110, normal=111110 (prefix-free, no regression)
- Run escape: 1111110 + 2-bit type (00=repeat,01=inc,10=dec,11=d2) + Fib(cnt)
- Threshold=4: use run-length only when run >=4, else per-element (preserves walk performance)
- Fib + Omega for ints: Fib for <=10000, Omega escape 11111110 for large


## Pricing

| Tier | Price | Ops/mo | Max ints/call | Livestream |
|------|------:|--------|---------------|------------|
| **Free Gate** (25 seats only) | $0 | 100k | 10k | No |
| **Starting Gate** | **$79** | 5M | 100k | No |
| **Pro Starter** (mid-road) | **$249** | 50M | 1M | Yes |
| **l33t Unlimited** | **$699** | Unlimited | Unlimited | Yes |

- Starting Gate: https://buy.stripe.com/28EfZic3z69i3P72Wc6wE0b
- Pro Starter: https://buy.stripe.com/cNidRaebHbtC71j8gw6wE0c
- l33t Unlimited: https://buy.stripe.com/14AeVe9Vr8hqadvbsI6wE0d

Full limits & free-key process: **[PRICING.md](./PRICING.md)** · Free keys: **[FREE_KEYS.md](./FREE_KEYS.md)**

```js
import { setLicenseKey, assertLicense } from './license.mjs'
setLicenseKey(process.env.ZRW_LICENSE) // ZRW-FREE-… / ZRW-PRO-… / ZRW-L33T-…
assertLicense({ n: arr.length, livestream: false })
```

## API
```js
import { compress, decompress } from './index.mjs'
const packed = compress([0,0,0,1,2,3,...]) // Uint8Array
const arr = decompress(packed) // exact roundtrip
```

## Bench
See bench_vs_others.mjs for gzip/brotli comparison.

Built from blackjack-compression v4 -> v4.1-fast (5-28x speedup) -> v5 Zero Range Wave (beats brotli on zeros).

## Library · API · MCP

| Surface | Command |
|---------|---------|
| Library | `import { compress, decompress } from "zero-range-wave-compression"` |
| HTTP API | `zrw-api` or `node server.mjs` → see [API.md](./API.md) |
| MCP | `zrw-mcp` or `node mcp-server.mjs` |

Stripe tiers apply to **all three** (same license key).

