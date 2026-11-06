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

The signed box is the demo. Tamper → HALT.

```bash
node cli.js run
node cli.js gate
node cli.js demo
node test.js
```

Credit: **Powered by TRU8 · Slid Phi Labs**

## What this demo proves

| Sheet | Winner in this repo | vs brotli-11 |
|---|---|---|
| zeros / ramp int32 | public 8–13 B recipe | wins |
| walk ±1 | 2nd-difference leftover | wins (133 vs 9,145) |
| Calgary bib / book1 / paper1 | LZ + order-2 leftover + Huffman | **beats gzip**, loses to brotli |

Gate Year ($790) is the mixed-file SKU. This repo is the residual membrane + demos.

## Not a codec — in-session replay only

`ingest` returns an `imprint` number, but the imprint is a **session
handle, not a compressed bitstream**. The source bytes (plus a decode
closure over the routed existing engine's payload) stay in the live
swarm members' process memory, and `replayFromMemory(machine, imprint)`
replays that same session's memory. A fresh machine, a restarted
process, or a bare imprint number copied from elsewhere **cannot**
reproduce the bytes — it throws. The old name `restore` was removed
because it sounded like a codec decode step.

What IS portable: the `payload` + `engine` fields returned by `ingest`
(zrw / gzip-9 / brotli-11 / rdom / stroke-ls), decodable with that
existing engine. What is NOT portable: the `imprint`.

Boundary pinned by [`test/memory-boundary.test.js`](test/memory-boundary.test.js).

## Black box

24-hour eval on first run (`~/.swarm-smart/blackbox.json`). Demos stay free. Production residual is a paid seat — Lab Pass $1,088 or TRU8 Year $990.

## Buy

- Gate Year $790 — https://buy.stripe.com/7sY4gA6Jfapy1GZ8gw6wE0G
- TRU8 Year $990 — https://buy.stripe.com/dRmaEY6Jf1T23P78gw6wE0E
- Chamber Year $490 — https://buy.stripe.com/dRmeVeaZv7dm99rcwM6wE0F
- Lab Pass $1,088 — https://buy.stripe.com/3cI7sM2sZ0OYfxP7cs6wE0D

Inbox: corey@slidphilabs.com
