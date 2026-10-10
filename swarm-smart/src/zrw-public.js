/**
 * Public vector recipes (zeros / ramp). Not the private ZRW v5 engine.
 * Walk leftover lives in dominant.js encodeD2.
 */
export function packZerosI32(n) {
  const o = Buffer.alloc(8);
  o.writeUInt32LE(n >>> 0, 0);
  o.write("ZRW0", 4);
  return o;
}

export function unpackZerosI32(buf) {
  if (buf.length < 8 || buf.toString("ascii", 4, 8) !== "ZRW0") throw new Error("not ZRW0");
  return new Array(buf.readUInt32LE(0)).fill(0);
}

export function packRampI32(n, start) {
  const o = Buffer.alloc(12);
  o.writeUInt32LE(n >>> 0, 0);
  o.writeInt32LE(start | 0, 4);
  o.write("ZRW1", 8);
  return o;
}

export function unpackRampI32(buf) {
  if (buf.length < 12 || buf.toString("ascii", 8, 12) !== "ZRW1") throw new Error("not ZRW1");
  const n = buf.readUInt32LE(0);
  const start = buf.readInt32LE(4);
  return Array.from({ length: n }, (_, i) => start + i);
}

export function zrwPack(ints) {
  if (!ints.length || ints.every((v) => v === 0)) return packZerosI32(ints.length);
  let ramp = true;
  for (let i = 1; i < ints.length; i++) if (ints[i] !== ints[0] + i) { ramp = false; break; }
  if (ramp) return packRampI32(ints.length, ints[0]);
  throw new Error("public ZRW demo only packs zeros/ramp — walk uses RDOM d2");
}

export function zrwUnpack(packed) {
  const u8 = Buffer.from(packed);
  if (u8.toString("ascii", 4, 8) === "ZRW0") return unpackZerosI32(u8);
  if (u8.length >= 12 && u8.toString("ascii", 8, 12) === "ZRW1") return unpackRampI32(u8);
  throw new Error("unknown public ZRW recipe");
}
