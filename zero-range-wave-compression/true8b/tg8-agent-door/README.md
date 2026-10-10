# TG8 Agent Play Door (Step 10)

```
POST /api/trugame/:cell  →  TG8 identity envelope
```

Until a cell is listed in `TG8_READY`, the door returns `no_tg8` and agents stay in **GAO**.

## Install on Host
```js
const { tg8AgentDoor } = require('./tg8-agent-door');
app.post('/api/trugame/:cell', tg8AgentDoor);
```
Then add cells to `TG8_READY` as each receives TG8 identity (start with `ofa`).

## Files
- `TG8_AGENT_DOOR.md` — full contract
- `tg8-agent-door.js` — drop-in Express/Node handler

## Acceptance
- [x] Contract defined
- [x] Drop-in handler written
- [ ] Mounted on Host
- [ ] At least one cell (OFA) added to TG8_READY
