# OFA → TG8 Identity — Step 8 advance

## Goal
OFA eight-man card carries TG8 identity so agents can enter via the play door.

## Identity envelope (OFA)
```json
{
  "cell": "ofa",
  "version": 1,
  "identity": "tg8:ofa:v1",
  "card": {
    "type": "eight-man",
    "slots": 8,
    "status": "studio-local"
  },
  "agent_surface": {
    "enter": "/api/trugame/ofa",
    "rank": null,
    "residual_credit": 0
  }
}
```

## Wire sequence (Host)
1. Confirm OFA eight-man card runs on studio :3700
2. Add `"ofa"` to `TG8_READY` in tg8-agent-door.js
3. Replace placeholder state with live card snapshot
4. Repeat for MMA / NFL / Earth on same spine

## Status
Identity shape defined. Depends on studio-local OFA card + Host mount of agent door.
