# Rider / 402 Surface — Step 5 advance (sandbox)

## Goal
Surface registered Rider contracts in Studio health/UI + finish 402 handling.

## Delivered here
1. **Contract list shape** for Studio health panel
2. **402 response contract** (consistent across dual surfaces)
3. Drop-in stub handlers

### Studio health panel — registered contracts
```json
{
  "contracts": [
    {
      "id": "ctr_...",
      "exactnessPassed": true,
      "exactnessHash": "sha256:...",
      "paths": ["omniwave", "native-compression"],
      "registeredAt": "ISO-8601",
      "status": "live" | "paused"
    }
  ],
  "count": 0
}
```

### 402 Payment Required (dual surface)
```json
{
  "ok": false,
  "error": "payment_required",
  "code": 402,
  "product": "tr8-year" | "lab-pass" | "gate-year" | "suite-meter",
  "checkout": "https://buy.stripe.com/...",
  "pricing_sot": "https://www.slidphilabs.com/pricing.json"
}
```

### Stub (Node)
See `rider-402-stub.js`. Mount:
- `GET  /api/rider/contracts` → list
- `GET  /api/rider/health` → includes contract count + exactness summary
- Any paid route → return 402 envelope when credit exhausted

## Host still needs
- Wire real Supabase `cuni_contracts` read
- Attach 402 middleware to dual surfaces (human desk + agent)
- Studio UI list component

## Status
Sandbox docs + stubs ready 2026-08-17. Host mount required.
