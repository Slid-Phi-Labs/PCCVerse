import { useMemo, useState } from "react";
import { encode, lessonFor, parseCosts, utf8Encode } from "@/lib/swarm/engine";
import { SCHOOL_STRING } from "@/lib/swarm/samples";

const LESSONS = [
  {
    id: "cells",
    title: "1. The field",
    body: "Treat the file as a 1-D grid of cells, one per byte. Each cell only sees a local neighborhood — a run of identical bytes, or a back-reference into already-written history. That is the NCA: no global tokenizer, no vocabulary, just local votes.",
  },
  {
    id: "loss",
    title: "2. Efficient-path loss",
    body: "Reconstruction error is forced to zero (lossless). The remaining loss is bits per covered byte. A 9-bit literal that covers one byte loses to a 16-bit run that covers two hundred. The cell keeps the cheaper path.",
  },
  {
    id: "settle",
    title: "3. Settle + lazy",
    body: "Votes overlap. Greedy settle walks left to right and lets a winning run or match consume its span; covered cells go idle. If the next cell found a longer match, this cell yields and emits a literal — lazy matching is just the neighbor talking.",
  },
  {
    id: "dp",
    title: "4. DP parse (step 3)",
    body: "Greedy plus one-step lazy still misses cheaper global paths. Dynamic programming at each index tries a literal, the full run, and the full match, then backtracks the cheapest total. Steps: 1 greedy, 2 lazy, 3+ DP. Extra steps only animate the hidden field.",
  },
  {
    id: "swarm",
    title: "5. The swarm",
    body: "The grid still splits into 4 KB workers. Isolated mode never points into another worker — decode is embarrassingly parallel, and identical chunks store a clone index. That is the original swarm contract.",
  },
  {
    id: "window",
    title: "6. Chained 32 KB",
    body: "gzip’s real advantage was a 32 KB window across the whole file. Isolated 4 KB workers cannot see a repeat that started in the previous chunk. Chained mode seeds each worker with the previous 32 KB. Decode becomes sequential. Toggle it in the lab — JSON is the fixture that moves.",
  },
  {
    id: "honest",
    title: "7. What is still missing",
    body: "Literals are still 9 bits. gzip spends Huffman (and often a second pass) on the leftover alphabet. Next real gain is entropy on literals — not more NCA theater. The lab always shows both numbers. Do not ship a fake win.",
  },
];

type Mode = "vote" | "greedy" | "lazy" | "dp";

const MODE_HELP: Record<Mode, string> = {
  vote: "Raw local votes. Spans overlap — this is not a valid parse.",
  greedy: "Left-to-right settle. First cheap span wins; covered cells idle.",
  lazy: "If the next cell has a longer match, this cell emits a literal.",
  dp: "Globally cheapest sequence of literals, runs, and matches.",
};

function tagTone(kind: string): string {
  if (kind === "run") return "bg-run text-accent-fg";
  if (kind === "match") return "bg-match text-accent-fg";
  if (kind === "lit") return "bg-lit text-fg";
  if (kind === "clone") return "bg-clone text-fg";
  return "bg-idle text-fg-muted";
}

export function SchoolPanel() {
  const [raw, setRaw] = useState(SCHOOL_STRING);
  const [mode, setMode] = useState<Mode>("dp");
  const clipped = raw.slice(0, 48);
  const rows = useMemo(() => lessonFor(clipped), [clipped]);
  const costs = useMemo(() => parseCosts(clipped), [clipped]);
  const packed = useMemo(() => (clipped ? encode(utf8Encode(clipped), 3) : null), [clipped]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {LESSONS.map((lesson) => (
          <article key={lesson.id} className="rounded-lg border border-border bg-bg-elevated p-4 sm:p-5">
            <h3 className="font-display text-base font-medium tracking-tight">{lesson.title}</h3>
            <p className="mt-2 text-sm leading-normal text-fg-muted">{lesson.body}</p>
          </article>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-bg-elevated p-4 sm:p-5">
        <h3 className="font-display text-base font-medium tracking-tight">Walk a string</h3>
        <p className="mt-2 text-sm text-fg-muted">
          Each row is one cell. Costs are bits (not bits-per-byte). Vote is the cheapest local
          path before settle. Compare greedy, lazy, and DP on {SCHOOL_STRING} or paste anything
          short.
        </p>
        <label className="mt-4 block text-xs font-medium tracking-wide text-fg-subtle">
          Up to 48 bytes
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-md border border-border bg-bg px-3 font-mono text-sm text-fg outline-none focus:border-border-strong"
          />
        </label>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CostCard label="Greedy" value={`${costs.greedy} b`} />
          <CostCard label="Lazy" value={`${costs.lazy} b`} />
          <CostCard label="DP" value={`${costs.dp} b`} highlight />
          <CostCard
            label="SWM2 bytes"
            value={packed ? `${packed.compressedSize} B` : "—"}
            hint={packed ? `${packed.stats.runs}r ${packed.stats.matches}m ${packed.stats.reps}rep` : undefined}
          />
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          {(["vote", "greedy", "lazy", "dp"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`min-h-11 rounded-sm border px-3 text-sm capitalize ${
                mode === id
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border text-fg-muted hover:text-fg"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-fg-muted">{MODE_HELP[mode]}</p>

        <div className="mt-4 flex flex-wrap gap-1">
          {rows.map((row) => {
            const kind = mode === "vote" ? row.winner : row[mode];
            return (
              <span
                key={row.i}
                title={`${row.i} ${kind}`}
                className={`inline-flex min-h-11 min-w-9 items-center justify-center rounded-sm px-2 font-mono text-sm ${tagTone(kind)}`}
              >
                {row.ch}
              </span>
            );
          })}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left font-mono text-micro">
            <thead>
              <tr className="border-b border-border text-fg-subtle">
                <th className="py-2 pr-3 font-medium">i</th>
                <th className="py-2 pr-3 font-medium">ch</th>
                <th className="py-2 pr-3 font-medium">lit</th>
                <th className="py-2 pr-3 font-medium">run</th>
                <th className="py-2 pr-3 font-medium">match</th>
                <th className="py-2 pr-3 font-medium">vote</th>
                <th className="py-2 pr-3 font-medium">greedy</th>
                <th className="py-2 pr-3 font-medium">lazy</th>
                <th className="py-2 font-medium">dp</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.i} className="border-b border-border/80">
                  <td className="py-2 pr-3 tabular-nums text-fg-subtle">{row.i}</td>
                  <td className="py-2 pr-3 text-fg">{row.ch}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.litBits}</td>
                  <td className="py-2 pr-3 tabular-nums text-fg-muted">
                    {row.runBits == null ? "—" : `${row.runBits} / ${row.runLen}`}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-fg-muted">
                    {row.matchBits == null
                      ? "—"
                      : `${row.matchBits} / ${row.matchLen} @-${row.matchOff}`}
                  </td>
                  <td className="py-2 pr-3">{row.winner}</td>
                  <td className="py-2 pr-3">{row.greedy}</td>
                  <td className="py-2 pr-3">{row.lazy}</td>
                  <td className="py-2">{row.dp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CostCard({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-3 ${
        highlight ? "border-border-strong bg-bg-subtle" : "border-border bg-bg"
      }`}
    >
      <dt className="text-micro tracking-wide text-fg-subtle">{label}</dt>
      <dd className="mt-1 font-mono text-sm tabular-nums text-fg">{value}</dd>
      {hint ? <p className="mt-1 text-micro text-fg-subtle">{hint}</p> : null}
    </div>
  );
}
