#!/usr/bin/env bash
# One-command product demo
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "=== Aware Frame — customer product demo ==="
echo "Banks: $ROOT/banks/  Packs: $ROOT/packs/"
echo "KnowledgeVersion: 2026.08-logs / 2026.08-theory-pack"
echo
if [ -x /tmp/aware_lab/target/release/aware_frame ]; then
  /tmp/aware_lab/target/release/aware_frame
elif command -v cargo >/dev/null; then
  cd "$ROOT" && cargo run --release
else
  python3 "$ROOT/lab/force_theory_harness.py" 2>/dev/null || echo "Run: cargo run --release"
fi
echo
echo "DONE — see KnowledgeVersion + ratios + RT honesty above"
