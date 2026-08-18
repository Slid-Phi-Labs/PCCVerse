import zlib from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import { encodeDominant, decodeDominant, leftoverFrac } from "./src/dominant.js";
import { leftoverAfterParse } from "./src/rdom-real.js";

function br(buf) {
  return zlib.brotliCompressSync(buf, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  });
}
function gz(buf) {
  return zlib.gzipSync(buf, { level: 9 });
}

function i32fill(n, fn) {
  const b = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) b.writeInt32LE(fn(i) | 0, i * 4);
  return b;
}

const files = {
  zeros_10k: i32fill(10000, () => 0),
  ramp_10k: i32fill(10000, (i) => i),
  walk_s1: i32fill(10000, (i) => {
    let s = 1;
    let v = 0;
    for (let k = 0; k < i; k++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      v += s % 2 === 0 ? 1 : -1;
    }
    return v;
  }),
  hello: Buffer.from("the cat sat on the mat. ".repeat(80)),
};

for (const name of ["bib", "book1", "paper1", "obj1", "pic"]) {
  const p = `/home/cee/projects/SlidPhiLabs/lab/benches/corpora/calgary/${name}`;
  if (existsSync(p)) files["calgary_" + name] = readFileSync(p);
}

console.log(
  "file".padEnd(14),
  "raw".padStart(8),
  "rdom".padStart(8),
  "br11".padStart(8),
  "gzip".padStart(8),
  "o1=0".padStart(7),
  "rt",
  "vs br",
);
for (const [name, buf] of Object.entries(files)) {
  const enc = encodeDominant(buf);
  const back = decodeDominant(enc);
  const ok = back.equals(buf);
  const b = br(buf);
  const g = gz(buf);
  const vs = enc.length < b.length ? "WIN" : enc.length === b.length ? "TIE" : "lose";
  const kind = enc[4];
  const lp = kind === 4 ? leftoverAfterParse(buf) : null;
  console.log(
    name.padEnd(16),
    String(buf.length).padStart(8),
    String(enc.length).padStart(8),
    String(b.length).padStart(8),
    String(g.length).padStart(8),
    leftoverFrac(buf).toFixed(2).padStart(6),
    `k${kind}`.padStart(4),
    lp ? `lz=${(lp.match_bytes / lp.n).toFixed(2)} r0=${lp.literals ? (lp.leftover0 / lp.literals).toFixed(2) : 0}` : "",
    ok ? "OK" : "FAIL",
    vs,
  );
}
