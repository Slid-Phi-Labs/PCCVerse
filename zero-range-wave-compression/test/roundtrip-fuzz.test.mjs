// Property tests: random round-trip identity + corrupt-input refusal.
// Extends the suite run by `node --test test/` (see corrupt-input.test.mjs).
// Covers the v5.1 fixes: chunk-independent only here; byte-valued inputs
// (the codec's documented domain: zeros, ramps, walks, periodic data).
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import * as lib from "../index.js";

// Deterministic PRNG (mulberry32) — no Math.random, reproducible failures.
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % 256;
  };
}

describe("roundtrip fuzz: random byte-valued inputs are identity", () => {
  it("300 seeded random arrays round-trip exactly", () => {
    const rnd = mulberry32(0xf02);
    for (let i = 0; i < 300; i++) {
      const len = 1 + (rnd() % 300);
      const data = Array.from({ length: len }, rnd);
      assert.deepEqual(lib.decompress(lib.compress(data)), data, `trial ${i}`);
    }
  });

  it("zero-heavy adversarial shapes round-trip (omega-forgery trigger)", () => {
    // Runs of literal 0 followed by a normal opcode forge the 8-bit omega
    // prefix; the decoder must take the Fib parse, not the omega one.
    const rnd = mulberry32(0xbad);
    for (let i = 0; i < 200; i++) {
      const data = [];
      const segs = 1 + (rnd() % 5);
      for (let g = 0; g < segs; g++) {
        const z = rnd() % 8;
        for (let k = 0; k < z; k++) data.push(0);
        data.push(rnd());
      }
      assert.deepEqual(lib.decompress(lib.compress(data)), data, `trial ${i}`);
    }
  });

  it("text-like and periodic inputs round-trip", () => {
    const rnd = mulberry32(12345);
    const walk = [7];
    for (let i = 1; i < 2000; i++) walk.push(walk[i - 1] + ((rnd() % 9) - 4));
    const periodic = Array.from({ length: 2000 }, (_, i) => i % 251);
    for (const data of [walk, periodic]) {
      assert.deepEqual(lib.decompress(lib.compress(data)), data);
    }
  });
});

describe("corrupt fuzz: structural damage is refused, decoder never hangs", () => {
  // ZRW carries no checksum: a flipped payload bit can decode to
  // different values (verified by exhaustive single-bit scan during
  // development). Callers needing integrity must add it themselves.
  // What the decoder DOES guarantee: truncated / garbage / forged
  // streams throw a ZRW error instead of returning partial data, and no
  // mutation crashes, hangs, or yields a non-array.
  it("byte mutations throw or return an array (never crash/hang)", () => {
    const rnd = mulberry32(0xe11);
    const data = Array.from({ length: 300 }, rnd);
    const good = lib.compress(data);
    for (let i = 0; i < 200; i++) {
      const bad = new Uint8Array(good);
      const nMut = 1 + (rnd() % 3);
      for (let k = 0; k < nMut; k++) bad[rnd() % bad.length] = rnd();
      let back;
      try {
        back = lib.decompress(bad);
      } catch (e) {
        assert.match(e.message, /ZRW/, `mutation ${i} wrong error`);
        continue;
      }
      assert.ok(Array.isArray(back), `mutation ${i} non-array`);
    }
  });

  it("truncations at every length class throw", () => {
    const rnd = mulberry32(0xc07);
    const data = Array.from({ length: 500 }, rnd);
    const good = lib.compress(data);
    assert.ok(good.length > 16);
    for (const cut of [0, 1, 4, 5, 8, 9, good.length >> 1, good.length - 1]) {
      assert.throws(
        () => lib.decompress(good.slice(0, cut)),
        /ZRW/,
        `cut ${cut} accepted`,
      );
    }
  });
});
