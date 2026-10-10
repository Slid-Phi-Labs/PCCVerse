/**
 * Shared NCA: same body for lattice (compression-aware) and cloak (system-aware).
 * Weights come from university graduates — not random per ingest.
 */
export const CHANNELS = 6;
export const VIS = 0;

export function zeros(n) {
  return new Float64Array(n);
}

export function freshWeights(scale = 0.04) {
  const inDim = CHANNELS * 5 + 1;
  const hid = 12;
  const W1 = new Float64Array(hid * inDim);
  const b1 = new Float64Array(hid);
  const W2 = new Float64Array(CHANNELS * hid);
  const b2 = new Float64Array(CHANNELS);
  let s = 0x9e3779b9;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
  for (let i = 0; i < W1.length; i++) W1[i] = rnd() * scale;
  for (let i = 0; i < W2.length; i++) W2[i] = rnd() * scale * 0.5;
  return { inDim, hid, W1, b1, W2, b2 };
}

export function cloneWeights(w) {
  return {
    inDim: w.inDim,
    hid: w.hid,
    W1: Float64Array.from(w.W1),
    b1: Float64Array.from(w.b1),
    W2: Float64Array.from(w.W2),
    b2: Float64Array.from(w.b2),
  };
}

function relu(x) {
  return x > 0 ? x : 0;
}

export function applyNet(w, feat, out) {
  const { inDim, hid, W1, b1, W2, b2 } = w;
  const h = new Float64Array(hid);
  for (let j = 0; j < hid; j++) {
    let a = b1[j];
    const row = j * inDim;
    for (let k = 0; k < inDim; k++) a += W1[row + k] * feat[k];
    h[j] = relu(a);
  }
  for (let c = 0; c < CHANNELS; c++) {
    let a = b2[c];
    const row = c * hid;
    for (let j = 0; j < hid; j++) a += W2[row + j] * h[j];
    out[c] = a;
  }
}

export function makeField(h, w) {
  return { h, w, state: zeros(h * w * CHANNELS) };
}

export function at(field, y, x, c) {
  return field.state[((y + field.h) % field.h) * field.w * CHANNELS + ((x + field.w) % field.w) * CHANNELS + c];
}

export function setAt(field, y, x, c, v) {
  field.state[((y + field.h) % field.h) * field.w * CHANNELS + ((x + field.w) % field.w) * CHANNELS + c] = v;
}

export function perceive(field, cloak, y, x, feat) {
  const offs = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  let p = 0;
  for (const [dy, dx] of offs) {
    for (let c = 0; c < CHANNELS; c++) feat[p++] = at(field, y + dy, x + dx, c);
  }
  feat[p] = cloak ? at(cloak, y, x, VIS) : 0;
}

export function stepField(field, cloak, weights, fire = 1) {
  const { h, w } = field;
  const next = zeros(field.state.length);
  const feat = new Float64Array(weights.inDim);
  const delta = new Float64Array(CHANNELS);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      perceive(field, cloak, y, x, feat);
      applyNet(weights, feat, delta);
      const base = (y * w + x) * CHANNELS;
      for (let c = 0; c < CHANNELS; c++) {
        let v = field.state[base + c] + delta[c] * fire;
        if (v > 1) v = 1;
        if (v < -1) v = -1;
        next[base + c] = v;
      }
    }
  }
  field.state = next;
}

export function paintVisible(field, bytes) {
  const n = Math.min(bytes.length, field.h * field.w);
  for (let i = 0; i < n; i++) {
    const y = Math.floor(i / field.w);
    const x = i % field.w;
    setAt(field, y, x, VIS, bytes[i] / 255);
  }
}

export function readVisible(field, n) {
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    const y = Math.floor(i / field.w);
    const x = i % field.w;
    const v = at(field, y, x, VIS);
    out[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }
  return out;
}

export function shapeFor(n) {
  let h = Math.max(1, Math.floor(Math.sqrt(n)));
  while (n % h !== 0 && h > 1) h--;
  const w = n / h || 1;
  if (h * w !== n) {
    const s = Math.ceil(Math.sqrt(n));
    return { h: s, w: s };
  }
  return { h, w };
}
