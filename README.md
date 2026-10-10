# PCCVerse

The Breath of the Slid Phi machine: every Periodic-Table-of-compression
codec, coder, and demo in one private verse. Move and store 10× for 1× —
or refuse the claim.

| Codec | Path | What it is |
|---|---|---|
| neural-pcc | `neural-pcc/` | TNSSRC compressor 2. Silesia 12/12 DECODE_OK. Dual-licensed. |
| pulsar-best | `pulsar-best/` | pulsar 2.5.0, free lossless. Silesia 12/12; beats gzip-9, loses to xz-6. |
| trustream | `trustream/` | Lossless compression for live data streams, in 4KB tiles. |
| pccx-base | `pccx-base/` | PCCX lossless codec — base components. |
| pccx-handlers | `pccx-handlers/` | PCCX codec handlers. |
| zero-range-wave | `zero-range-wave-compression/` | ZRW v5 integer compressor: lib + API + MCP. |
| swarm-nca | `swarm-nca/` | Research compressor: NCA votes + swarm workers, chained 32KB window. |
| swarm-smart | `swarm-smart/` | Residual + swarm demo. Beats gzip on Calgary text. |
| aware-frame-v4 | `aware-frame-v4/` | Adaptive residual compression R&D (Theoretical Engine, ProgramBank). |
| s2s6-ans-gaps | `s2s6-ans-gaps/` | Zeckendorf/Tribonacci gap encoding + ANS entropy coding demo. |

## Provenance

Fused from ten repos with full history preserved (merge commits, not
squashes). Nine merged from `main`; `pccx-handlers` from `arms-opt`.

## Licenses

Mixed: each subdirectory keeps its own `LICENSE` and terms, which
govern that subdirectory. Nothing here is relicensed by the merge —
check the codec's own file before use.

Private R&D — if you can read this, you're inside the lab.
