#!/usr/bin/env node
/**
 * Zero Range Wave HTTP API
 *
 * Auth: Authorization: Bearer <ZRW-… license key>
 *       or X-ZRW-License: <key>
 *       or ?key=
 *
 * Endpoints:
 *   GET  /health
 *   GET  /v1/license
 *   POST /v1/compress      { values: number[], k?: number }
 *   POST /v1/decompress    { packed: base64|number[] }
 *   POST /v1/compress/live { values: number[], k?: number }  // Pro+
 *   GET  /v1/pricing
 *
 * Env:
 *   PORT (default 8787)
 *   ZRW_LICENSE  default server-side key (optional)
 *   ZRW_REQUIRE_KEY=1  reject missing keys (default 1 for API)
 *   ZRW_CORS_ORIGIN  default *
 */
import http from "node:http";
import { URL } from "node:url";
import {
  compress,
  decompress,
  compressLive,
  decompressLive,
  setLicenseKey,
  getLicenseInfo,
  LIMITS,
  Tiers,
} from "./index.mjs";
import { FREE_LICENSE_CAP } from "./license.mjs";

const PORT = Number(process.env.PORT || 8787);
const REQUIRE_KEY = process.env.ZRW_REQUIRE_KEY !== "0";
const CORS = process.env.ZRW_CORS_ORIGIN || "*";

if (process.env.ZRW_LICENSE) {
  setLicenseKey(process.env.ZRW_LICENSE);
}

const PRICING = {
  free_gate: {
    priceUsd: 0,
    seats: FREE_LICENSE_CAP,
    buyUrl: null,
    note: "25 free licenses max — email ceedotrock@gmail.com subject ZRW FREE",
  },
  starting_gate: {
    priceUsd: 79,
    buyUrl: "https://buy.stripe.com/28EfZic3z69i3P72Wc6wE0b",
  },
  pro_starter: {
    priceUsd: 249,
    buyUrl: "https://buy.stripe.com/cNidRaebHbtC71j8gw6wE0c",
  },
  l33t_unlimited: {
    priceUsd: 699,
    buyUrl: "https://buy.stripe.com/14AeVe9Vr8hqadvbsI6wE0d",
  },
};

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": CORS,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-ZRW-License",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function extractKey(req, url) {
  const h = req.headers.authorization || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  if (req.headers["x-zrw-license"]) return String(req.headers["x-zrw-license"]).trim();
  if (url.searchParams.get("key")) return url.searchParams.get("key").trim();
  return process.env.ZRW_LICENSE || null;
}

function applyKey(req, url) {
  const key = extractKey(req, url);
  if (!key) {
    if (REQUIRE_KEY) {
      const err = new Error(
        "Missing license key. Set Authorization: Bearer ZRW-… or buy: " +
          PRICING.starting_gate.buyUrl,
      );
      err.status = 401;
      throw err;
    }
    setLicenseKey(null);
    return;
  }
  const info = setLicenseKey(key);
  if (!info.valid && REQUIRE_KEY) {
    const err = new Error("Invalid license key format");
    err.status = 401;
    throw err;
  }
}

function toBase64(u8) {
  return Buffer.from(u8).toString("base64");
}

function fromPacked(input) {
  if (input == null) throw new Error("packed required");
  if (typeof input === "string") {
    return new Uint8Array(Buffer.from(input, "base64"));
  }
  if (Array.isArray(input)) return new Uint8Array(input);
  if (input instanceof Uint8Array) return input;
  throw new Error("packed must be base64 string or number[]");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": CORS,
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-ZRW-License",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    return res.end();
  }

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        service: "zero-range-wave-api",
        version: "5.0.0",
      });
    }

    if (req.method === "GET" && url.pathname === "/v1/pricing") {
      return json(res, 200, {
        product: "zero-range-wave-compression",
        tiers: PRICING,
        limits: LIMITS,
        freeCap: FREE_LICENSE_CAP,
      });
    }

    // All other /v1 need key when REQUIRE_KEY
    if (url.pathname.startsWith("/v1/")) {
      applyKey(req, url);
    }

    if (req.method === "GET" && url.pathname === "/v1/license") {
      return json(res, 200, getLicenseInfo());
    }

    if (req.method === "POST" && url.pathname === "/v1/compress") {
      const body = await readBody(req);
      const values = body.values;
      if (!Array.isArray(values)) {
        return json(res, 400, { error: "values: number[] required" });
      }
      const packed = compress(values, body.k);
      return json(res, 200, {
        packed: toBase64(packed),
        bytes: packed.length,
        n: values.length,
        license: getLicenseInfo(),
      });
    }

    if (req.method === "POST" && url.pathname === "/v1/decompress") {
      const body = await readBody(req);
      const packed = fromPacked(body.packed);
      const values = decompress(packed);
      return json(res, 200, {
        values,
        n: values.length,
        license: getLicenseInfo(),
      });
    }

    if (req.method === "POST" && url.pathname === "/v1/compress/live") {
      const body = await readBody(req);
      const values = body.values;
      if (!Array.isArray(values)) {
        return json(res, 400, { error: "values: number[] required" });
      }
      const packed = compressLive(values, { k: body.k ?? 0 });
      return json(res, 200, {
        packed: toBase64(packed),
        bytes: packed.length,
        n: values.length,
        livestream: true,
        license: getLicenseInfo(),
      });
    }

    if (req.method === "POST" && url.pathname === "/v1/decompress/live") {
      const body = await readBody(req);
      const packed = fromPacked(body.packed);
      const values = decompressLive(packed, { k: body.k ?? 0 });
      return json(res, 200, {
        values,
        n: values.length,
        livestream: true,
        license: getLicenseInfo(),
      });
    }

    return json(res, 404, {
      error: "Not found",
      routes: [
        "GET /health",
        "GET /v1/pricing",
        "GET /v1/license",
        "POST /v1/compress",
        "POST /v1/decompress",
        "POST /v1/compress/live",
        "POST /v1/decompress/live",
      ],
    });
  } catch (e) {
    const msg = String(e.message || "");
    const status = e.status || (/corrupt/i.test(msg) ? 400 : msg.includes("ZRW:") ? 402 : 500);
    return json(res, status, {
      error: e.message || String(e),
      pricing: PRICING,
      license: (() => {
        try {
          return getLicenseInfo();
        } catch {
          return null;
        }
      })(),
    });
  }
});

server.listen(PORT, () => {
  console.log(
    JSON.stringify({
      ok: true,
      listening: PORT,
      requireKey: REQUIRE_KEY,
      tiers: Object.keys(PRICING),
    }),
  );
});
