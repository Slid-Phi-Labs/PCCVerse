# trustream

[![Audited checks](https://github.com/ceedot-rock/trustream/actions/workflows/audited-checks.yml/badge.svg)](https://github.com/ceedot-rock/trustream/actions/workflows/audited-checks.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

**TRUSTREAM** is lossless compression for live data streams instead of files — built for agent fleets that log every tool call, observability stacks exporting packed telemetry, and on-device recorders (cars, drones, robots) that flush packed traces when they dock. Logs, traces, and telemetry flow through it in small 4 KiB tiles as they arrive: quiet stretches — the long runs of zeros and repetition that fill most logs — pack down small, busy stretches pass through untouched, and playback returns the original bytes, in order. A tile's content never encodes larger than its input (3 bytes of framing overhead per tile), so the stream can never inflate. Dual-licensed AGPL-3.0-or-later OR the Slid Phi Labs Commercial License.

## What TRUSTREAM is

Log volume grows faster than disk prices fall, and most teams pay three times over: to ingest it, to index it, and to keep it. A stream packer turns retention from a cost cliff into a feature — keep everything, pay for the packed size. The archive your auditors and your models both need gets dramatically cheaper to own.

Each tile goes through a short pipeline: the easy patterns first (ZERO), then the math (MATH), then phrase matching (PHRASE, reserved), then storage (STORE). The cheap wins are tried before the expensive ones, so the stream keeps up in real time. And because it is lossless, a replayed event is the exact event — byte for byte.

Frame format: `[tag:1][tile_len:u16 LE][payload]`.

| Tag | Kind | What happens |
|-----|------|--------------|
| 0x00 | ZERO | All-zero tile → empty payload (3 bytes/frame) |
| 0x01 | MATH | Exact u8 ramp → start byte + step (5 bytes/frame) |
| 0x02 | PHRASE | Reserved — encoder never emits |
| 0x03 | STORE | Anything else → raw tile bytes (no expansion) |

## Install

Single file, no dependencies — Python 3 only:

```bash
git clone https://github.com/ceedot-rock/trustream.git
cd trustream
python3 -c "import trustream; print('trustream ready')"
```

## 30-second example

```python
import trustream

# A log stream: long quiet stretches plus some busy content
raw = b"\x00" * 16384 + bytes(range(256)) * 16 + b"error: disk full\n" * 200

packed = trustream.encode_stream(raw)   # pack in 4 KiB tiles
back = trustream.decode_stream(packed)  # playback: original bytes, in order

assert back == raw
print(f"raw {len(raw)} bytes -> packed {len(packed)} bytes")
# raw 21680 bytes -> packed 1220 bytes
```

Quiet tiles shrink, busy tiles are stored as-is, and a tile's content never
encodes larger than its input — the stream can never inflate.

## Test

```bash
python3 test_trustream.py
```

## From the same lab

- **AwLPay** — multi-rail agent payments (USDC x402 on Base and Solana, PayPal sandbox bridge): https://github.com/ceedot-rock/awlpay
- **agenTill** — drop-in payment box that turns any online product into a storefront agents can buy from: https://github.com/ceedot-rock/agenTill
- **ExactOdds** — provably-fair game math, byte-identical rules across five languages: https://github.com/ceedot-rock/exactodds
- **TNSSRC** — local lossless compression engine (Silesia 43,724,575 bytes, 12/12 decode+SHA verified): https://github.com/ceedot-rock/neural-pcc
- **pulsar** — free local best-path compressor (GPLv3 demo, not PCC): https://github.com/ceedot-rock/pulsar-best
- **Chamber** — two-key JSON sealing for secrets: https://github.com/ceedot-rock/json-chamber-sdk
- Lab site: https://www.slidphilabs.com · Contact: corey@slidphilabs.com

## License

TRUSTREAM is dual-licensed AGPL-3.0-or-later OR the Slid Phi Labs Commercial
License (see [LICENSE](LICENSE)).
