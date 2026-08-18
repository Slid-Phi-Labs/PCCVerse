/**
 * Capture / Routing / Memory.
 * Capture members are decompress emulators: they hold the flash imprint
 * and replay lattice + cloak + residual to restore bytes.
 * Every member can mimic DNA loci .1 .2 .3.
 */
import { LOCUS, LOCUS_NAME, makeDna, face, allele } from "./dna.js";
import {
  makeField,
  stepField,
  readVisible,
  shapeFor,
} from "./nca.js";
import { applyImprint } from "./flash.js";

const KINDS = ["capture", "routing", "memory"];

export function spawn(gradsPer = 3) {
  const swarms = { capture: [], routing: [], memory: [] };
  const seeds = [0x21, 0x42, 0x63];
  KINDS.forEach((kind, ki) => {
    for (let i = 0; i < gradsPer; i++) {
      const dna = makeDna(`${kind}.${i + 1}`, seeds[i % 3] + ki * 17 + i * 3);
      swarms[kind].push({
        kind,
        seat: i + 1,
        dna: face(dna, ((i + ki) % 3) + 1),
        imprint: null,
        flash: null,
        weights: null,
      });
    }
  });
  return swarms;
}

export function mimic(member, locus) {
  member.dna = face(member.dna, locus);
  return member;
}

export function mimicAll(swarms, locus) {
  for (const kind of KINDS) for (const m of swarms[kind]) mimic(m, locus);
}

export function imprintCapture(swarms, pulse, grads, meta) {
  const route = swarms.routing.reduce((s, m) => s + allele(m.dna), 0) / swarms.routing.length;
  const mem = swarms.memory[0];
  for (const m of swarms.capture) {
    m.imprint = pulse.imprint;
    m.flash = {
      seed: pulse.seed,
      heat: pulse.heat,
      energy: pulse.energy,
      residual: Float64Array.from(pulse.residual),
      mixed: Float64Array.from(pulse.mixed),
    };
    m.weights = {
      lattice: grads.lattice,
      cloak: grads.cloak,
    };
    m.recipe = meta.recipe || null;
    m.meta = { ...meta, route };
    m.dna = face(m.dna, LOCUS.emit);
  }
  for (const m of swarms.routing) {
    m.imprint = pulse.imprint;
    m.dna = face(m.dna, LOCUS.route);
  }
  mem.imprint = pulse.imprint;
  mem.note = { n: meta.n, h: meta.h, w: meta.w, heat: pulse.heat };
  mem.dna = face(mem.dna, LOCUS.perceive);
  return { imprint: pulse.imprint, route, heat: pulse.heat };
}

/** Capture swarm as decompress emulator — existing engine if routed, else flash residual. */
export function emulate(swarms, imprint, steps = 3) {
  const cap = swarms.capture.find((m) => m.imprint === imprint) || swarms.capture[0];
  if (!cap) throw new Error("capture swarm has no imprint");
  if (imprint != null && cap.imprint !== imprint) throw new Error("imprint mismatch");
  if (cap.recipe && cap.recipe.engine && cap.recipe.engine !== "flash-residual") {
    return cap.recipe.decode();
  }
  if (!cap.flash || !cap.weights) throw new Error("capture swarm has no imprint");
  const { h, w, n } = cap.meta;
  const lat = makeField(h, w);
  const cloak = makeField(h, w);
  for (let t = 0; t < steps; t++) {
    stepField(cloak, lat, cap.weights.cloak, 0.4);
    stepField(lat, cloak, cap.weights.lattice, 0.55);
  }
  applyImprint(lat, cap.flash);
  return readVisible(lat, n);
}

export function roster(swarms) {
  const out = [];
  for (const kind of KINDS) {
    for (const m of swarms[kind]) {
      out.push({
        kind,
        seat: m.seat,
        locus: LOCUS_NAME[m.dna.locus],
        id: m.dna.id,
        imprint: m.imprint,
      });
    }
  }
  return out;
}

export { shapeFor };
