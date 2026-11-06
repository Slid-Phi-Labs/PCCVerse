// Verse benchmark helper for the JS codec (zero-range-wave-compression).
// Reads raw corpus files from argv, encodes each byte as one ZRW int
// (0-255), chunked at 8000 ints/call to stay inside the license-free
// Free-Gate per-call limit. Prints one JSON object per line:
//   {name, raw, comp, enc_ms, dec_ms, ok}
// Exits nonzero if any corpus fails to round-trip.
import { readFileSync } from "node:fs";
import { compress, decompress } from "../zero-range-wave-compression/index.js";

const CHUNK = 8000;

function roundtrip(ints) {
  const parts = [];
  let encMs = 0;
  const t0 = performance.now();
  for (let i = 0; i < ints.length; i += CHUNK) {
    parts.push(compress(ints.slice(i, i + CHUNK)));
  }
  encMs = performance.now() - t0;
  const t1 = performance.now();
  const out = [];
  for (const p of parts) {
    out.push(...decompress(p));
  }
  const decMs = performance.now() - t1;
  const comp = parts.reduce((n, p) => n + p.length, 0);
  const ok = out.length === ints.length && out.every((v, i) => v === ints[i]);
  return { comp, encMs, decMs, ok };
}

let failed = false;
for (const path of process.argv.slice(2)) {
  const raw = readFileSync(path);
  const ints = [...raw];
  let line;
  if (ints.length === 0) {
    line = { name: path, raw: 0, comp: 0, enc_ms: 0, dec_ms: 0, ok: true };
  } else {
    const r = roundtrip(ints);
    line = {
      name: path,
      raw: raw.length,
      comp: r.comp,
      enc_ms: +r.encMs.toFixed(2),
      dec_ms: +r.decMs.toFixed(2),
      ok: r.ok,
    };
    if (!r.ok) failed = true;
  }
  console.log(JSON.stringify(line));
}
process.exit(failed ? 1 : 0);
