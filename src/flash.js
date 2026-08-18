/**
 * Flash: residual of (data − lattice visible), mixed with white noise.
 * The heat of that flash is what imprints the capture swarm.
 */
import { CHANNELS, VIS } from "./nca.js";

export function whiteNoise(n, seed) {
  const out = new Float64Array(n);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out[i] = x / 0xffffffff;
  }
  return out;
}

export function residualField(field, bytes) {
  const n = bytes.length;
  const res = new Float64Array(n);
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const y = Math.floor(i / field.w);
    const x = i % field.w;
    const pred = field.state[(y * field.w + x) * CHANNELS + VIS];
    const t = bytes[i] / 255;
    const d = t - pred;
    res[i] = d;
    energy += d * d;
  }
  return { res, energy: energy / Math.max(1, n) };
}

export function makeFlash(field, bytes, seed = 0xc0ffee) {
  const { res, energy } = residualField(field, bytes);
  const noise = whiteNoise(res.length, seed);
  const mix = new Float64Array(res.length);
  let heat = 0;
  for (let i = 0; i < res.length; i++) {
    const v = res[i] * 0.85 + (noise[i] * 2 - 1) * 0.15 * Math.sqrt(energy + 1e-6);
    mix[i] = v;
    heat += v * v;
  }
  heat = Math.sqrt(heat / Math.max(1, res.length));
  let imprint = seed >>> 0;
  for (let i = 0; i < mix.length; i++) {
    imprint = (Math.imul(imprint ^ Math.round((mix[i] + 1) * 1000), 16777619) + i) >>> 0;
  }
  return { seed, energy, heat, residual: res, mixed: mix, imprint };
}

export function applyImprint(field, flashPulse) {
  const n = flashPulse.residual.length;
  for (let i = 0; i < n; i++) {
    const y = Math.floor(i / field.w);
    const x = i % field.w;
    const idx = (y * field.w + x) * CHANNELS + VIS;
    field.state[idx] += flashPulse.residual[i];
    if (field.state[idx] > 1) field.state[idx] = 1;
    if (field.state[idx] < -1) field.state[idx] = -1;
  }
}
