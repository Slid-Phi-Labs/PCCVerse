/** LicenseBox — monthly payment-check black box. Open while check succeeds; shut on fail. */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TRIAL_SECONDS = 24 * 60 * 60;
const PERIOD_SECONDS = 30 * 24 * 60 * 60;
const DIR = path.join(os.homedir(), ".license_box");

function fp() {
  return crypto.createHash("sha256").update([os.hostname(), os.platform(), os.arch()].join("|")).digest("hex").slice(0, 32);
}
function secret() {
  return process.env.LICENSE_HMAC_SECRET || "dev-only-change-me-in-production";
}
function sign(payload) {
  const body = JSON.stringify(payload, Object.keys(payload).sort());
  return body + "." + crypto.createHmac("sha256", secret()).update(body).digest("hex");
}
function verify(token) {
  try {
    const i = token.lastIndexOf(".");
    const body = token.slice(0, i);
    const sig = token.slice(i + 1);
    if (crypto.createHmac("sha256", secret()).update(body).digest("hex") !== sig) return null;
    return JSON.parse(body);
  } catch { return null; }
}
function licPath(id) {
  fs.mkdirSync(DIR, { recursive: true });
  return path.join(DIR, `${id}.lic`);
}
function load(id) {
  try {
    const p = verify(JSON.parse(fs.readFileSync(licPath(id), "utf8")).token || "");
    return p && p.project_id === id ? p : null;
  } catch { return null; }
}
function save(id, payload) {
  fs.writeFileSync(licPath(id), JSON.stringify({ token: sign(payload) }, null, 2));
}
function payUrl() {
  return process.env.LICENSE_PAY_URL || "https://buy.stripe.com/YOUR_LINK";
}

export function issueTrial(projectId) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { project_id: projectId, status: "trial", issued_at: now, expires_at: now + TRIAL_SECONDS, period_end: null, fp: fp(), license_id: crypto.randomUUID() };
  save(projectId, payload);
  return payload;
}
export function issueSubscriptionPeriod(projectId, ref = "", secs = PERIOD_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { project_id: projectId, status: "subscribed", issued_at: now, period_end: now + secs, payment_ref: ref, fp: fp(), license_id: crypto.randomUUID(), check_ok: true };
  save(projectId, payload);
  return payload;
}
export function markPaymentFailed(projectId) {
  const prev = load(projectId) || {};
  const now = Math.floor(Date.now() / 1000);
  const payload = { project_id: projectId, status: "shut", issued_at: prev.issued_at || now, period_end: now, payment_ref: prev.payment_ref || "", fp: fp(), license_id: prev.license_id || crypto.randomUUID(), check_ok: false };
  save(projectId, payload);
  return payload;
}
async function remoteCheck(projectId) {
  const url = (process.env.LICENSE_CHECK_URL || "").trim();
  if (!url) return { active: null, mode: "offline" };
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: projectId, fp: fp() }) });
    const data = await res.json();
    return { active: !!data.active, period_end: data.period_end, mode: "remote" };
  } catch (e) {
    return { active: false, mode: "remote_error", error: String(e) };
  }
}
export async function runPaymentCheck(projectId) {
  const remote = await remoteCheck(projectId);
  if (remote.mode === "offline") {
    const lic = load(projectId);
    const now = Math.floor(Date.now() / 1000);
    if (lic?.status === "subscribed" && (lic.period_end || 0) > now) return { ok: true, status: "subscribed", license: lic };
    return { ok: false, status: "shut", message: "Period ended", license: lic };
  }
  if (remote.active) {
    const now = Math.floor(Date.now() / 1000);
    const secs = remote.period_end ? Math.max(60, remote.period_end - now) : PERIOD_SECONDS;
    return { ok: true, status: "subscribed", license: issueSubscriptionPeriod(projectId, "remote_ok", secs) };
  }
  return { ok: false, status: "shut", message: `Payment failed. ${payUrl()}`, license: markPaymentFailed(projectId) };
}
export async function checkLicense(projectId, force = false) {
  let lic = load(projectId);
  const now = Math.floor(Date.now() / 1000);
  if (!lic) {
    lic = issueTrial(projectId);
    return { ok: true, status: "trial", seconds_left: lic.expires_at - now, license: lic };
  }
  if (lic.status === "shut") return { ok: false, status: "shut", message: payUrl(), license: lic };
  if (lic.status === "trial") {
    if (now < lic.expires_at) return { ok: true, status: "trial", seconds_left: lic.expires_at - now, license: lic };
    return runPaymentCheck(projectId);
  }
  if (lic.status === "subscribed") {
    if (force || now >= (lic.period_end || 0)) return runPaymentCheck(projectId);
    return { ok: true, status: "subscribed", seconds_left: lic.period_end - now, license: lic };
  }
  return { ok: false, status: "missing" };
}
export async function requireLicense(projectId) {
  const r = await checkLicense(projectId);
  console.log(`[LicenseBox:${projectId}] ${r.status}`);
  if (!r.ok) {
    console.error("*** BLACK BOX SHUT — payment required ***");
    process.exit(1);
  }
  return r;
}
export function licenseMiddleware(projectId) {
  return async (req, res, next) => {
    const result = await checkLicense(projectId);
    if (!result.ok) {
      res.statusCode = 402;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "payment_required", ...result, pay_url: payUrl() }));
      return;
    }
    req.license = result;
    if (typeof next === "function") next();
  };
}
