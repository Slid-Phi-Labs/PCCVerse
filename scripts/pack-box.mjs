#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { ensurePackKey } = await import("../src/splb.js");
const priv = ensurePackKey();
const pem = crypto.createPublicKey(priv).export({ type: "spki", format: "pem" });
writeFileSync(
  join(root, "src/box-pubkey.js"),
  `/** Ed25519 verify key for SPLB. Pack key stays in ~/.swarm-smart/pack.key */\nexport const PUBKEY_PEM = ${JSON.stringify(pem)};\n`,
);
const { packDir } = await import("../src/splb.js?fresh=" + Date.now());
const blob = packDir(root, { name: "swarm-smart" });
mkdirSync(join(root, "boxes"), { recursive: true });
const out = join(root, "boxes/swarm-smart.splb");
writeFileSync(out, blob);
console.log("packed", out, blob.length, "bytes");
