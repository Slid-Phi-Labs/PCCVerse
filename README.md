# swarm-smart

Public residual + swarm demo from **Slid Phi Labs**.

```
data → Lattice (NCA grads) ← Cloak
     → flash leftover
     → Capture / Routing / Memory
     → existing engines (public zeros/ramp, d2 walk, LZ leftover)
```

Not #1 general compressor. [SALE.md](SALE.md) · [PROTOCOL.md](PROTOCOL.md)

## Run

```bash
node cli.js demo
node cli.js gate
node test.js
node bench-dominant.js
```

Credit: **Powered by TRU8 · Slid Phi Labs**

## What this demo proves

| Sheet | Winner in this repo | vs brotli-11 |
|---|---|---|
| zeros / ramp int32 | public 8–13 B recipe | wins |
| walk ±1 | 2nd-difference leftover | wins (133 vs 9,145) |
| Calgary bib / book1 / paper1 | LZ + order-2 leftover + Huffman | **beats gzip**, loses to brotli |

Gate Year ($790) is the mixed-file SKU. This repo is the residual membrane + demos.

## Black box

24-hour eval on first run (`~/.swarm-smart/blackbox.json`). Demos stay free. Production residual is a paid seat — Lab Pass $1,088 or TRU8 Year $990.

## Buy

- Gate Year $790 — https://buy.stripe.com/7sY4gA6Jfapy1GZ8gw6wE0G
- TRU8 Year $990 — https://buy.stripe.com/dRmaEY6Jf1T23P78gw6wE0E
- Chamber Year $490 — https://buy.stripe.com/dRmeVeaZv7dm99rcwM6wE0F
- Lab Pass $1,088 — https://buy.stripe.com/3cI7sM2sZ0OYfxP7cs6wE0D

Inbox: corey@slidphilabs.com
