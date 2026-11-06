# Aware Frame WAVE 4

> **EXPERIMENTAL — BROKEN. Does not compile, do not depend on it.**
> `src/lib.rs` declares modules with no corresponding files on disk
> (`frame`, `program_bank`, `theoretical_engine`, `bench`, `monthly_pack`;
> `primitives/` also ships without its `mod.rs`, and `nca.rs` imports
> `apply_compression_pipeline`, which is not defined anywhere), so the crate
> cannot build, including the `force_theory_bench` binary. Quarantined: keep
> this crate out of workspaces and CI until real implementations land.
> Deliberately no stub/shim modules — a fake `frame.rs` that compiles would
> be worse than an honest build failure.

Adaptive residual compression engine for Slid Phi Labs.

## Features
- ProgramBank (offline NCA-trained pathways)
- Theoretical Engine (self-testing against residual bounds)
- TRU8 specialty pathways (T_ZERO, T_TRISUM, T_DICT)
- Blackjack integer math (Δ², Rice, Fib/Zeckendorf)
- Force-theory benchmark harness (internal vectors + Calgary)
- Self-describing frames, Analyzer, residual neural, rANS, optimal LZ, CDC, Dict

## Private R&D
This repository is private. Exact residual-attack coefficients, soft-delta schedules, and Continuous-1088 production paths remain closed under Autonoma IP Guard.

## Build
```bash
cargo build --release
cargo run --release --bin force_theory_bench
```

## Owner
Slid Phi Labs / Corey Tasz
