import { useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Cpu, Play, RotateCcw, Upload } from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  bytesEqual,
  decode,
  encode,
  formatBytes,
  utf8Decode,
  utf8Encode,
  type EncodeResult,
  type WindowMode,
} from "@/lib/swarm/engine";import { gzipSize } from "@/lib/swarm/gzip";
import { SAMPLES, type SampleId } from "@/lib/swarm/samples";
import { NcaCanvas } from "./nca-canvas";
import { SchoolPanel } from "./school-panel";

const MAX_BYTES = 96_000;

type Tab = "lab" | "school" | "bench";

type Metrics = EncodeResult & {
  decodeMs: number;
  lossless: boolean;
  gzip: number | null;
};

type BenchRow = {
  id: string;
  label: string;
  original: number;
  isolated: number;
  chained: number;
  gzip: number | null;
  encodeMs: number;
  decodeMs: number;
  lossless: boolean;
};

function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="h-8 w-16 animate-pulse rounded-sm bg-bg-subtle" />;
  }
  return user ? (
    <SignedIn>
      <UserButton />
    </SignedIn>
  ) : (
    <SignedOut>
      <a
        href="/login"
        className="inline-flex min-h-11 items-center px-2 text-sm text-fg-muted hover:text-fg"
      >
        Sign in
      </a>
    </SignedOut>
  );
}

export function SwarmLab() {
  const [tab, setTab] = useState<Tab>("lab");
  const [text, setText] = useState(SAMPLES[1]!.build());
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [sample, setSample] = useState<SampleId>("repeat");
  const [steps, setSteps] = useState(3);
  const [windowMode, setWindowMode] = useState<WindowMode>("chained");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [hex, setHex] = useState("");
  const [frame, setFrame] = useState(0);
  const [bench, setBench] = useState<BenchRow[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const inputBytes = useMemo(() => bytes ?? utf8Encode(text), [bytes, text]);
  const overCap = inputBytes.length > MAX_BYTES;
  const src = overCap ? inputBytes.slice(0, MAX_BYTES) : inputBytes;

  async function runOn(data: Uint8Array, mode: WindowMode = windowMode): Promise<Metrics> {
    const encoded = encode(data, steps, mode);
    const decoded = decode(encoded.compressed);
    const gzip = await gzipSize(data);
    return {
      ...encoded,
      decodeMs: decoded.decodeMs,
      lossless: bytesEqual(data, decoded.bytes),
      gzip,
    };
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const result = await runOn(src);
      setMetrics(result);
      setFrame(Math.max(0, result.frames.length - 1));
      const preview = result.compressed.slice(0, 56);
      setHex(Array.from(preview, (b) => b.toString(16).padStart(2, "0")).join(" "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Encode failed");
      setMetrics(null);
    } finally {
      setBusy(false);
    }
  }

  function loadSample(id: Exclude<SampleId, "custom">) {
    const found = SAMPLES.find((s) => s.id === id);
    if (!found) return;
    setSample(id);
    setText(found.build());
    setBytes(null);
    setMetrics(null);
    setHex("");
  }

  function downloadPayload() {
    if (!metrics) return;
    const blob = new Blob([metrics.compressed as BlobPart], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payload.swm2";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File) {
    const buf = new Uint8Array(await file.arrayBuffer());
    setBytes(buf);
    setSample("custom");
    setText(utf8Decode(buf.slice(0, 4000)));
    setMetrics(null);
    setHex("");
  }

  async function runBench() {
    setBusy(true);
    setError(null);
    try {
      const rows: BenchRow[] = [];
      for (const s of SAMPLES) {
        const data = utf8Encode(s.build());
        const isolated = await runOn(data, "isolated");
        const chained = await runOn(data, "chained");
        rows.push({
          id: s.id,
          label: s.label,
          original: chained.originalSize,
          isolated: isolated.compressedSize,
          chained: chained.compressedSize,
          gzip: chained.gzip,
          encodeMs: chained.encodeMs,
          decodeMs: chained.decodeMs,
          lossless: isolated.lossless && chained.lossless,
        });
      }
      setBench(rows);
      setTab("bench");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bench failed");
    } finally {
      setBusy(false);
    }
  }

  const shownFrame = metrics?.frames[Math.min(frame, metrics.frames.length - 1)] ?? [];
  const ratioPct = metrics ? (1 - metrics.ratio) * 100 : 0;
  const vsGzip =
    metrics?.gzip != null && metrics.gzip > 0 ? metrics.compressedSize / metrics.gzip : null;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="font-mono text-xs tracking-[0.22em] text-fg-subtle">SWM2 · 32 KB</p>
            <h1 className="font-display text-xl font-medium tracking-tight sm:text-2xl">SWARM-NCA</h1>
          </div>
          <AuthSlot />
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 px-4 pb-3 sm:px-6">
          {(
            [
              ["lab", "Lab"],
              ["school", "School"],
              ["bench", "Bench"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`min-h-11 rounded-sm px-4 text-sm ${
                tab === id ? "bg-bg-subtle text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {tab === "school" ? <SchoolPanel /> : null}

        {tab === "bench" ? (
          <section className="rounded-xl border border-border bg-bg-elevated p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-medium tracking-tight">Fixture bench</h2>
                <p className="mt-1 text-sm text-fg-muted">
                Same encode path as the lab. Isolated = 4 KB workers (parallel). Chained =
                32 KB lookback (sequential). gzip is the browser CompressionStream. vs gzip
                uses the chained size.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runBench()}
                className="inline-flex min-h-11 items-center gap-2 rounded-sm bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-40"
              >
                <Play className="size-4" />
                {busy ? "Running" : "Run bench"}
              </button>
            </div>
            {bench ? (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-fg-subtle">
                      <th className="py-2 pr-3 font-medium">Fixture</th>
                      <th className="py-2 pr-3 font-medium">In</th>
                      <th className="py-2 pr-3 font-medium">4 KB</th>
                      <th className="py-2 pr-3 font-medium">32 KB</th>
                      <th className="py-2 pr-3 font-medium">gzip</th>
                      <th className="py-2 pr-3 font-medium">vs gzip</th>
                      <th className="py-2 pr-3 font-medium">enc</th>
                      <th className="py-2 font-medium">ok</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs">
                    {bench.map((row) => {
                      const vs = row.gzip ? row.chained / row.gzip : null;
                      return (
                        <tr key={row.id} className="border-b border-border/80">
                          <td className="py-2 pr-3 font-sans text-sm text-fg">{row.label}</td>
                          <td className="py-2 pr-3 tabular-nums">{formatBytes(row.original)}</td>
                          <td className="py-2 pr-3 tabular-nums">{formatBytes(row.isolated)}</td>
                          <td className="py-2 pr-3 tabular-nums">{formatBytes(row.chained)}</td>
                          <td className="py-2 pr-3 tabular-nums">
                            {row.gzip == null ? "n/a" : formatBytes(row.gzip)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {vs == null ? "—" : `${vs.toFixed(2)}×`}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">{row.encodeMs.toFixed(1)} ms</td>
                          <td className={row.lossless ? "py-2 text-ok" : "py-2 text-danger"}>
                            {row.lossless ? "yes" : "NO"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-fg-muted">Run the suite to fill the table.</p>
            )}
          </section>
        ) : null}

        {tab === "lab" ? (
          <>
            <p className="max-w-2xl text-sm leading-normal text-fg-muted sm:text-base">
              Tuned SWM2: ULEB runs/matches, hash-chain finder, greedy / lazy / DP parse,
              last-offset repeats, 4 KB swarm clones, and a chained 32 KB window. Still
              lossless. Still honest against gzip.
            </p>

            <div className="mt-8 grid gap-6 lg:grid-cols-5">
              <section className="rounded-xl border border-border bg-bg-elevated p-4 sm:p-5 lg:col-span-3">
                <div className="flex flex-wrap gap-2">
                  {SAMPLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => loadSample(s.id)}
                      className={`min-h-11 rounded-sm border px-3 text-sm transition-colors duration-150 ${
                        sample === s.id
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-border text-fg-muted hover:border-border-strong hover:text-fg"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <label className="mt-5 block text-xs font-medium tracking-wide text-fg-subtle">
                  Input
                  <textarea
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setBytes(null);
                      setSample("custom");
                    }}
                    rows={10}
                    className="mt-2 w-full resize-y rounded-md border border-border bg-bg px-3 py-3 font-mono text-xs leading-relaxed text-fg outline-none focus:border-border-strong"
                    spellCheck={false}
                  />
                </label>

                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex flex-wrap items-end gap-6">
                    <label className="block text-xs font-medium tracking-wide text-fg-subtle">
                      NCA steps
                      <input
                        type="range"
                        min={1}
                        max={6}
                        value={steps}
                        onChange={(e) => setSteps(Number(e.target.value))}
                        className="mt-2 block w-48"
                      />
                      <span className="mt-1 block font-mono text-sm text-fg tabular-nums">
                        {steps}
                        {steps <= 1 ? " · greedy" : steps === 2 ? " · lazy" : " · DP"}
                      </span>
                    </label>
                    <div>
                      <p className="text-xs font-medium tracking-wide text-fg-subtle">Window</p>
                      <div className="mt-2 flex gap-2">
                        {(
                          [
                            ["chained", "32 KB chained"],
                            ["isolated", "4 KB isolated"],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setWindowMode(id)}
                            className={`min-h-11 rounded-sm border px-3 text-sm ${
                              windowMode === id
                                ? "border-accent bg-accent text-accent-fg"
                                : "border-border text-fg-muted hover:text-fg"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onFile(f);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex min-h-11 items-center gap-2 rounded-sm border border-border px-4 text-sm text-fg-muted hover:text-fg"
                    >
                      <Upload className="size-4" />
                      File
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setText("");
                        setBytes(null);
                        setMetrics(null);
                        setHex("");
                      }}
                      className="inline-flex min-h-11 items-center gap-2 rounded-sm border border-border px-4 text-sm text-fg-muted hover:text-fg"
                    >
                      <RotateCcw className="size-4" />
                      Clear
                    </button>
                    <button
                      type="button"
                      disabled={busy || inputBytes.length === 0}
                      onClick={() => void run()}
                      className="inline-flex min-h-11 items-center gap-2 rounded-sm bg-accent px-5 text-sm font-medium text-accent-fg disabled:opacity-40"
                    >
                      <Play className="size-4" />
                      {busy ? "Running" : "Encode + decode"}
                    </button>
                  </div>
                </div>
                <p className="mt-3 font-mono text-xs text-fg-subtle tabular-nums">
                  {formatBytes(inputBytes.length)}
                  {overCap ? ` — truncated to ${formatBytes(MAX_BYTES)}` : ""}
                  {bytes ? " · binary source" : ""}
                </p>
                {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
              </section>

              <aside className="space-y-4 lg:col-span-2">
                <div className="rounded-xl border border-border bg-bg-elevated p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium tracking-wide text-fg-subtle">Field</p>
                    {metrics && metrics.frames.length > 1 ? (
                      <label className="flex items-center gap-2 font-mono text-micro text-fg-subtle">
                        {frameLabel(Math.min(frame, metrics.frames.length - 1))}
                        <input
                          type="range"
                          min={0}
                          max={metrics.frames.length - 1}
                          value={Math.min(frame, metrics.frames.length - 1)}
                          onChange={(e) => setFrame(Number(e.target.value))}
                        />
                        {Math.min(frame, metrics.frames.length - 1) + 1}/{metrics.frames.length}
                      </label>
                    ) : null}
                  </div>
                  <div className="mt-3 overflow-hidden rounded-md border border-border bg-bg">
                    <NcaCanvas cells={shownFrame} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 font-mono text-micro text-fg-subtle">
                    <span className="inline-flex items-center gap-1.5">
                      <i className="size-2 rounded-full bg-lit" /> lit
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <i className="size-2 rounded-full bg-run" /> run
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <i className="size-2 rounded-full bg-match" /> match
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <i className="size-2 rounded-full bg-idle" /> idle
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <i className="size-2 rounded-full bg-clone" /> clone
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-bg-elevated p-4 sm:p-5">
                  <p className="text-xs font-medium tracking-wide text-fg-subtle">Metrics</p>
                  {metrics ? (
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                      <Stat label="Original" value={formatBytes(metrics.originalSize)} />
                      <Stat label="SWM2" value={formatBytes(metrics.compressedSize)} />
                      <Stat
                        label="Ratio"
                        value={`${metrics.ratio.toFixed(3)}×`}
                        hint={ratioPct > 0 ? `${ratioPct.toFixed(1)}% smaller` : "no shrink"}
                      />
                      <Stat
                        label="Lossless"
                        value={metrics.lossless ? "yes" : "NO"}
                        tone={metrics.lossless ? "ok" : "danger"}
                      />
                      <Stat label="Encode" value={`${metrics.encodeMs.toFixed(2)} ms`} />
                      <Stat label="Decode" value={`${metrics.decodeMs.toFixed(2)} ms`} />
                      <Stat
                        label="Parse"
                        value={metrics.parse}
                        hint={`${metrics.windowMode} · ${metrics.window + 1} B`}
                      />
                      <Stat
                        label="gzip"
                        value={metrics.gzip == null ? "n/a" : formatBytes(metrics.gzip)}
                        hint={vsGzip == null ? undefined : `SWM2 is ${vsGzip.toFixed(2)}× gzip`}
                      />
                      <Stat
                        label="Tags"
                        value={`${metrics.stats.runs}r ${metrics.stats.matches}m`}
                        hint={`${metrics.stats.lits} lit · ${metrics.stats.reps} rep · ${metrics.stats.clones} clone`}
                      />                    </dl>
                  ) : (
                    <p className="mt-3 text-sm text-fg-muted">Run a pass to see sizes and timings.</p>
                  )}
                  {metrics ? (
                    <button
                      type="button"
                      onClick={downloadPayload}
                      className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-sm border border-border-strong text-sm"
                    >
                      <ArrowDownToLine className="size-4" />
                      Download .swm2
                    </button>
                  ) : null}
                </div>
              </aside>
            </div>

            {metrics ? (
              <section className="mt-6 rounded-xl border border-border bg-bg-elevated p-4 sm:p-5">
                <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-fg-subtle">
                  <Cpu className="size-3.5" />
                  Swarm workers
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {metrics.events.map((ev) => (
                    <div key={ev.worker} className="rounded-md border border-border bg-bg px-3 py-3">
                      <p className="font-mono text-xs text-fg-subtle">
                        worker {ev.worker}
                        {ev.clonedFrom != null ? ` · clone of ${ev.clonedFrom}` : ""}
                      </p>
                      <p className="mt-1 font-mono text-sm tabular-nums text-fg">
                        {ev.start}–{ev.end}
                      </p>
                      <p className="text-xs text-fg-muted">
                        {ev.bytes} B
                        {ev.clonedFrom == null
                          ? ` · ${ev.lits}l ${ev.runs}r ${ev.matches}m`
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
                {hex ? (
                  <p className="mt-4 break-all font-mono text-micro leading-relaxed text-fg-subtle">
                    {hex}
                    {metrics.compressedSize > 56 ? " …" : ""}
                  </p>
                ) : null}
              </section>
            ) : null}

            <section className="mt-6 rounded-xl border border-border bg-bg-elevated p-4 sm:p-5">
              <h2 className="font-display text-lg font-medium tracking-tight">What changed</h2>
              <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-normal text-fg-muted">
                <li>Runs and matches use ULEB lengths — a 2 KB zero run is one op, not 120.</li>
                <li>Match finder is a 3-byte hash chain, with inherited matches so long repeats stay linear.</li>
                <li>Steps pick the parse: 1 greedy, 2 lazy neighbor yield, 3+ DP over short and long matches.</li>
                <li>Window: 4 KB isolated (parallel swarm) or 32 KB chained (workers may point at earlier chunks).</li>
                <li>A match that reuses the last offset drops the offset field (repeat).</li>
                <li>Identical 4 KB chunks store a 3-bit clone + worker index.</li>
              </ul>
              <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-bg p-4 font-mono text-micro leading-relaxed text-fg-muted">
{`0  + byte                 literal          9 bits
10 + uleb(len-2) + byte   run              2+8k+8
110+ uleb(len-3)+uleb(off) match           3+8k+8k
111+ uleb(len-3)          repeat last off
111+ uleb(src)            chunk clone (start)
cost = bits / covered_bytes; DP = argmin total bits`}
              </pre>
              <div className="mt-4 flex flex-wrap gap-4">
                <a
                  href="/swarm_nca.py"
                  download
                  className="inline-flex min-h-11 items-center text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                >
                  Download matching Python
                </a>
                <button
                  type="button"
                  onClick={() => setTab("school")}
                  className="inline-flex min-h-11 items-center text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                >
                  Open school
                </button>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function frameLabel(i: number): string {
  if (i === 0) return "vote";
  if (i === 1) return "greedy";
  if (i === 2) return "lazy";
  if (i === 3) return "dp";
  return "field";
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "danger";
}) {
  return (
    <div>
                    <dt className="text-micro tracking-wide text-fg-subtle">{label}</dt>
      <dd
        className={`mt-0.5 font-mono text-sm tabular-nums ${
          tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : "text-fg"
        }`}
      >
        {value}
      </dd>
      {hint ? <p className="text-micro text-fg-subtle">{hint}</p> : null}
    </div>
  );
}
