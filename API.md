# Zero Range Wave — API & MCP

Same Stripe tiers as the library ([PRICING.md](./PRICING.md)):

| Tier | Price | Livestream API | Buy |
|------|------:|----------------|-----|
| Free Gate (25 keys) | $0 | No | email `ZRW FREE` |
| Starting Gate | $79 | No | https://buy.stripe.com/28EfZic3z69i3P72Wc6wE0b |
| Pro Starter | $249 | Yes | https://buy.stripe.com/cNidRaebHbtC71j8gw6wE0c |
| l33t Unlimited | $699 | Yes | https://buy.stripe.com/14AeVe9Vr8hqadvbsI6wE0d |

Auth for API/MCP: license key `ZRW-FREE-…` / `ZRW-START-…` / `ZRW-PRO-…` / `ZRW-L33T-…`

---

## HTTP API

```bash
npm i -g zero-range-wave-compression
export ZRW_LICENSE=ZRW-PRO-yourkey
zrw-api
# listens PORT=8787
```

Or:

```bash
npx zero-range-wave-compression
# use bin:
node node_modules/zero-range-wave-compression/server.mjs
```

### Routes

| Method | Path | Body | Notes |
|--------|------|------|--------|
| GET | `/health` | — | no auth |
| GET | `/v1/pricing` | — | no auth |
| GET | `/v1/license` | — | Bearer required |
| POST | `/v1/compress` | `{ "values": number[], "k"?: number }` | returns base64 `packed` |
| POST | `/v1/decompress` | `{ "packed": "<base64>" }` | returns `values` |
| POST | `/v1/compress/live` | `{ "values": number[] }` | Pro / l33t |
| POST | `/v1/decompress/live` | `{ "packed": "<base64>" }` | Pro / l33t |

### Auth header

```http
Authorization: Bearer ZRW-PRO-XXXXXXXX
# or
X-ZRW-License: ZRW-PRO-XXXXXXXX
```

### Example

```bash
curl -s http://127.0.0.1:8787/v1/compress \
  -H "Authorization: Bearer ZRW-FREE-SELFTEST01" \
  -H "Content-Type: application/json" \
  -d '{"values":[0,0,0,1,2,3,4]}'
```

Env: `PORT`, `ZRW_LICENSE`, `ZRW_REQUIRE_KEY=0` (allow no key → Free Gate limits), `ZRW_CORS_ORIGIN`.

---

## MCP server

```bash
export ZRW_LICENSE=ZRW-L33T-yourkey
zrw-mcp
# stdio JSON-RPC tools
```

### Tools

- `zrw_compress` / `zrw_decompress`
- `zrw_compress_live` / `zrw_decompress_live` (Pro+)
- `zrw_license_info` / `zrw_pricing`
- `zrw_bench_sample`

### Grok / Claude MCP config sketch

```json
{
  "mcpServers": {
    "zero-range-wave": {
      "command": "npx",
      "args": ["-y", "zero-range-wave-compression", "zrw-mcp"],
      "env": { "ZRW_LICENSE": "ZRW-PRO-…" }
    }
  }
}
```

(If host needs `node path/to/mcp-server.mjs`, point at installed package path.)

---

## Library (same keys)

```js
import { compress, decompress, setLicenseKey, compressLive } from "zero-range-wave-compression";

setLicenseKey(process.env.ZRW_LICENSE);
const packed = compress([0, 0, 1, 2, 3]);
const back = decompress(packed);
```
