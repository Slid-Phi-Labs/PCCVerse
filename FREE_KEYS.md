# Free Gate — 25 license allotment

**Cap: 25 free keys total.** Do not issue key #26 as free.

## Issue process (publisher)

1. Applicant emails **ceedotrock@gmail.com** with subject `ZRW FREE` and intended use.
2. Confirm remaining slots: `25 - issued_count`.
3. Generate key: `ZRW-FREE-<random8+>` (see `scripts/issue-free-key.mjs`).
4. Append to `FREE_KEYS_ISSUED.json` (private; do not publish).
5. Email key + limits (100k ops/mo, 10k ints/call, no livestream, non-commercial).

## Key format

```
ZRW-FREE-XXXXXXXX
ZRW-START-XXXXXXXX   # after Starting Gate payment
ZRW-PRO-XXXXXXXX     # Pro Starter
ZRW-L33T-XXXXXXXX    # l33t Unlimited
```

Paid keys issued after Stripe receipt (payment links in `PRICING.md`).
