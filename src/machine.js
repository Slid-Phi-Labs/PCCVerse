/**
 * data → Lattice (compression-aware NCA, university grads)
 *      ← Cloak   (system-aware NCA, same university)
 * flash (residual + white noise) heats and imprints Capture
 * Routing + Memory swarms share the imprint
 * mirror: restore must equal source
 */
import { makeField, stepField, shapeFor } from "./nca.js";
import { graduate } from "./university.js";
import { makeFlash } from "./flash.js";
import { spawn, imprintCapture, emulate, mimicAll, roster } from "./swarms.js";
import { routeExisting } from "./existing.js";

export function boot(opts = {}) {
  const grads = opts.grads || graduate(opts.university || {});
  return {
    grads,
    swarms: spawn(opts.perSwarm || 3),
    last: null,
  };
}

export async function ingest(machine, bytes) {
  const u8 = Buffer.from(bytes);
  const { h, w } = shapeFor(u8.length);
  const lat = makeField(h, w);
  const cloak = makeField(h, w);

  const steps = 3;
  for (let t = 0; t < steps; t++) {
    stepField(cloak, lat, machine.grads.cloak, 0.4);
    stepField(lat, cloak, machine.grads.lattice, 0.55);
  }

  const pulse = makeFlash(lat, u8);
  const existing = await routeExisting(u8);
  const stamp = imprintCapture(machine.swarms, pulse, machine.grads, {
    n: u8.length,
    h,
    w,
    recipe: existing,
  });

  const restored = emulate(machine.swarms, stamp.imprint, steps);
  const miss = mirrorMiss(u8, restored);
  const ok = miss === 0 && existing.rt;
  machine.last = {
    imprint: stamp.imprint,
    heat: pulse.heat,
    energy: pulse.energy,
    vector: existing.vector,
    engine: existing.engine,
    packed: existing.packed,
    residual_cells: pulse.residual.length,
    cloak_open: ok,
    miss,
    roster: roster(machine.swarms),
  };
  return { ok, ...machine.last, raw: u8.length };
}

export function restore(machine, imprint) {
  if (machine.last && machine.last.cloak_open === false) {
    return { ok: false, error: "cloak-hold" };
  }
  const bytes = emulate(machine.swarms, imprint);
  return { ok: true, bytes };
}

export function faceAll(machine, locus) {
  mimicAll(machine.swarms, locus);
  return roster(machine.swarms);
}

function mirrorMiss(a, b) {
  const n = Math.max(a.length, b.length);
  let m = 0;
  for (let i = 0; i < n; i++) if ((a[i] || 0) !== (b[i] || 0)) m++;
  return m;
}

export { roster };
