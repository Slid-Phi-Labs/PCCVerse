/**
 * Dominant residual — leftover after the model already spoke.
 *
 * Why we did not have one:
 *   Path A XOR'd every byte with no LZ, so leftovers were not zeros.
 *   Lattice flash stored one value per cell (leftover ≈ file).
 *   ZRW is already dominant — but only when the model is exact.
 *
 * This coder:
 *   ZRW vector → ZRW (keep that seat).
 *   Else LZ copies (no leftover) + O1 XOR on literals + zero-peaked leftover codes.
 * Dominant = packed < brotli on that file. Measure it.
 */
import { classify, zrwPack, zrwUnpack, asI32, fromI32 } from "./existing.js";
import { encodeReal, decodeReal } from "./rdom-real.js";

const MAGIC = Buffer.from("RDOM");
const WIN = 1 << 15;
const MIN_MATCH = 4;
const MAX_MATCH = 255;
const CHAIN = 24;

class BW {
  constructor() {
    this.bits = [];
  }
  put(v, n) {
    v = v >>> 0;
    for (let i = n - 1; i >= 0; i--) this.bits.push((v >>> i) & 1);
  }
  finish() {
    const n = this.bits.length;
    const body = Buffer.alloc(4 + Math.ceil(n / 8));
    body.writeUInt32LE(n, 0);
    for (let i = 0; i < n; i++) if (this.bits[i]) body[4 + (i >> 3)] |= 1 << (i & 7);
    return body;
  }
}

class BR {
  constructor(buf) {
    this.n = buf.readUInt32LE(0);
    this.buf = buf;
    this.i = 0;
  }
  get(n) {
    let v = 0;
    for (let k = 0; k < n; k++) v = (v << 1) | this.bit();
    return v;
  }
  bit() {
    if (this.i >= this.n) return 0;
    const b = (this.buf[4 + (this.i >> 3)] >> (this.i & 7)) & 1;
    this.i++;
    return b;
  }
}

function buildHash(src) {
  const head = new Int32Array(1 << 16).fill(-1);
  const prev = new Int32Array(src.length).fill(-1);
  for (let i = 0; i + 3 < src.length; i++) {
    const h = ((src[i] << 8) ^ (src[i + 1] << 4) ^ src[i + 2]) & 0xffff;
    prev[i] = head[h];
    head[h] = i;
  }
  return { head, prev };
}

function findMatch(src, ip, prev) {
  if (ip + MIN_MATCH > src.length) return null;
  let ref = prev[ip];
  let best = 0;
  let off = 0;
  let hops = 0;
  const lim = Math.min(MAX_MATCH, src.length - ip);
  while (ref >= 0 && hops++ < CHAIN && ip - ref <= WIN) {
    let n = 0;
    while (n < lim && src[ref + n] === src[ip + n]) n++;
    if (n > best) {
      best = n;
      off = ip - ref;
    }
    ref = prev[ref];
  }
  if (best < MIN_MATCH) return null;
  return { off, len: best };
}

function putRes(w, res) {
  if (res === 0) w.put(0, 1);
  else if (res < 16) {
    w.put(2, 2);
    w.put(res, 4);
  } else {
    w.put(3, 2);
    w.put(res, 8);
  }
}

function getRes(r) {
  if (r.bit() === 0) return 0;
  if (r.bit() === 0) return r.get(4);
  return r.get(8);
}

function zigzag(n) {
  return n >= 0 ? n * 2 : -n * 2 - 1;
}
function unzigzag(u) {
  return (u & 1) === 0 ? u >>> 1 : -((u + 1) >>> 1);
}

/** Second-difference leftover for int32 — this is the walk residual. */
export function encodeD2(ints) {
  const w = new BW();
  w.put(ints.length, 32);
  if (!ints.length) return Buffer.concat([MAGIC, Buffer.from([3]), w.finish()]);
  w.put(ints[0] | 0, 32);
  if (ints.length === 1) return Buffer.concat([MAGIC, Buffer.from([3]), w.finish()]);
  w.put(ints[1] | 0, 32);
  let dPrev = (ints[1] | 0) - (ints[0] | 0);
  for (let i = 2; i < ints.length; i++) {
    const d = (ints[i] | 0) - (ints[i - 1] | 0);
    const d2 = zigzag(d - dPrev);
    dPrev = d;
    if (d2 === 0) w.put(0, 1);
    else if (d2 < 16) {
      w.put(2, 2);
      w.put(d2, 4);
    } else if (d2 < 256) {
      w.put(3, 2);
      w.put(0, 1);
      w.put(d2, 8);
    } else {
      w.put(3, 2);
      w.put(1, 1);
      w.put(d2, 32);
    }
  }
  return Buffer.concat([MAGIC, Buffer.from([3]), w.finish()]);
}

export function decodeD2(frame) {
  const r = new BR(frame.subarray(5));
  const n = r.get(32);
  const out = [];
  if (n === 0) return fromI32(out);
  out.push(r.get(32) << 0 >> 0);
  if (n === 1) return fromI32(out);
  out.push(r.get(32) << 0 >> 0);
  let dPrev = out[1] - out[0];
  for (let i = 2; i < n; i++) {
    let d2;
    if (r.bit() === 0) d2 = 0;
    else if (r.bit() === 0) d2 = r.get(4);
    else if (r.bit() === 0) d2 = r.get(8);
    else d2 = r.get(32);
    const d = dPrev + unzigzag(d2);
    out.push(out[i - 1] + d);
    dPrev = d;
  }
  return fromI32(out);
}

export function encodeDominant(buf) {
  const u8 = Buffer.from(buf);
  const cls = classify(u8);
  const ints = asI32(u8);
  if (cls.engine === "zrw" && ints && (cls.vector === "zeros" || cls.vector === "ramp")) {
    return Buffer.concat([MAGIC, Buffer.from([1]), zrwPack(ints)]);
  }
  if (ints && cls.vector === "walk") {
    return encodeD2(ints);
  }

  try {
    const real = encodeReal(u8);
    if (decodeReal(real).equals(u8)) return real;
  } catch {
    /* fall through to simple leftover */
  }

  const { prev } = buildHash(u8);
  const w = new BW();
  w.put(u8.length, 32);
  const o1 = new Uint8Array(256);
  let last = 0;
  let ip = 0;
  while (ip < u8.length) {
    const m = findMatch(u8, ip, prev);
    if (m) {
      w.put(1, 1);
      w.put(m.off, 16);
      w.put(m.len, 8);
      for (let k = 0; k < m.len; k++) {
        o1[last] = u8[ip + k];
        last = u8[ip + k];
      }
      ip += m.len;
      continue;
    }
    w.put(0, 1);
    const res = u8[ip] ^ o1[last];
    putRes(w, res);
    o1[last] = u8[ip];
    last = u8[ip];
    ip++;
  }
  return Buffer.concat([MAGIC, Buffer.from([2]), w.finish()]);
}

export function decodeDominant(frame) {
  if (frame.length < 5 || frame.subarray(0, 4).toString() !== "RDOM") throw new Error("not RDOM");
  if (frame[4] === 1) return fromI32(zrwUnpack(frame.subarray(5)));
  if (frame[4] === 3) return decodeD2(frame);
  if (frame[4] === 4 || frame[4] === 5) return decodeReal(frame);
  const r = new BR(frame.subarray(5));
  const n = r.get(32);
  const out = Buffer.alloc(n);
  const o1 = new Uint8Array(256);
  let last = 0;
  let op = 0;
  while (op < n) {
    if (r.bit() === 1) {
      const off = r.get(16);
      const len = r.get(8);
      for (let k = 0; k < len; k++) {
        const v = out[op - off];
        out[op++] = v;
        o1[last] = v;
        last = v;
      }
    } else {
      const v = getRes(r) ^ o1[last];
      out[op++] = v;
      o1[last] = v;
      last = v;
    }
  }
  return out;
}

export function leftoverFrac(buf) {
  const u8 = Buffer.from(buf);
  let z = 0;
  const o1 = new Uint8Array(256);
  let last = 0;
  for (let i = 0; i < u8.length; i++) {
    if ((u8[i] ^ o1[last]) === 0) z++;
    o1[last] = u8[i];
    last = u8[i];
  }
  return z / Math.max(1, u8.length);
}
