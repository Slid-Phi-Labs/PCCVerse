import { BitReader, BitWriter, ulebBits } from "./bits";

export const MAGIC = [0x53, 0x57, 0x4d, 0x32] as const; // SWM2
export const CHUNK_SIZE = 4096;
export const ISOLATED_WINDOW = 4095;
export const CHAINED_WINDOW = 32767;
export const WINDOW = CHAINED_WINDOW;
export const MIN_MATCH = 3;
export const MIN_RUN = 2;
export const HASH_BITS = 16;
export const HASH_SIZE = 1 << HASH_BITS;
export const CHAIN_PROBES = 64;
export const NCA_STEPS_DEFAULT = 3;
export const FLAG_CHAINED = 0x01;

export type WindowMode = "isolated" | "chained";
export type TagKind = "lit" | "run" | "match" | "idle" | "clone";
export type ParseMode = "greedy" | "lazy" | "dp";

export type CellTag =
  | { kind: "lit"; value: number; bits: number }
  | { kind: "run"; value: number; length: number; bits: number }
  | { kind: "match"; offset: number; length: number; bits: number }
  | { kind: "idle" }
  | { kind: "clone"; source: number; bits: number };

export type CellSnapshot = {
  byte: number;
  tag: TagKind;
  length: number;
  hidden: number;
};

export type SwarmEvent = {
  worker: number;
  chunk: number;
  start: number;
  end: number;
  bytes: number;
  clonedFrom: number | null;
  lits: number;
  runs: number;
  matches: number;
};

export type TagStats = {
  lits: number;
  runs: number;
  matches: number;
  clones: number;
  idle: number;
  reps: number;
  bytesFromRuns: number;
  bytesFromMatches: number;
};

export type EncodeResult = {
  compressed: Uint8Array;
  originalSize: number;
  compressedSize: number;
  ratio: number;
  encodeMs: number;
  steps: number;
  parse: ParseMode;
  windowMode: WindowMode;
  window: number;
  workers: number;
  chunks: number;
  frames: CellSnapshot[][];
  events: SwarmEvent[];
  bitsPerByte: number;
  stats: TagStats;
};

export type DecodeResult = {
  bytes: Uint8Array;
  decodeMs: number;
  workers: number;
  events: SwarmEvent[];
};

export type PositionLesson = {
  i: number;
  byte: number;
  ch: string;
  litBits: number;
  runLen: number;
  runBits: number | null;
  matchLen: number;
  matchOff: number;
  matchBits: number | null;
  winner: TagKind;
  winnerCost: number;
  greedy: TagKind;
  lazy: TagKind;
  dp: TagKind;
};

export function parseModeFor(steps: number): ParseMode {
  if (steps <= 1) return "greedy";
  if (steps === 2) return "lazy";
  return "dp";
}

export function windowSizeFor(mode: WindowMode): number {
  return mode === "chained" ? CHAINED_WINDOW : ISOLATED_WINDOW;
}

const EMPTY = new Uint8Array(0);

function runBitsOf(length: number): number {
  return 2 + ulebBits(length - MIN_RUN) + 8;
}

function matchBitsOf(length: number, offset: number): number {
  return 3 + ulebBits(length - MIN_MATCH) + ulebBits(offset - 1);
}

function pathCost(tag: CellTag): number {
  if (tag.kind === "lit") return tag.bits;
  if (tag.kind === "run" || tag.kind === "match") return tag.bits / tag.length;
  if (tag.kind === "clone") return 0;
  return 99;
}

function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a, 0x9e3779b1) ^ b;
  h = Math.imul(h, 0x9e3779b1) ^ c;
  return h & (HASH_SIZE - 1);
}

type Features = {
  value: number;
  run: number;
  matchOff: number;
  matchLen: number;
};

function scanFeatures(
  data: Uint8Array,
  history: Uint8Array = EMPTY,
  window = ISOLATED_WINDOW,
): Features[] {
  const n = data.length;
  const histLen = Math.min(history.length, window);
  const total = histLen + n;
  const view = histLen === 0 ? data : concatBytes(history.subarray(history.length - histLen), data);

  const out: Features[] = new Array(n);
  const runAt = new Uint32Array(n);
  for (let i = n - 1; i >= 0; i--) {
    const next = i + 1 < n && data[i] === data[i + 1] ? (runAt[i + 1] ?? 1) : 0;
    runAt[i] = 1 + next;
  }

  const head = new Int32Array(HASH_SIZE).fill(-1);
  const prev = new Int32Array(total).fill(-1);

  const insert = (pos: number) => {
    if (pos + 2 >= total) return;
    const h = hash3(view[pos] ?? 0, view[pos + 1] ?? 0, view[pos + 2] ?? 0);
    prev[pos] = head[h] ?? -1;
    head[h] = pos;
  };

  for (let p = 0; p < histLen; p++) insert(p);

  for (let j = 0; j < n; j++) {
    const i = histLen + j;
    const value = data[j] ?? 0;
    const run = runAt[j] ?? 1;
    let matchOff = 0;
    let matchLen = 0;
    const remain = n - j;
    if (j > 0) {
      const prevF = out[j - 1];
      if (prevF && prevF.matchLen > 1 && prevF.matchOff > 0) {
        matchLen = prevF.matchLen - 1;
        matchOff = prevF.matchOff;
      }
    }
    const skipMatch = (run >= remain && run >= MIN_RUN) || matchLen >= remain;

    if (!skipMatch && i + 2 < total) {
      const h = hash3(view[i] ?? 0, view[i + 1] ?? 0, view[i + 2] ?? 0);
      let pos = head[h] ?? -1;
      let probes = 0;
      while (pos >= 0 && probes < CHAIN_PROBES) {
        const dist = i - pos;
        if (dist > window) break;
        if (dist > 0) {
          let k = 0;
          while (k < remain && view[i + k] === view[pos + k]) k++;
          if (k > matchLen || (k === matchLen && k > 0 && dist < matchOff)) {
            matchLen = k;
            matchOff = dist;
            if (matchLen === remain) break;
          }
        }
        pos = prev[pos] ?? -1;
        probes += 1;
        if (matchLen >= 64 && probes >= 8) break;
      }
    }

    const runInterior = run > 3 && j > 0 && data[j] === data[j - 1];
    if (!runInterior) insert(i);

    out[j] = { value, run, matchOff, matchLen };
  }
  return out;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}


function proposeFrom(f: Features): CellTag {
  const candidates: CellTag[] = [{ kind: "lit", value: f.value, bits: 9 }];
  if (f.run >= MIN_RUN) {
    candidates.push({ kind: "run", value: f.value, length: f.run, bits: runBitsOf(f.run) });
  }
  if (f.matchLen >= MIN_MATCH) {
    candidates.push({
      kind: "match",
      offset: f.matchOff,
      length: f.matchLen,
      bits: matchBitsOf(f.matchLen, f.matchOff),
    });
  }
  let best = candidates[0]!;
  let bestCost = pathCost(best);
  for (let k = 1; k < candidates.length; k++) {
    const c = candidates[k]!;
    const cost = pathCost(c);
    if (cost < bestCost - 1e-9) {
      best = c;
      bestCost = cost;
    }
  }
  return best;
}

function settle(tags: CellTag[], lazy: boolean, feats: Features[]): CellTag[] {
  const out: CellTag[] = tags.map(() => ({ kind: "idle" }));
  let i = 0;
  while (i < tags.length) {
    let tag = tags[i] ?? { kind: "idle" as const };
    if (lazy && tag.kind === "match" && i + 1 < tags.length) {
      const next = tags[i + 1];
      if (next?.kind === "match" && next.length > tag.length) {
        tag = { kind: "lit", value: feats[i]?.value ?? 0, bits: 9 };
      }
    }
    if (tag.kind === "run" || tag.kind === "match") {
      out[i] = tag;
      i += tag.length;
    } else if (tag.kind === "lit") {
      out[i] = tag;
      i += 1;
    } else {
      i += 1;
    }
  }
  return out;
}

function cheaper(next: number, current: number): boolean {
  return next < current - 1e-9;
}

function matchLengthsToTry(maxL: number): number[] {
  if (maxL < MIN_MATCH) return [];
  const out: number[] = [];
  const cap = Math.min(maxL, 32);
  for (let L = MIN_MATCH; L <= cap; L++) out.push(L);
  if (maxL > 32) out.push(maxL);
  for (const L of [127 + MIN_MATCH, 128 + MIN_MATCH, 255 + MIN_MATCH]) {
    if (L > 32 && L < maxL) out.push(L);
  }
  return out;
}


export function optimalParse(feats: Features[]): CellTag[] {
  const n = feats.length;
  if (n === 0) return [];
  const inf = 1e15;
  const dp = new Float64Array(n + 1);
  dp.fill(inf);
  dp[0] = 0;
  const via = new Array<CellTag | null>(n + 1).fill(null);

  for (let i = 0; i < n; i++) {
    const base = dp[i] ?? inf;
    if (base >= inf) continue;
    const f = feats[i]!;

    const litCost = base + 9;
    if (cheaper(litCost, dp[i + 1] ?? inf)) {
      dp[i + 1] = litCost;
      via[i + 1] = { kind: "lit", value: f.value, bits: 9 };
    }

    if (f.run >= MIN_RUN) {
      const bits = runBitsOf(f.run);
      const j = i + f.run;
      const c = base + bits;
      if (j <= n && cheaper(c, dp[j] ?? inf)) {
        dp[j] = c;
        via[j] = { kind: "run", value: f.value, length: f.run, bits };
      }
    }

    if (f.matchLen >= MIN_MATCH) {
      const lengths = matchLengthsToTry(f.matchLen);
      for (let t = 0; t < lengths.length; t++) {
        const L = lengths[t]!;
        const bits = matchBitsOf(L, f.matchOff);
        const j = i + L;
        const c = base + bits;
        if (j <= n && cheaper(c, dp[j] ?? inf)) {
          dp[j] = c;
          via[j] = { kind: "match", offset: f.matchOff, length: L, bits };
        }
      }
    }
  }

  const placed: CellTag[] = Array.from({ length: n }, () => ({ kind: "idle" }));
  let i = n;
  while (i > 0) {
    const tag = via[i];
    if (!tag) {
      i -= 1;
      continue;
    }
    const start = tag.kind === "run" || tag.kind === "match" ? i - tag.length : i - 1;
    if (start < 0) break;
    placed[start] = tag;
    i = start;
  }
  return placed;
}

export function tagsBitCost(tags: CellTag[]): number {
  let bits = 0;
  for (const t of tags) {
    if (t.kind === "lit" || t.kind === "run" || t.kind === "match") bits += t.bits;
  }
  return bits;
}

function snapshot(data: Uint8Array, tags: CellTag[], hidden: Float32Array): CellSnapshot[] {
  return Array.from({ length: data.length }, (_, i) => {
    const tag = tags[i] ?? { kind: "idle" as const };
    return {
      byte: data[i] ?? 0,
      tag: tag.kind,
      length: tag.kind === "run" || tag.kind === "match" ? tag.length : 1,
      hidden: hidden[i] ?? 0,
    };
  });
}

function diffuse(hidden: Float32Array): Float32Array {
  const n = hidden.length;
  const next = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const left = hidden[i === 0 ? i : i - 1] ?? 0;
    const right = hidden[i === n - 1 ? i : i + 1] ?? 0;
    next[i] = Math.tanh(0.55 * (hidden[i] ?? 0) + 0.22 * left + 0.22 * right);
  }
  return next;
}

function evolveChunk(
  data: Uint8Array,
  steps: number,
  history: Uint8Array = EMPTY,
  window = ISOLATED_WINDOW,
): { tags: CellTag[]; frames: CellSnapshot[][]; feats: Features[] } {
  const n = data.length;
  const hidden = new Float32Array(n);
  for (let i = 0; i < n; i++) hidden[i] = (data[i] ?? 0) / 255;
  const feats = scanFeatures(data, history, window);
  const proposed = feats.map(proposeFrom);
  const greedy = settle(proposed, false, feats);
  const lazy = settle(proposed, true, feats);
  const dp = optimalParse(feats);
  const mode = parseModeFor(steps);
  const tags = mode === "dp" ? dp : mode === "lazy" ? lazy : greedy;


  const frames: CellSnapshot[][] = [];
  frames.push(snapshot(data, proposed, hidden));
  hidden.set(diffuse(hidden));
  frames.push(snapshot(data, greedy, hidden));
  if (steps >= 2) {
    hidden.set(diffuse(hidden));
    frames.push(snapshot(data, lazy, hidden));
  }
  if (steps >= 3) {
    hidden.set(diffuse(hidden));
    frames.push(snapshot(data, dp, hidden));
  }
  for (let t = 4; t <= steps; t++) {
    hidden.set(diffuse(hidden));
    frames.push(snapshot(data, tags, hidden));
  }

  return { tags, frames, feats };
}

function packTags(tags: CellTag[], data: Uint8Array, w: BitWriter, lastOff: number): { reps: number; lastOff: number } {
  let reps = 0;
  let i = 0;
  while (i < tags.length) {
    const tag = tags[i];
    if (tag?.kind === "run") {
      w.writeBits(0b10, 2);
      w.writeUleb(tag.length - MIN_RUN);
      w.writeByte(tag.value);
      i += tag.length;
      continue;
    }
    if (tag?.kind === "match") {
      if (lastOff === tag.offset && lastOff > 0) {
        w.writeBits(0b111, 3);
        w.writeUleb(tag.length - MIN_MATCH);
        reps += 1;
      } else {
        w.writeBits(0b110, 3);
        w.writeUleb(tag.length - MIN_MATCH);
        w.writeUleb(tag.offset - 1);
      }
      lastOff = tag.offset;
      i += tag.length;
      continue;
    }
    w.writeBit(0);
    w.writeByte(tag?.kind === "lit" ? tag.value : (data[i] ?? 0));
    i += 1;
  }
  return { reps, lastOff };
}

function unpackOps(
  r: BitReader,
  dest: Uint8Array,
  start: number,
  length: number,
  lastOff: number,
): number {
  let i = start;
  const end = start + length;
  while (i < end) {
    const b0 = r.readBit();
    if (b0 === 0) {
      dest[i] = r.readByte();
      i += 1;
      continue;
    }
    const b1 = r.readBit();
    if (b1 === 0) {
      const len = r.readUleb() + MIN_RUN;
      const value = r.readByte();
      for (let k = 0; k < len && i < end; k++) dest[i++] = value;
      continue;
    }
    const b2 = r.readBit();
    let len: number;
    let offset: number;
    if (b2 !== 0) {
      if (lastOff <= 0 || lastOff > i) throw new Error("Bad repeat offset");
      len = r.readUleb() + MIN_MATCH;
      offset = lastOff;
    } else {
      len = r.readUleb() + MIN_MATCH;
      offset = r.readUleb() + 1;
      if (offset <= 0 || offset > i) throw new Error("Bad match offset");
      lastOff = offset;
    }
    for (let k = 0; k < len && i < end; k++) {
      dest[i] = dest[i - offset] ?? 0;
      i += 1;
    }
  }
  return lastOff;
}


function fnv1a(data: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i] ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function countTags(tags: CellTag[]): Pick<SwarmEvent, "lits" | "runs" | "matches"> {
  let lits = 0;
  let runs = 0;
  let matches = 0;
  for (const t of tags) {
    if (t.kind === "lit") lits += 1;
    else if (t.kind === "run") runs += 1;
    else if (t.kind === "match") matches += 1;
  }
  return { lits, runs, matches };
}

export function encode(
  input: Uint8Array,
  steps = NCA_STEPS_DEFAULT,
  windowMode: WindowMode = "chained",
): EncodeResult {
  const t0 = performance.now();
  const win = windowSizeFor(windowMode);
  const chained = windowMode === "chained";
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < input.length; i += CHUNK_SIZE) {
    chunks.push(input.subarray(i, Math.min(i + CHUNK_SIZE, input.length)));
  }
  if (chunks.length === 0) chunks.push(new Uint8Array(0));

  const w = new BitWriter();
  const lastFrame: CellSnapshot[] = [];
  const firstChunkFrames: CellSnapshot[][] = [];
  const events: SwarmEvent[] = [];
  const seen = new Map<string, number>();
  const stats: TagStats = {
    lits: 0,
    runs: 0,
    matches: 0,
    clones: 0,
    idle: 0,
    reps: 0,
    bytesFromRuns: 0,
    bytesFromMatches: 0,
  };
  let lastOff = 0;

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c]!;
    const key = `${chunk.length}:${fnv1a(chunk)}`;
    const prev = seen.get(key);
    const same =
      prev !== undefined &&
      chunks[prev] &&
      chunks[prev]!.length === chunk.length &&
      bytesEqual(chunks[prev]!, chunk);

    if (same && prev !== undefined) {
      w.writeBits(0b111, 3);
      w.writeUleb(prev);
      seen.set(key, c);
      stats.clones += 1;
      lastOff = 0;
      const cloneSnap: CellSnapshot[] = Array.from(chunk, (byte) => ({
        byte,
        tag: "clone" as const,
        length: chunk.length,
        hidden: byte / 255,
      }));
      lastFrame.push(...cloneSnap);
      events.push({
        worker: c,
        chunk: c,
        start: c * CHUNK_SIZE,
        end: c * CHUNK_SIZE + chunk.length,
        bytes: chunk.length,
        clonedFrom: prev,
        lits: 0,
        runs: 0,
        matches: 0,
      });
      continue;
    }
    seen.set(key, c);

    const origin = c * CHUNK_SIZE;
    const histStart = chained ? Math.max(0, origin - win) : origin;
    const history = chained && origin > 0 ? input.subarray(histStart, origin) : EMPTY;
    const { tags, frames } = evolveChunk(chunk, Math.max(1, steps), history, win);
    if (c === 0) firstChunkFrames.push(...frames);
    const last = frames[frames.length - 1] ?? [];
    lastFrame.push(...last);
    if (!chained) lastOff = 0;
    const packed = packTags(tags, chunk, w, lastOff);
    lastOff = packed.lastOff;
    stats.reps += packed.reps;
    const counts = countTags(tags);
    stats.lits += counts.lits;
    stats.runs += counts.runs;
    stats.matches += counts.matches;
    for (const t of tags) {
      if (t.kind === "idle") stats.idle += 1;
      if (t.kind === "run") stats.bytesFromRuns += t.length;
      if (t.kind === "match") stats.bytesFromMatches += t.length;
    }
    events.push({
      worker: c,
      chunk: c,
      start: origin,
      end: origin + chunk.length,
      bytes: chunk.length,
      clonedFrom: null,
      ...counts,
    });
  }

  const payload = w.toBytes();
  const header = new Uint8Array(14);
  header.set(MAGIC, 0);
  const view = new DataView(header.buffer);
  view.setUint32(4, input.length, false);
  header[8] = steps & 0xff;
  header[9] = chained ? FLAG_CHAINED : 0;
  view.setUint16(10, CHUNK_SIZE, false);
  view.setUint16(12, Math.min(65535, chunks.length), false);

  const compressed = new Uint8Array(header.length + payload.length);
  compressed.set(header, 0);
  compressed.set(payload, header.length);

  const frames = firstChunkFrames.length ? firstChunkFrames : [lastFrame];
  if (chunks.length > 1 && lastFrame.length && frames[frames.length - 1] !== lastFrame) {
    frames.push(lastFrame);
  }

  return {
    compressed,
    originalSize: input.length,
    compressedSize: compressed.length,
    ratio: input.length === 0 ? 1 : compressed.length / input.length,
    encodeMs: performance.now() - t0,
    steps,
    parse: parseModeFor(steps),
    windowMode,
    window: win,
    workers: chunks.length,
    chunks: chunks.length,
    frames,
    events,
    bitsPerByte: input.length === 0 ? 0 : (payload.length * 8) / input.length,
    stats,
  };
}

export function decode(blob: Uint8Array): DecodeResult {
  const t0 = performance.now();
  if (blob.length < 14) throw new Error("Truncated swarm header");
  if (blob[0] !== MAGIC[0] || blob[1] !== MAGIC[1] || blob[2] !== MAGIC[2] || blob[3] !== MAGIC[3]) {
    throw new Error("Not a SWM2 payload");
  }
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const originalSize = view.getUint32(4, false);
  const flags = blob[9] ?? 0;
  const chained = (flags & FLAG_CHAINED) !== 0;
  const chunkSize = view.getUint16(10, false) || CHUNK_SIZE;
  const workerHint = view.getUint16(12, false);
  const r = new BitReader(blob.subarray(14));

  const out = new Uint8Array(originalSize);
  const prior: Uint8Array[] = [];
  const events: SwarmEvent[] = [];
  let offset = 0;
  let worker = 0;
  let lastOff = 0;
  while (offset < originalSize) {
    const len = Math.min(chunkSize, originalSize - offset);
    let clonedFrom: number | null = null;
    const saved = r.offset;
    const flag = r.remainingBits >= 3 ? r.readBits(3) : 0;
    if (flag === 0b111) {
      const src = r.readUleb();
      const donor = prior[src];
      if (!donor || donor.length < len) throw new Error("Bad chunk clone");
      out.set(donor.subarray(0, len), offset);
      clonedFrom = src;
      lastOff = 0;
    } else {
      r.seek(saved);
      if (!chained) lastOff = 0;
      lastOff = unpackOps(r, out, offset, len, lastOff);
    }
    prior.push(out.subarray(offset, offset + len));
    events.push({
      worker,
      chunk: worker,
      start: offset,
      end: offset + len,
      bytes: len,
      clonedFrom,
      lits: 0,
      runs: 0,
      matches: 0,
    });
    offset += len;
    worker += 1;
  }

  return {
    bytes: out,
    decodeMs: performance.now() - t0,
    workers: workerHint || worker,
    events,
  };
}


export function lessonFor(text: string): PositionLesson[] {
  const data = utf8Encode(text);
  const feats = scanFeatures(data);
  const proposed = feats.map(proposeFrom);
  const greedy = settle(proposed, false, feats);
  const lazy = settle(proposed, true, feats);
  const dp = optimalParse(feats);
  return feats.map((f, i) => {
    const tag = proposed[i]!;
    const ch = text[i] ?? "·";
    return {
      i,
      byte: f.value,
      ch: ch === "\n" ? "↵" : ch,
      litBits: 9,
      runLen: f.run,
      runBits: f.run >= MIN_RUN ? runBitsOf(f.run) : null,
      matchLen: f.matchLen,
      matchOff: f.matchOff,
      matchBits: f.matchLen >= MIN_MATCH ? matchBitsOf(f.matchLen, f.matchOff) : null,
      winner: tag.kind,
      winnerCost: pathCost(tag),
      greedy: greedy[i]?.kind ?? "idle",
      lazy: lazy[i]?.kind ?? "idle",
      dp: dp[i]?.kind ?? "idle",
    };
  });
}

export function parseCosts(text: string): { greedy: number; lazy: number; dp: number } {
  const data = utf8Encode(text);
  const feats = scanFeatures(data);
  const proposed = feats.map(proposeFrom);
  return {
    greedy: tagsBitCost(settle(proposed, false, feats)),
    lazy: tagsBitCost(settle(proposed, true, feats)),
    dp: tagsBitCost(optimalParse(feats)),
  };
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
