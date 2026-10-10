# Freemium Conversion Instrumentation — Step 6

## Goal
First measurable free 100 GB → paid conversion signal + simple dashboard note.

## Events to emit
| Event | When | Properties |
|-------|------|------------|
| `suite_free_start` | first free job | agent_id?, bytes |
| `suite_free_progress` | each free job | bytes_used, bytes_remaining |
| `suite_free_exhausted` | hits 100 GB | total_bytes |
| `suite_paid_start` | first paid job after free | product, checkout_id |
| `suite_conversion` | free → paid within 7d | days_to_convert, bytes_free_used |

## Minimal counter (file / Redis / Supabase)
```
suite:{agent|ip}:bytes_used
suite:{agent|ip}:converted_at
```

## Dashboard note (one-pager)
- Free users active (last 24h)
- Free GB consumed
- Conversions (count + rate)
- Top conversion product (Lab Pass / TRU8 Year / Suite meter)

## Stub
See `conversion-stub.js`. Emit events to stdout / webhook until Host wires analytics.

## Host still needs
- Persist counters
- Simple internal dashboard page or Notion rollup
- Wire into actual /api/process or suite meter path

## Status
Design + stub ready 2026-08-17.
