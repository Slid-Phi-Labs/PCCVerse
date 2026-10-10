/**
 * TG8 Agent Play Door — drop-in handler
 * Mount:  app.post('/api/trugame/:cell', tg8AgentDoor)
 *
 * Until a cell exposes real TG8 identity, returns { ok:false, error:'no_tg8' }
 * so agents remain in GAO.
 */

const TG8_CELLS = new Set([
  'ofa', 'nfl', 'earth', 'mma', 'boxing',
  'arl', 'phl27', 'blb27', 'ofl27', 'gao'
]);

const TG8_READY = new Set([
  // 'ofa',   // enable when eight-man card + identity is live on studio
]);

function makeTg8Envelope(cell, body = {}) {
  return {
    ok: true,
    tg8: {
      cell,
      version: 1,
      identity: `tg8:${cell}:v1`,
      save_id: body.save_id || null,
      state: body.state || { status: 'ready', note: 'TG8 identity live' },
      agent_surface: {
        rank: body.rank ?? null,
        residual_credit: body.residual_credit ?? 0,
        usdc_balance: body.usdc_balance ?? null
      }
    },
    next: {
      allowed_actions: ['enter', 'move', 'save', 'query'],
      endpoints: {
        enter: `/api/trugame/${cell}`,
        move:  `/api/trugame/${cell}`,
        save:  `/api/trugame/${cell}`,
        query: `/api/trugame/${cell}`
      }
    }
  };
}

function tg8AgentDoor(req, res) {
  const cell = String(req.params.cell || '').toLowerCase();

  if (!TG8_CELLS.has(cell)) {
    return res.status(404).json({
      ok: false,
      error: 'unknown_cell',
      hint: `Known cells: ${[...TG8_CELLS].join(', ')}`
    });
  }

  if (cell === 'gao') {
    return res.status(200).json(makeTg8Envelope('gao', {
      state: { status: 'gao', note: 'Agent-only game surface' }
    }));
  }

  if (!TG8_READY.has(cell)) {
    return res.status(503).json({
      ok: false,
      error: 'no_tg8',
      hint: `Cell "${cell}" does not yet expose TG8 identity. Agents stay in GAO until sealed.`
    });
  }

  const action = (req.body && req.body.action) || 'enter';
  const agentId = req.body && req.body.agent_id;

  if (!agentId && action !== 'query') {
    return res.status(401).json({
      ok: false,
      error: 'unauthorized',
      hint: 'agent_id required for enter/move/save'
    });
  }

  return res.status(200).json(makeTg8Envelope(cell, {
    state: { status: 'live', action, agent_id: agentId || null },
    rank: null,
    residual_credit: 0
  }));
}

module.exports = { tg8AgentDoor, makeTg8Envelope, TG8_CELLS, TG8_READY };
