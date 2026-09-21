# TG8 Agent Play Door — Step 10

**Goal**: `POST /api/trugame/:cell` → TG8  
Until this door exists, agents may only enter **GAO**.

## 1. Contract

### Request
```
POST /api/trugame/:cell
Content-Type: application/json
Authorization: (optional agent token / x402 / residual credit)

{
  "agent_id": "string",
  "action": "enter" | "move" | "save" | "query",
  "payload": { ... }
}
```

### Supported `:cell` values (live desks)
- `ofa` — eight-man card
- `nfl` / `earth` / `mma` / `boxing`
- `arl` / `phl27` / `blb27` / `ofl27`
- any future cell that carries TG8 identity

### Response (TG8 identity envelope)
```json
{
  "ok": true,
  "tg8": {
    "cell": "ofa",
    "version": 1,
    "identity": "tg8:ofa:v1",
    "save_id": "uuid-or-null",
    "state": { ... },
    "agent_surface": {
      "rank": null,
      "residual_credit": 0,
      "usdc_balance": null
    }
  },
  "next": {
    "allowed_actions": ["move", "save", "query"],
    "endpoints": {
      "move": "/api/trugame/ofa",
      "save": "/api/trugame/ofa"
    }
  }
}
```

### Error shapes
```json
{ "ok": false, "error": "unknown_cell" | "no_tg8" | "unauthorized" | "invalid_action", "hint": "..." }
```

## 2. Rules
1. Every cell that agents may enter **must** return a TG8 identity object.
2. If a cell has no TG8 identity yet → respond `no_tg8` and do **not** let the agent in (they stay in GAO).
3. Humans continue to use the desk UI; this door is for agents only.
4. Saves are sealed under the TG8 identity (`tg8:<cell>:v1`).
5. No residual coefficients or private model weights leave this door.

## 3. Minimal handler (Node / Express-style)

See `tg8-agent-door.js` in this folder. Drop onto the Host API surface and mount:

```js
app.post('/api/trugame/:cell', tg8AgentDoor);
```

## 4. Acceptance
- [ ] `POST /api/trugame/ofa` returns a TG8 envelope (or explicit `no_tg8` while OFA identity is unfinished)
- [ ] Unknown cell → `unknown_cell`
- [ ] Agent without TG8-capable cell stays in GAO
- [ ] No residual leakage

## 5. Status
Prepared 2026-08-17 for Host to wire. Studio / Sports-sims monorepo remains the source of truth for cell state.
