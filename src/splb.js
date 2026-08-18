/**
 * SPLB — tamper-evident black box.
 * Payload is the full runnable demo. Ed25519 stitch: change a byte → HALT.
 * 24h clock is local (first open). Demos stay the product surface.
 */
import crypto from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { PUBKEY_PEM } from "./box-pubkey.js";

export const MAGIC = Buffer.from("SPLB");
export const BOX_HOURS = 24;
const DIR = join(homedir(), ".swarm-smart");
const PACK_KEY = join(DIR, "pack.key");

export const BUY = {
  gate_year: "https://buy.stripe.com/7sY4gA6Jfapy1GZ8gw6wE0G",
  tru8_year: "https://buy.stripe.com/dRmaEY6Jf1T23P78gw6wE0E",
  chamber_year: "https://buy.stripe.com/dRmeVeaZv7dm99rcwM6wE0F",
  lab_pass: "https://buy.stripe.com/3cI7sM2sZ0OYfxP7cs6wE0D",
  license: "https://www.slidphilabs.com/license",
};

function pubKey() {
  return crypto.createPublicKey(PUBKEY_PEM);
}

export function ensurePackKey() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
  if (!existsSync(PACK_KEY)) {
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    writeFileSync(PACK_KEY, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  }
  return crypto.createPrivateKey(readFileSync(PACK_KEY, "utf8"));
}

export function packDir(root, { id, name } = {}) {
  const files = {};
  const walk = (dir) => {
    for (const ent of readdirSync(dir)) {
      if (ent === "node_modules" || ent === ".git" || ent === "boxes") continue;
      const p = join(dir, ent);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) {
        const rel = relative(root, p).replace(/\\/g, "/");
        files[rel] = readFileSync(p).toString("base64");
      }
    }
  };
  walk(root);
  const payload = zlib.deflateSync(
    Buffer.from(JSON.stringify({ name: name || "swarm-smart", files, credit: "Powered by TRU8 · Slid Phi Labs" })),
  );
  const priv = ensurePackKey();
  const boxId = id || crypto.randomBytes(16);
  const issued = BigInt(Date.now());
  const hdr = Buffer.alloc(4 + 1 + 1 + 16 + 8 + 2 + 4);
  MAGIC.copy(hdr, 0);
  hdr[4] = 1;
  hdr[5] = 0;
  boxId.copy(hdr, 6, 0, 16);
  hdr.writeBigUInt64LE(issued, 22);
  hdr.writeUInt16LE(BOX_HOURS, 30);
  hdr.writeUInt32LE(payload.length, 32);
  const sig = crypto.sign(null, Buffer.concat([hdr, payload]), priv);
  return Buffer.concat([hdr, sig, payload]);
}

export function openSplb(buf) {
  if (buf.length < 4 + 1 + 1 + 16 + 8 + 2 + 4 + 64) throw new Error("HALT: truncated box");
  if (buf.subarray(0, 4).toString() !== "SPLB") throw new Error("HALT: not SPLB");
  const ver = buf[4];
  if (ver !== 1) throw new Error("HALT: box version");
  const id = buf.subarray(6, 22);
  const issued = buf.readBigUInt64LE(22);
  const ttl = buf.readUInt16LE(30);
  const plen = buf.readUInt32LE(32);
  const sig = buf.subarray(36, 100);
  const payload = buf.subarray(100, 100 + plen);
  if (payload.length !== plen) throw new Error("HALT: truncated payload");
  const hdr = buf.subarray(0, 36);
  const ok = crypto.verify(null, Buffer.concat([hdr, payload]), pubKey(), sig);
  if (!ok) throw new Error("HALT: stitch fail (tampered)");
  const body = JSON.parse(zlib.inflateSync(payload).toString("utf8"));
  return { id: id.toString("hex"), issued: Number(issued), ttl, files: body.files, name: body.name, credit: body.credit };
}

function receiptPath(boxId) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
  return join(DIR, `receipt-${boxId}.json`);
}

export function clock(box) {
  const p = receiptPath(box.id);
  if (!existsSync(p)) {
    const rec = { box: box.id, started: new Date().toISOString(), stitch: box.id };
    writeFileSync(p, JSON.stringify(rec, null, 2), { mode: 0o600 });
    return { hours: 0, open: true, first: true, started: rec.started };
  }
  const rec = JSON.parse(readFileSync(p, "utf8"));
  if (rec.box !== box.id) throw new Error("HALT: receipt mismatch");
  const hours = (Date.now() - Date.parse(rec.started)) / 3600000;
  if (hours < -1) throw new Error("HALT: clock tamper");
  return { hours, open: hours < box.ttl, first: false, started: rec.started };
}

export function extract(box, dest) {
  mkdirSync(dest, { recursive: true });
  for (const [rel, b64] of Object.entries(box.files)) {
    const out = join(dest, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(b64, "base64"));
  }
  return dest;
}

export function statusFromBox(box) {
  const clk = clock(box);
  return {
    protocol: "splb-ed25519-24h",
    name: box.name,
    box: box.id,
    tamper: "clean",
    box_open: clk.open,
    hours_used: Number(clk.hours.toFixed(3)),
    hours_left: Number(Math.max(0, box.ttl - clk.hours).toFixed(3)),
    files: Object.keys(box.files).length,
    credit: box.credit,
    production: clk.open ? "black-box eval" : "buy a seat",
    buy: BUY,
    inbox: "corey@slidphilabs.com",
  };
}

export function defaultBoxPath() {
  return join(fileURLToPath(new URL("..", import.meta.url)), "boxes", "swarm-smart.splb");
}
