/**
 * 24-hour black box, then the gate.
 * Demos keep running. Production residual is a paid seat.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const BOX_HOURS = 24;
export const BUY = {
  gate_year: "https://buy.stripe.com/7sY4gA6Jfapy1GZ8gw6wE0G",
  tru8_year: "https://buy.stripe.com/dRmaEY6Jf1T23P78gw6wE0E",
  chamber_year: "https://buy.stripe.com/dRmeVeaZv7dm99rcwM6wE0F",
  lab_pass: "https://buy.stripe.com/3cI7sM2sZ0OYfxP7cs6wE0D",
  license: "https://www.slidphilabs.com/license",
};

const DIR = join(homedir(), ".swarm-smart");
const FILE = join(DIR, "blackbox.json");

export function openBox() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
  if (!existsSync(FILE)) {
    const rec = { started: new Date().toISOString(), credit: "Powered by TRU8 · Slid Phi Labs" };
    writeFileSync(FILE, JSON.stringify(rec, null, 2), { mode: 0o600 });
    return { ...rec, hours: 0, open: true, first: true };
  }
  const rec = JSON.parse(readFileSync(FILE, "utf8"));
  const hours = (Date.now() - Date.parse(rec.started)) / 3600000;
  return { ...rec, hours, open: hours < BOX_HOURS, first: false };
}

export function gateStatus() {
  const box = openBox();
  return {
    protocol: "spl-blackbox-24h",
    box_open: box.open,
    hours_used: Number(box.hours.toFixed(3)),
    hours_left: Number(Math.max(0, BOX_HOURS - box.hours).toFixed(3)),
    demos: "free with credit",
    production: box.open ? "black-box eval" : "buy a seat",
    buy: BUY,
    inbox: "corey@slidphilabs.com",
  };
}
