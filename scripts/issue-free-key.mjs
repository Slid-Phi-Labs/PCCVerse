#!/usr/bin/env node
/**
 * Issue Free Gate key (publisher only). Cap = 25.
 *   node scripts/issue-free-key.mjs "email@example.com" "hobby project"
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { FREE_LICENSE_CAP } from "../license.mjs";

const email = process.argv[2] || "";
const note = process.argv[3] || "";
const store = new URL("../FREE_KEYS_ISSUED.json", import.meta.url);

let data = { issued: [], cap: FREE_LICENSE_CAP };
if (existsSync(store)) {
  data = JSON.parse(readFileSync(store, "utf8"));
}

if ((data.issued || []).length >= FREE_LICENSE_CAP) {
  console.error(`Free Gate full (${FREE_LICENSE_CAP}/${FREE_LICENSE_CAP}). Sell Starting Gate+.`);
  process.exit(1);
}

const id = randomBytes(4).toString("hex").toUpperCase();
const key = `ZRW-FREE-${id}`;
const row = {
  key,
  email,
  note,
  issuedAt: new Date().toISOString(),
  slot: data.issued.length + 1,
};
data.issued.push(row);
data.cap = FREE_LICENSE_CAP;
writeFileSync(store, JSON.stringify(data, null, 2) + "\n");

console.log(JSON.stringify({
  ok: true,
  key,
  slot: row.slot,
  remaining: FREE_LICENSE_CAP - data.issued.length,
  limits: "100k ops/mo, 10k ints/call, no livestream, non-commercial",
}, null, 2));
