#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { boot, ingest, restore, faceAll } from "./src/machine.js";
import { gateStatus } from "./src/blackbox.js";

const cmd = process.argv[2];

if (cmd === "ingest" && process.argv[3]) {
  const m = boot();
  const r = await ingest(m, readFileSync(process.argv[3]));
  console.log(JSON.stringify({ ok: r.ok, raw: r.raw, vector: r.vector, engine: r.engine, packed: r.packed, heat: r.heat, miss: r.miss }, null, 2));
  process.exit(r.ok ? 0 : 1);
}

if (cmd === "gate" || cmd === "box") {
  console.log(JSON.stringify(gateStatus(), null, 2));
  process.exit(0);
}

if (cmd === "demo") {
  console.log("black box:", gateStatus().box_open ? "OPEN" : "GATED", gateStatus().hours_left, "h left");

  const m = boot();
  const ramp = Buffer.alloc(40_000);
  for (let i = 0; i < 10_000; i++) ramp.writeInt32LE(i, i * 4);
  const zeros = Buffer.alloc(40_000);
  const samples = [
    ["zeros-10k-i32", zeros],
    ["ramp-10k-i32", ramp],
    ["text", Buffer.from("data through lattice cloak flash")],
  ];
  for (const [name, buf] of samples) {
    const r = await ingest(m, buf);
    const back = restore(m, r.imprint);
    const same = back.ok && back.bytes.equals(buf);
    console.log(
      name.padEnd(16),
      (r.vector + "/" + r.engine).padEnd(22),
      `${r.raw}→${r.packed}`.padEnd(14),
      same ? "MIRROR" : `MISS ${r.miss}`,
    );
  }
  console.log("face all .2 (route):", faceAll(m, 2).map((x) => `${x.kind}:${x.locus}`).join(" "));
  process.exit(0);
}

console.log(`swarm-smart
  node cli.js demo
  node cli.js ingest <file>
  node cli.js gate
`);
