# pulsar

[![Audited checks](https://github.com/ceedot-rock/pulsar-best/actions/workflows/audited-checks.yml/badge.svg)](https://github.com/ceedot-rock/pulsar-best/actions/workflows/audited-checks.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](./LICENSE)

**pulsar** is a free local lossless compressor from Slid Phi Labs — for anyone
who wants an open, inspectable best-path compressor on their own machine: no
hosted service, no license gate to run it. On the 12-file Silesia corpus it
packs to 55,745,438 bytes (decode+SHA verified 12/12), beating gzip -9 and
losing to bzip2 -9 and xz -6 — an honest mid-field demo of the lab's compression
work, not the hosted PCC product. GPL-3.0-or-later.

Own-only lossless compressor. **Core-Lite.** Public source for official benches.

Public name is **pulsar**. The GitHub repo is still `ceedot-rock/pulsar-best`.

Copyright (c) 2026 Corey Tasz / Slid Phi Labs.

**Silesia (12 files, individually):** **55,745,438** bytes of 211,938,580 (0.2630).  
DECODE_OK 12/12. Beats gzip-9 12/12. Loses to bzip2-9 (+1.24M) and xz-6 (+6.3M).

Not a rank claim against paq8px, cmix, or zpaq. This is **not** the hosted **PCC** product. AWARE is a retired alias. The private encoder is not in this tree.

## What this is

Compressor A (demonstrator). BW22 / OZL2 / PZ22 picker. No taught residual core.

## What this is not

- Not the hosted PCC product
- Not a retired AWARE SKU
- Not the Drive-lock encoder (dickens 243,675 is a reference constant, not this output)
- Not Autonoma / Blackjack production

This tree is **GPL-3.0-or-later** from 2.4.0 (MIT through 2.3.1). Closed-source embedding: [COMMERCIAL.md](COMMERCIAL.md). The private encoder stays proprietary. Commercial inquiries: Slid Phi Labs / Corey Tasz. Licensing: https://www.slidphilabs.com/licensing.json

## Official packet

See [OFFICIAL/](OFFICIAL/). 2.5.0 (55,745,438) was emailed to Matt Mahoney for OSCB on 2026-09-02. Do not send another line until a live total beats that. Table name is **pulsar**, not pulsar-best.

Last full Silesia (2.5.0): **55,745,438** / 211,938,580. gzip-9 67,631,990. bzip2-9 54,506,769. xz-6 ~49.4M.

Note: `BENCH_SILESIA_CALGARY.csv`'s per-file `pulsar` column is the 2.3.0 breakdown (sums to 56,654,942) and was never refreshed for 2.5.0 — the 55,745,438 headline is the externally verified OSCB submission, not reproducible from that CSV.

Industry calibration: gzip -9 = 67,631,990; bzip2 = 54,506,769.

## Build

```
cargo test --lib
cargo run --release --bin pulsar -- encode IN -o OUT
cargo run --release --bin pulsar -- decode OUT -o BACK
```

## License

**2.4.0+ : GPL-3.0-or-later.**  
2.3.1 and earlier snapshots remain MIT. See `LICENSE` and `LICENSE-CHANGE.md`.

## From the same lab

- **TNSSRC** — local lossless compression engine (Silesia 43,724,575 bytes, 12/12 decode+SHA verified): https://github.com/ceedot-rock/neural-pcc
- **TRUSTREAM** — lossless compression for live data streams in 4 KiB tiles: https://github.com/ceedot-rock/trustream
- **AwLPay** — multi-rail agent payments (USDC x402 on Base and Solana, PayPal sandbox bridge): https://github.com/ceedot-rock/awlpay
- **agenTill** — drop-in payment box that turns any online product into a storefront agents can buy from: https://github.com/ceedot-rock/agenTill
- **ExactOdds** — provably-fair game math, byte-identical rules across five languages: https://github.com/ceedot-rock/exactodds
- **Chamber** — two-key JSON sealing for secrets: https://github.com/ceedot-rock/json-chamber-sdk
- Lab site: https://www.slidphilabs.com · Licensing: https://www.slidphilabs.com/licensing.json
