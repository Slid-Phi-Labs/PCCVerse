#!/usr/bin/env node
/**
 * Zero Range Wave MCP server (stdio JSON-RPC subset)
 *
 * Tools:
 *   zrw_compress / zrw_decompress
 *   zrw_compress_live / zrw_decompress_live
 *   zrw_license_info / zrw_pricing
 *   zrw_bench_sample
 *
 * Env: ZRW_LICENSE
 *
 * Compatible with simple MCP-style tool listing used by agent hosts.
 * Protocol: newline-delimited JSON (JSON-RPC 2.0 style)
 */
import readline from "node:readline";
import {
  compress,
  decompress,
  compressLive,
  decompressLive,
  setLicenseKey,
  getLicenseInfo,
  LIMITS,
  FREE_LICENSE_CAP,
} from "./index.mjs";

if (process.env.ZRW_LICENSE) {
  setLicenseKey(process.env.ZRW_LICENSE);
}

const PRICING = {
  free_gate: {
    priceUsd: 0,
    seats: FREE_LICENSE_CAP,
    note: "25 free keys max — email ceedotrock@gmail.com subject ZRW FREE",
  },
  starting_gate: {
    priceUsd: 79,
    url: "https://buy.stripe.com/28EfZic3z69i3P72Wc6wE0b",
  },
  pro_starter: {
    priceUsd: 249,
    url: "https://buy.stripe.com/cNidRaebHbtC71j8gw6wE0c",
  },
  l33t_unlimited: {
    priceUsd: 699,
    url: "https://buy.stripe.com/14AeVe9Vr8hqadvbsI6wE0d",
  },
};

const TOOLS = [
  {
    name: "zrw_compress",
    description:
      "Compress integer sequence with Zero Range Wave. Returns base64 packed bytes + size stats.",
    inputSchema: {
      type: "object",
      properties: {
        values: { type: "array", items: { type: "number" } },
        license: { type: "string", description: "Optional ZRW-… license key" },
        k: { type: "number" },
      },
      required: ["values"],
    },
  },
  {
    name: "zrw_decompress",
    description: "Decompress ZRW packed base64 (or number[]) back to integer array.",
    inputSchema: {
      type: "object",
      properties: {
        packed: { type: "string", description: "base64 packed" },
        license: { type: "string" },
        k: { type: "number" },
      },
      required: ["packed"],
    },
  },
  {
    name: "zrw_compress_live",
    description:
      "Livestream/chunk compress (Pro Starter or l33t only). Same as compress with livestream entitlement.",
    inputSchema: {
      type: "object",
      properties: {
        values: { type: "array", items: { type: "number" } },
        license: { type: "string" },
        k: { type: "number" },
      },
      required: ["values"],
    },
  },
  {
    name: "zrw_decompress_live",
    description: "Livestream decompress (Pro Starter or l33t).",
    inputSchema: {
      type: "object",
      properties: {
        packed: { type: "string" },
        license: { type: "string" },
        k: { type: "number" },
      },
      required: ["packed"],
    },
  },
  {
    name: "zrw_license_info",
    description: "Current license tier, monthly ops used, and limits.",
    inputSchema: { type: "object", properties: { license: { type: "string" } } },
  },
  {
    name: "zrw_pricing",
    description: "Pricing tiers and Stripe buy URLs for ZRW.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "zrw_bench_sample",
    description:
      "Compress sample corpora (zeros, ramp, walk) and return sizes + RT ok flags.",
    inputSchema: {
      type: "object",
      properties: {
        license: { type: "string" },
      },
    },
  },
];

function b64(u8) {
  return Buffer.from(u8).toString("base64");
}

function fromB64(s) {
  return new Uint8Array(Buffer.from(s, "base64"));
}

function maybeKey(args) {
  if (args && args.license) setLicenseKey(args.license);
}

async function callTool(name, args = {}) {
  maybeKey(args);
  switch (name) {
    case "zrw_compress": {
      const packed = compress(args.values, args.k);
      return {
        packed: b64(packed),
        bytes: packed.length,
        n: args.values.length,
        license: getLicenseInfo(),
      };
    }
    case "zrw_decompress": {
      const values = decompress(fromB64(args.packed));
      return { values, n: values.length, license: getLicenseInfo() };
    }
    case "zrw_compress_live": {
      const packed = compressLive(args.values, { k: args.k });
      return {
        packed: b64(packed),
        bytes: packed.length,
        n: args.values.length,
        livestream: true,
        license: getLicenseInfo(),
      };
    }
    case "zrw_decompress_live": {
      const values = decompressLive(fromB64(args.packed), { k: args.k });
      return { values, n: values.length, livestream: true, license: getLicenseInfo() };
    }
    case "zrw_license_info":
      return getLicenseInfo();
    case "zrw_pricing":
      return { pricing: PRICING, limits: LIMITS };
    case "zrw_bench_sample": {
      const samples = {
        zeros_1k: Array(1000).fill(0),
        ramp_1k: Array.from({ length: 1000 }, (_, i) => i),
        walk_1k: (() => {
          const a = [0];
          for (let i = 1; i < 1000; i++) a.push(a[i - 1] + (i % 2 ? 1 : -1));
          return a;
        })(),
      };
      const out = {};
      for (const [name, values] of Object.entries(samples)) {
        const packed = compress(values);
        const back = decompress(packed);
        const ok =
          back.length === values.length && back.every((v, i) => v === values[i]);
        out[name] = {
          n: values.length,
          packedBytes: packed.length,
          rawBytesApprox: values.length * 4,
          ratio: packed.length / (values.length * 4),
          roundtrip: ok,
        };
      }
      return out;
    }
    default:
      throw new Error("Unknown tool: " + name);
  }
}

function respond(id, result, error) {
  const msg = error
    ? { jsonrpc: "2.0", id, error: { code: -32000, message: String(error.message || error) } }
    : { jsonrpc: "2.0", id, result };
  process.stdout.write(JSON.stringify(msg) + "\n");
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return respond(null, null, new Error("Invalid JSON"));
  }

  const { id, method, params } = msg;

  try {
    if (method === "initialize") {
      return respond(id, {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "zero-range-wave-mcp", version: "5.0.0" },
        capabilities: { tools: {} },
      });
    }
    if (method === "tools/list" || method === "list_tools") {
      return respond(id, { tools: TOOLS });
    }
    if (method === "tools/call" || method === "call_tool") {
      const name = params?.name || params?.tool;
      const args = params?.arguments || params?.args || {};
      const result = await callTool(name, args);
      return respond(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      });
    }
    if (method === "ping") {
      return respond(id, { ok: true });
    }
    // Convenience non-JSON-RPC: { "tool": "zrw_compress", "arguments": {...} }
    if (msg.tool) {
      const result = await callTool(msg.tool, msg.arguments || msg.args || {});
      return respond(id ?? 1, result);
    }
    return respond(id, null, new Error("Unknown method: " + method));
  } catch (e) {
    return respond(id, null, e);
  }
});

// stderr banner so hosts know we're up (not on stdout — reserved for JSON-RPC)
console.error(
  JSON.stringify({
    ok: true,
    mcp: "zero-range-wave",
    tools: TOOLS.map((t) => t.name),
  }),
);
