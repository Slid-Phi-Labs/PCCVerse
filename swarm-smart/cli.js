#!/usr/bin/env node
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { boot, ingest, replayFromMemory, faceAll } from "./src/machine.js";
import { gateStatus } from "./src/blackbox.js";
import { openSplb, statusFromBox, defaultBoxPath, extract } from "./src/splb.js";

const cmd = process.argv[2];

if (cmd === "ingest" && process.argv[3]) {
  const m = boot();
  const r = await ingest(m, readFileSync(process.argv[3]));
  console.log(JSON.stringify({ ok: r.ok, raw: r.raw, vector: r.vector, engine: r.engine, packed: r.packed, heat: r.heat, miss: r.miss }, null, 2));
  process.exit(r.ok ? 0 : 1);
}

if (cmd === "gate" || cmd === "box") {
  try {
    const box = openSplb(readFileSync(process.argv[3] || defaultBoxPath()));
    console.log(JSON.stringify(statusFromBox(box), null, 2));
  } catch (e) {
    if (String(e.message).startsWith("HALT")) {
      console.log(JSON.stringify({ tamper: "HALT", error: e.message, buy: gateStatus().buy }, null, 2));
      process.exit(2);
    }
    console.log(JSON.stringify(gateStatus(), null, 2));
  }
  process.exit(0);
}

if (cmd === "run") {
  const path = process.argv[3] || defaultBoxPath();
  const box = openSplb(readFileSync(path));
  const st = statusFromBox(box);
  console.log("SPLB", st.name, st.tamper, st.box_open ? "OPEN" : "GATED", st.hours_left, "h left", st.files, "files");
  if (!st.box_open) {
    console.log("box closed — buy a seat", st.buy.lab_pass);
    process.exit(3);
  }
  const dest = mkdtempSync(join(tmpdir(), "splb-"));
  extract(box, dest);
  const r = spawnSync(process.execPath, ["cli.js", "demo"], { cwd: dest, stdio: "inherit" });
  process.exit(r.status ?? 1);
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
    const back = replayFromMemory(m, r.imprint);  // same-session memory replay, not a decode
    const same = back.ok && back.bytes.equals(buf);
    console.log(
      name.padEnd(16),
      (r.vector + "/" + r.engine).padEnd(22),
      `${r.raw}→${r.packed}`.padEnd(14),
      same ? "REPLAY-OK (in-session memory)" : `MISS ${r.miss}`,
    );
  }
  console.log("face all .2 (route):", faceAll(m, 2).map((x) => `${x.kind}:${x.locus}`).join(" "));
  process.exit(0);
}

console.log(`swarm-smart
  node cli.js run              # open signed box, HALT if tampered, run demo
  node cli.js demo             # raw demo (replays live session memory; not a codec decode)
  node cli.js ingest <file>
  node cli.js gate [box.splb]
`);
