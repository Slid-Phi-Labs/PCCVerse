# SWARM-NCA

Lossless research compressor. NCA votes tag each byte; a swarm of 4 KB workers reconstructs. SWM2 bitstream.

- Parse: greedy (steps=1), lazy (2), DP (3+)
- Window: isolated 4 KB (parallel) or chained 32 KB (better ratio)
- Honest gzip comparison. No fake wins.

## Python twin (no deps)

```bash
python3 swarm_nca.py
python3 swarm_nca.py file.bin -o out.swm2 --window chained --steps 3
python3 swarm_nca.py out.swm2 --decode -o file.bin
```

## Layout

| File | Role |
|---|---|
| `swarm_nca.py` | Standalone encoder/decoder |
| `engine.ts` | Same semantics in the lab |
| `bits.ts` | Bitstream + ULEB |
| `SWARM-NCA-NOTES.md` | Correspondence + bench + next steps |
| `swarm-lab.tsx` / `school-panel.tsx` | Browser lab |

Private repo. Correspondence is in `SWARM-NCA-NOTES.md`.
