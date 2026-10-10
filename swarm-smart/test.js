import assert from "node:assert/strict";
import { boot, ingest, restore, faceAll } from "./src/machine.js";
import { graduate } from "./src/university.js";

const grads = graduate({ rounds: 40, steps: 3, mag: 0.04 });
assert.ok(grads.diploma.graduated);
assert.ok(Number.isFinite(grads.err));

const m = boot({ grads });
assert.equal(m.swarms.capture.length, 3);
assert.equal(m.swarms.routing.length, 3);
assert.equal(m.swarms.memory.length, 3);

const zeros = Buffer.alloc(64, 0);
const z = await ingest(m, zeros);
assert.equal(z.ok, true, "zeros must mirror");
assert.equal(z.engine, "zrw");
assert.ok(z.packed < zeros.length);
assert.ok(restore(m, z.imprint).bytes.equals(zeros));

const ramp = Buffer.alloc(64);
for (let i = 0; i < 16; i++) ramp.writeInt32LE(i, i * 4);
const r = await ingest(m, ramp);
assert.equal(r.ok, true, "ramp must mirror");
assert.equal(r.vector, "ramp");
assert.equal(r.engine, "zrw");
assert.ok(restore(m, r.imprint).bytes.equals(ramp));

const msg = Buffer.from("flash imprint capture swarm");
const h = await ingest(m, msg);
assert.equal(h.ok, true, "text must mirror");
assert.ok(["brotli-11", "gzip-9", "stroke-ls"].includes(h.engine));
assert.ok(restore(m, h.imprint).bytes.equals(msg));

const faced = faceAll(m, 2);
assert.ok(faced.every((x) => x.locus === "route"));

assert.ok(z.heat >= 0);
console.log("swarm-smart OK", {
  grad_err: Number(grads.err.toFixed(5)),
  zeros_heat: Number(z.heat.toFixed(4)),
  ramp_heat: Number(r.heat.toFixed(4)),
  text_heat: Number(h.heat.toFixed(4)),
  imprint: h.imprint,
});
