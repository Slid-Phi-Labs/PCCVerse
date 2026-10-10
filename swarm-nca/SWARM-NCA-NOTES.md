# SWARM-NCA — code pack and correspondence

Date: 2026-08-17
Owner: Corey Tasz (ceedot-rock / ceedotrock@gmail.com)
Project: lossless research compressor framed as NCA votes + swarm workers

This folder is the portable copy of the codec and the design thread.
The live lab is the browser UI. The Python twin is `swarm_nca.py`.

---

## What it is

A general lossless compressor. Not a neural net (no training, no GPU).
The “NCA” is a 1-D cell field: each byte votes for a local tag
(literal / run / match). Settle + lazy + DP pick the cheapest lossless path.
The “swarm” is 4 KB workers. Isolated workers never look at each other
(decode is parallel). Chained mode seeds each worker with the previous 32 KB
(decode is sequential, ratio is better).

Format: SWM2 (`SWM2` magic, 14-byte header).

```
0  + byte                 literal          9 bits
10 + uleb(len-2) + byte   run              2 + uleb + 8
110+ uleb(len-3)+uleb(off) match           3 + uleb + uleb
111+ uleb(src)            chunk clone (only legal at chunk start)
111+ uleb(len-3)          repeat last offset (inside a chunk)
```

Header byte 9 flag `0x01` = chained 32 KB window.

---

## Correspondence (this thread, compressed)

1. You asked for a research-prototype general compressor: NCA to break the
   data, neural swarm to reconstruct, faster/better than existing tools,
   no compute of your own, AI-written code, a loss that balances
   reconstruction / ratio / steps.
2. First cut (SWM1) was a toy LZ/RLE with 17/18-byte run/match caps.
   gzip crushed it. That was a real bug, not “research.”
3. You said implement all fixes, tweaks, tuning, and schooling.
4. SWM2: ULEB lengths, hash-chain finder, lazy neighbor yield, 4 KB clones,
   School tab, Bench vs gzip. Honest numbers. Motif 2.64 KB → 35 B.
5. You asked how to improve. Two real gaps vs gzip:
   - isolated 4 KB workers cannot see a repeat in the previous chunk
   - leftover literals are still 9 bits (gzip Huffman-codes them)
6. Shipped the first gap: chained 32 KB lookback + DP over short and long
   matches + a lab toggle. JSON 5.75 KB: isolated 403 B → chained 269 B
   vs browser gzip 279 B (0.96×). Beats gzip on that fixture.

Still open (do not fake this): entropy on literals. Prose 1.15× gzip and
source 1.05× gzip are under 4 KB — the window cannot help. That leftover
is the 9-bit literal. Next real stage is order-0 / order-1 Huffman or rANS
on the leftover alphabet. More NCA steps will not close it.

---

## Bench (browser, 2026-08-17, all lossless)

| Fixture | In | Isolated 4 KB | Chained 32 KB | gzip | vs gzip (chained) |
|---|---|---|---|---|---|
| Zeros | 2.00 KB | 18 B | 18 B | 35 B | 0.51× |
| Motif | 2.64 KB | 35 B | 35 B | 57 B | 0.61× |
| JSON | 5.75 KB | 403 B | 269 B | 279 B | 0.96× |
| Prose | 2.62 KB | 166 B | 166 B | 144 B | 1.15× |
| Source | 2.33 KB | 163 B | 163 B | 155 B | 1.05× |
| Clones | 8.00 KB | 37 B | 37 B | 69 B | 0.54× |
| Noise | 800 B | 198 B | 198 B | 232 B | 0.85× |

Python `zlib.compress(..., 9)` is a different gzip than the browser
CompressionStream. Both are shown honestly in their own benches.

---

## How to run the Python twin

```
python3 swarm_nca.py                 # self-test, isolated + chained
python3 swarm_nca.py file.bin -o out.swm2 --window chained --steps 3
python3 swarm_nca.py out.swm2 --decode -o file.bin
```

No third-party deps.

---

## Files in this pack

- `swarm_nca.py` — standalone encoder/decoder (the thing to keep)
- `engine.ts` — same semantics in the lab
- `bits.ts` — bitstream + ULEB
- `gzip.ts` — browser gzip size
- `samples.ts` — fixtures
- `swarm-lab.tsx` / `school-panel.tsx` / `nca-canvas.tsx` — UI
- `SWARM-NCA-NOTES.md` — this file

---

## Next if we keep going

1. Entropy stage on leftover literals (the real remaining gap).
2. Last-3 offsets (LZMA-style), not just last-1.
3. Optional: learned NCA vote weights if/when you have compute.
   Without compute, keep the hand-designed cell rule.
