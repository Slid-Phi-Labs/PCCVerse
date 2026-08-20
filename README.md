# Aware Frame WAVE 4

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
