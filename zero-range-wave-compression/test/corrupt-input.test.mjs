// Regression: corrupt input must throw (hard refusal).
// A truncated, forged, or otherwise undecodable stream must never decode
// into a silent partial/garbage array.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import * as lib from "../index.js";
import * as min from "../index.min.mjs";
import { packBits } from "../index.mjs";

const ENTRIES = [
  ["index.js (public entry)", lib],
  ["index.min.mjs (minified bundle)", min],
];

for (const [name, m] of ENTRIES) {
  describe(`${name}: corrupt input throws`, () => {
    it("roundtrips valid data, including empty", () => {
      const walk = [7];
      for (let i = 1; i < 500; i++) walk.push(walk[i - 1] + (i % 2 ? 3 : -2));
      const corpora = [
        Array(10000).fill(0),
        Array.from({ length: 1000 }, (_, i) => i),
        walk,
        [],
      ];
      for (const data of corpora) {
        assert.deepEqual(m.decompress(m.compress(data)), data);
      }
    });

    it("truncated stream throws instead of returning partial", () => {
      // Seeded pseudo-random walk resists MATCH tokens, so truncation is meaningful.
      const data = [0];
      let seed = 123456789;
      for (let i = 1; i < 2000; i++) {
        seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
        data.push(data[i - 1] + ((seed % 9) - 4));
      }
      const packed = m.compress(data);
      assert.deepEqual(m.decompress(packed), data);
      assert.ok(packed.length > 32);
      assert.throws(
        () => m.decompress(packed.slice(0, packed.length - 2)),
        /ZRW: corrupt/,
      );
      assert.throws(() => m.decompress(packed.slice(0, 4)), /ZRW: corrupt/);
    });

    it("forged short header throws", () => {
      // Declares 9 bits but carries only 1 payload byte.
      assert.throws(
        () => m.decompress(new Uint8Array([9, 0, 0, 0, 255])),
        /ZRW: corrupt/,
      );
    });

    it("empty buffer throws", () => {
      assert.throws(() => m.decompress(new Uint8Array(0)), /ZRW: corrupt/);
    });

    it("non-bytes input throws TypeError", () => {
      assert.throws(() => m.decompress("not bytes"), TypeError);
      assert.throws(() => m.decompress([1, 2, 3]), TypeError);
    });

    it("v2 magic with invalid k throws", () => {
      assert.throws(
        () => m.decompress(new Uint8Array([0x5a, 0x57, 0x02, 0x09, 1, 2, 3, 4])),
        /ZRW: corrupt/,
      );
    });

    it("dangling MATCH token throws mid-stream", () => {
      // First value 0 ([1,1]) decodes fine, then a MATCH op with no payload.
      const bits = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0];
      assert.throws(() => m.decompress(packBits(bits, 0)), /ZRW: corrupt/);
    });

    it("decompressLive never silently returns on corrupt input", () => {
      // Free tier rejects livestream on license before touching bytes;
      // either way it must throw, not return partial data.
      assert.throws(() =>
        m.decompressLive(new Uint8Array([9, 0, 0, 0, 255])),
      );
    });
  });
}
