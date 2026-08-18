/**
 * University: graduate pre-trained NCAs.
 * Lattice grads learn to match data on the visible channel.
 * Cloak grads learn a field that tracks residual (system-aware).
 */
import {
  CHANNELS,
  VIS,
  freshWeights,
  cloneWeights,
  applyNet,
  makeField,
  paintVisible,
  perceive,
  stepField,
  shapeFor,
} from "./nca.js";

function mseVisible(field, bytes) {
  let e = 0;
  const n = bytes.length;
  for (let i = 0; i < n; i++) {
    const y = Math.floor(i / field.w);
    const x = i % field.w;
    const pred = field.state[(y * field.w + x) * CHANNELS + VIS];
    const t = bytes[i] / 255;
    const d = pred - t;
    e += d * d;
  }
  return e / Math.max(1, n);
}

function perturb(w, mag) {
  const o = cloneWeights(w);
  const bump = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      const u = Math.sin(i * 12.9898 + mag * 78.233) * 43758.5453;
      arr[i] += (u - Math.floor(u) - 0.5) * mag;
    }
  };
  bump(o.W1);
  bump(o.W2);
  bump(o.b1);
  bump(o.b2);
  return o;
}

function grow(bytes, latticeW, cloakW, steps) {
  const { h, w } = shapeFor(bytes.length);
  const lat = makeField(h, w);
  const cloak = makeField(h, w);
  paintVisible(lat, bytes);
  for (let t = 0; t < steps; t++) {
    stepField(cloak, lat, cloakW, 0.4);
    stepField(lat, cloak, latticeW, 0.55);
  }
  return { lat, cloak, err: mseVisible(lat, bytes) };
}

export function curriculum() {
  const blocks = Buffer.alloc(64, 0);
  const ramp = Buffer.alloc(64);
  for (let i = 0; i < 64; i++) ramp[i] = i * 4;
  const stripe = Buffer.alloc(64);
  for (let i = 0; i < 64; i++) stripe[i] = i % 8 < 4 ? 220 : 20;
  const text = Buffer.from("swarm-smart dna 123 lattice cloak flash imprint!!");
  return [blocks, ramp, stripe, text];
}

export function graduate({ steps = 3, rounds = 80, mag = 0.035 } = {}) {
  let lattice = freshWeights(0.05);
  let cloak = freshWeights(0.05);
  const set = curriculum();
  let best = Infinity;
  for (let r = 0; r < rounds; r++) {
    const candL = perturb(lattice, mag * (1 - r / rounds));
    const candC = perturb(cloak, mag * (1 - r / rounds));
    let e = 0;
    for (const item of set) e += grow(item, candL, candC, steps).err;
    e /= set.length;
    if (e < best) {
      best = e;
      lattice = candL;
      cloak = candC;
    }
  }
  return {
    lattice,
    cloak,
    err: best,
    diploma: { rounds, steps, graduated: true },
  };
}

export { mseVisible, grow };
