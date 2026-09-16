#!/bin/bash
# Held-out one-shot: stock 0.3.0 vs handlers build, all 12 Silesia files.
# Every decode SHA-256 verified. OOM/timeout recorded honestly, never substituted.
# Stock 0.3.0 has a PROVEN xz-subprocess deadlock (>4MB non-text inputs hang in
# anon_pipe_write with a 0-CPU xz child; reproduced 3x). For stock runs a
# watchdog detects that exact signature and records TIMEOUT(deadlock) instead
# of burning the full 3600s.
STOCK=/tmp/pccx-stock/target/release/pccx
NEW=~/workspace/pccx-handlers/pccx-crate/target/release/pccx
CORPUS=~/workspace/helix-match-exp/corpus
OUT=~/workspace/pccx-handlers/results
mkdir -p "$OUT"
[ -f "$OUT/SUMMARY.txt" ] || : > "$OUT/SUMMARY.txt"

deadlock_watch() {
  # $1 = pid of the `timeout` wrapper. Returns 0 if the proven deadlock
  # signature is seen on the pccx encode child: stuck in anon_pipe_write
  # with an idle xz grandchild.
  local wrapper=$1 elapsed=0
  while kill -0 "$wrapper" 2>/dev/null; do
    sleep 15
    elapsed=$((elapsed + 15))
    [ "$elapsed" -lt 90 ] && continue
    local pid
    pid=$(pgrep -P "$wrapper" -f "pccx-stock/target/release/pccx encode" | head -1)
    [ -z "$pid" ] && continue
    local wchan
    wchan=$(cat /proc/$pid/wchan 2>/dev/null)
    local xzpid
    xzpid=$(pgrep -P "$pid" -x xz | head -1)
    if [ "$wchan" = "anon_pipe_write" ] && [ -n "$xzpid" ]; then
      # xz basically idle (utime+stime < 500 jiffies) while parent blocked
      # on pipe write => the proven deadlock signature
      local st
      st=$(awk '{print $14+$15}' /proc/$xzpid/stat 2>/dev/null)
      if [ -n "$st" ] && [ "$st" -lt 500 ] 2>/dev/null; then
        return 0
      fi
    fi
    [ "$elapsed" -ge 3600 ] && return 1
  done
  return 1
}

run_one() {
  # $1=file $2=tag(stock|new)
  local f=$1 tag=$2
  local SRC BIN
  if [ -f "$CORPUS/dev/$f" ]; then SRC="$CORPUS/dev/$f"; else SRC="$CORPUS/heldout/$f"; fi
  if [ "$tag" = "stock" ]; then BIN="$STOCK"; else BIN="$NEW"; fi
  local start secs ec raw packed vrt op
  start=$(date +%s)
  timeout 3600 "$BIN" encode "$SRC" "$OUT/${f}_${tag}.pccx" > "$OUT/${f}_${tag}.log" 2>&1 &
  local encpid=$!
  local note=""
  if [ "$tag" = "stock" ]; then
    if deadlock_watch "$encpid"; then
      note="TIMEOUT(deadlock)"
      pkill -9 -f "/tmp/pccx-stock/target/release/pccx encode" 2>/dev/null
      pkill -9 -x xz 2>/dev/null
      kill -9 "$encpid" 2>/dev/null
      wait "$encpid" 2>/dev/null
    fi
  fi
  wait "$encpid" 2>/dev/null
  ec=$?
  secs=$(( $(date +%s) - start ))
  raw=$(stat -c%s "$SRC")
  packed="FAIL(ec=$ec)"
  vrt="NOOUT"
  op="?"
  if [ -n "$note" ]; then
    packed="$note"; ec="killed"
  elif [ -f "$OUT/${f}_${tag}.pccx" ] && [ "$ec" -eq 0 ]; then
    packed=$(stat -c%s "$OUT/${f}_${tag}.pccx")
    "$BIN" decode "$OUT/${f}_${tag}.pccx" "$OUT/${f}_${tag}.out" > /dev/null 2>&1
    h1=$(sha256sum "$SRC" | cut -d' ' -f1)
    h2=$(sha256sum "$OUT/${f}_${tag}.out" 2>/dev/null | cut -d' ' -f1)
    [ "$h1" = "$h2" ] && vrt="OK" || vrt="MISMATCH"
    rm -f "$OUT/${f}_${tag}.out"
    op=$(od -A n -t u1 -j 17 -N 1 "$OUT/${f}_${tag}.pccx" | tr -d ' ')
  fi
  echo "$f $tag raw=$raw packed=$packed op=$op exit=$ec secs=$secs verify=$vrt" | tee -a "$OUT/SUMMARY.txt"
}

for f in ooffice samba xml mozilla mr nci osdb reymont sao webster x-ray; do
  # resumable: skip files already recorded for both tags
  if grep -q "^$f stock " "$OUT/SUMMARY.txt" 2>/dev/null && grep -q "^$f new " "$OUT/SUMMARY.txt" 2>/dev/null; then
    continue
  fi
  # dickens already done for both
  run_one "$f" stock
  run_one "$f" new
done
echo "held-out done"
