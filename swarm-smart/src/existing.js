/**
 * Existing lab engines whose payloads Capture may replay from live memory.
 * ZRW v5 for structured ints. Bake-off (brotli / gzip / stroke-ls) otherwise.
 */
import zlib from "node:zlib";
import { existsSync } from "node:fs";
import { zrwPack, zrwUnpack } from "./zrw-public.js";

const STROKE = process.env.STROKE_LS || "";

export function asI32(buf) {
  if (buf.length < 4 || buf.length % 4 !== 0) return null;
  const n = buf.length / 4;
  const ints = new Array(n);
  for (let i = 0; i < n; i++) ints[i] = buf.readInt32LE(i * 4);
  return ints;
}

export function fromI32(ints) {
  const buf = Buffer.alloc(ints.length * 4);
  for (let i = 0; i < ints.length; i++) buf.writeInt32LE(ints[i] | 0, i * 4);
  return buf;
}

export function classify(buf) {
  const u8 = Buffer.from(buf);
  if (!u8.length) return { vector: "empty", engine: "store" };
  let z = 0;
  let texty = 0;
  for (let i = 0; i < u8.length; i++) {
    if (u8[i] === 0) z++;
    if ((u8[i] >= 32 && u8[i] <= 126) || u8[i] === 9 || u8[i] === 10 || u8[i] === 13) texty++;
  }
  if (z / u8.length > 0.95) return { vector: "zeros", engine: "zrw" };

  const ints = asI32(u8);
  if (ints && texty / u8.length < 0.82) {
    if (ints.every((v) => v === 0)) return { vector: "zeros", engine: "zrw" };
    let ramp = true;
    for (let i = 1; i < ints.length; i++) if (ints[i] !== ints[0] + i) { ramp = false; break; }
    if (ramp) return { vector: "ramp", engine: "zrw" };
    let maxD = 0;
    for (let i = 1; i < Math.min(ints.length, 256); i++) {
      const d = Math.abs(ints[i] - ints[i - 1]);
      if (d > maxD) maxD = d;
    }
    if (maxD > 0 && maxD < 1000) return { vector: "walk", engine: "zrw" };
  }
  return { vector: texty / u8.length > 0.82 ? "text" : "bytes", engine: "bakeoff" };
}

export { zrwPack, zrwUnpack };

function gzip9(buf) {
  return zlib.gzipSync(buf, { level: 9 });
}
function brotli11(buf) {
  return zlib.brotliCompressSync(buf, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  });
}

export async function bakeoff(buf) {
  const trials = [
    { engine: "gzip-9", payload: gzip9(buf) },
    { engine: "brotli-11", payload: brotli11(buf) },
  ];
  try {
    const { encodeDominant, decodeDominant } = await import("./dominant.js");
    const payload = encodeDominant(buf);
    if (decodeDominant(payload).equals(buf)) trials.push({ engine: "rdom", payload });
  } catch {
    /* residual optional */
  }
  if (existsSync(STROKE)) {
    try {
      const { encodeStroke, decodeStroke } = await import(STROKE);
      const payload = encodeStroke(buf);
      const back = decodeStroke(payload);
      if (Buffer.from(back).equals(buf)) trials.push({ engine: "stroke-ls", payload });
    } catch {
      /* stroke optional */
    }
  }
  trials.sort((a, b) => a.payload.length - b.payload.length);
  return trials[0];
}

export function decodeEngine(engine, payload, rawLen) {
  if (engine === "zrw") return fromI32(zrwUnpack(payload));
  if (engine === "gzip-9") return zlib.gunzipSync(payload);
  if (engine === "brotli-11") return zlib.brotliDecompressSync(payload);
  if (engine === "store") return payload;
  if (engine === "stroke-ls") {
    throw new Error("stroke-ls decode is async — use decodeEngineAsync");
  }
  throw new Error(`no decoder for ${engine}`);
}

export async function decodeEngineAsync(engine, payload) {
  if (engine === "stroke-ls") {
    const { decodeStroke } = await import(STROKE);
    return Buffer.from(decodeStroke(payload));
  }
  return decodeEngine(engine, payload);
}

export async function routeExisting(buf) {
  const cls = classify(buf);
  if (cls.engine === "zrw" && cls.vector !== "walk") {
    const i32 = asI32(buf);
    const ints = i32 || Array.from(buf);
    const payload = zrwPack(ints);
    const decode = () => (i32 ? fromI32(zrwUnpack(payload)) : Buffer.from(zrwUnpack(payload)));
    const ok = decode().equals(buf);
    return { ...cls, payload, packed: payload.length, rt: ok, decode };
  }
  const win = await bakeoff(buf);
  let decode;
  if (win.engine === "stroke-ls") {
    const { decodeStroke } = await import(STROKE);
    decode = () => Buffer.from(decodeStroke(win.payload));
  } else if (win.engine === "rdom") {
    const { decodeDominant } = await import("./dominant.js");
    decode = () => decodeDominant(win.payload);
  } else {
    decode = () => decodeEngine(win.engine, win.payload);
  }
  return {
    ...cls,
    engine: win.engine,
    payload: win.payload,
    packed: win.payload.length,
    rt: decode().equals(buf),
    decode,
  };
}
