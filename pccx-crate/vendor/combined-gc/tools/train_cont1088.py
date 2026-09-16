#!/usr/bin/env python3
"""Train Cont-1088 from REAL files (Silesia + Calgary)."""
from __future__ import annotations
import json, math, struct, sys, zlib
from collections import defaultdict
from pathlib import Path

PHI = 1.618033988749895
QQ = [1, 2, 4, 8, 16, 32]
BINS = 1088
WIN = 16384
STORE, DEFLATE, DELTA, HANGRY5, XOR, RLE, TZERO, ANS_BWT, ANS = range(9)
FILES_EXPECTED = {"dickens": 10192446, "xml": 5345280, "reymont": 6627202, "ooffice": 6152192, "sao": 7251944}

def hangry_pred(prev, order=5):
    x = prev / 255.0
    if order == 4:
        rec = 1.0 / (1.0 + x + x * x * 0.5 + x * x * x / 6.0)
    else:
        rec = 1.0 / (1.0 + x + x * x * 0.5 + x * x * x / 6.0 + (x ** 4) / 24.0)
    return int(rec * 255.0) & 0xFF

def hangry_bytes(data, order=5):
    out = bytearray(); prev = 0
    for b in data:
        pred = hangry_pred(prev, order)
        out.append((b - pred) & 0xFF); prev = b
    return bytes(out)

def delta_wrap(data):
    out = bytearray(len(data)); prev = 0
    for i, b in enumerate(data):
        out[i] = (b - prev) & 0xFF; prev = b
    return bytes(out)

def xor_float(data):
    out = bytearray(); prev = 0
    for i in range(0, len(data), 4):
        chunk = data[i:i+4]
        if len(chunk) < 4:
            out.extend(chunk); break
        cur = struct.unpack("<I", chunk)[0]
        out.extend(struct.pack("<I", cur ^ prev)); prev = cur
    return bytes(out)

def rle_fe(data):
    out = bytearray(); i = 0; n = len(data)
    while i < n:
        b = data[i]; run = 1
        while i + run < n and data[i + run] == b and run < 255:
            run += 1
        if run >= 4:
            out.extend((0xFE, run, b)); i += run
        elif b == 0xFE:
            out.extend((0xFE, 0x00)); i += 1
        else:
            out.append(b); i += 1
    return bytes(out)

def signed_from(data):
    return [b if b < 128 else b - 256 for b in data]

def energy(signed):
    return 0.0 if not signed else sum(abs(x) for x in signed) / len(signed)

def moments(signed):
    n = max(len(signed), 1)
    mu = sum(signed) / n
    var = sum((x - mu) ** 2 for x in signed) / n
    sigma = math.sqrt(var)
    theta = (mu / 255.0) % 1.0
    phason = 0.5 * (1.0 - math.cos(2.0 * math.pi * theta / PHI))
    w = math.sqrt(mu * mu + sigma * sigma)
    dens = min(2.5, abs(energy(signed)) * 0.6 + 0.3)
    return mu, sigma, theta, phason, w, dens

def inhibitor(e, dens):
    if e < 1.0 and dens < 1.5: return 0
    if e > 2.0 or dens >= 1.85: return 2
    if e > 1.2: return 1
    return 3

def zlen(data):
    return len(zlib.compress(data, 9))

def ans_size(data: bytes) -> int:
    """Order-0 rANS size stand-in (scale 12 + sparse header)."""
    if not data:
        return 8
    freq = [0] * 256
    for b in data:
        freq[b] += 1
    n = len(data)
    import math
    h = 0.0
    used = 0
    for f in freq:
        if f:
            used += 1
            p = f / n
            h -= p * math.log2(p)
    header = 4 + 4 + used * 3 + 8
    return int(header + h * n / 8.0 + 1)

def pick_coder(raw):
    if raw and all(b == 0 for b in raw):
        return TZERO, 8.0 / max(len(raw), 1)
    cands = [
        (STORE, len(raw)),
        (DEFLATE, zlen(raw)),
        (DELTA, zlen(delta_wrap(raw))),
        (XOR, zlen(xor_float(raw))),
        (RLE, zlen(rle_fe(raw))),
        (ANS, ans_size(raw)),
        (ANS_BWT, ans_size(rle_fe(raw))),
    ]
    best = min(cands, key=lambda t: t[1])
    return best[0], best[1] / max(len(raw), 1)

def pick_q(signed):
    e0 = energy(signed)
    best_q, best_m = 1, 1e18
    raw_i8 = bytes((x & 0xFF) for x in signed)
    c0 = zlen(raw_i8) / max(len(signed), 1)
    for q in QQ:
        soft = [0 if abs(d) < q else d for d in signed]
        e1 = energy(soft)
        cq = zlen(bytes((x & 0xFF) for x in soft)) / max(len(signed), 1)
        m = abs((e1 - e0) + (cq - c0))
        if m < best_m:
            best_m, best_q = m, q
    return best_q

def collect_files(root):
    names = ["dickens","xml","reymont","ooffice","sao","nci","mozilla","mr","osdb","samba","webster","x-ray","bib","book1","book2","geo","news","obj1","obj2","paper1","paper2","paper3","paper4","paper5","paper6","progc","progl","progp","trans","pic"]
    found = [root / n for n in names if (root / n).is_file()]
    z = root / "zeros_10k.bin"
    if not z.exists():
        z.write_bytes(b"\x00" * 10000)
    found.append(z)
    return found

def main():
    crate = Path("/home/workdir/artifacts/combined-gc")
    corpora = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/corpora")
    files = collect_files(corpora)
    print("files:")
    for p in files:
        print(f"  {p.name:16s} {p.stat().st_size:10d}")
        if p.name in FILES_EXPECTED and p.stat().st_size != FILES_EXPECTED[p.name]:
            print("  WARN size mismatch", p.name)
    samples = []
    by_file = defaultdict(int)
    for path in files:
        data = path.read_bytes()
        for off in range(0, len(data), WIN):
            raw = data[off:off+WIN]
            if len(raw) < 256:
                continue
            dlt = delta_wrap(raw)
            signed = signed_from(dlt)
            e = energy(signed)
            mu, sigma, theta, phason, w, dens = moments(signed)
            coder, ratio = pick_coder(raw)
            q = pick_q(signed)
            samples.append(dict(file=path.name, off=off, n=len(raw), e=e, mu=mu, sigma=sigma, theta=theta, phason=phason, w=w, density=dens, q_best=q, coder=coder, zlib_ratio=ratio, inhibitor=inhibitor(e, dens)))
            by_file[path.name] += 1
        print(f"  done {path.name} windows={by_file[path.name]}")
    samples.sort(key=lambda s: s["e"])
    n = len(samples)
    print(f"samples={n} E=[{samples[0]['e']:.3f},{samples[-1]['e']:.3f}]")
    rows = []
    for b in range(BINS):
        lo = int(b * n / BINS); hi = int((b + 1) * n / BINS)
        group = samples[lo:hi]
        if not group:
            rows.append(dict(bin=b, occupied=False, n=0, e_lo=0, e_hi=0, e_mean=0, mu=0, sigma=0, theta=0, phason=0, w=0, density=0, q_best=1, coder=0, zlib_ratio=1, inhibitor=2))
            continue
        def avg(k): return sum(s[k] for s in group) / len(group)
        votes, qv, iv = defaultdict(int), defaultdict(int), defaultdict(int)
        for s in group:
            votes[s["coder"]] += 1; qv[s["q_best"]] += 1; iv[s["inhibitor"]] += 1
        rows.append(dict(bin=b, occupied=True, n=len(group), e_lo=group[0]["e"], e_hi=group[-1]["e"], e_mean=avg("e"), mu=avg("mu"), sigma=avg("sigma"), theta=avg("theta"), phason=avg("phason"), w=avg("w"), density=avg("density"), q_best=int(max(qv, key=qv.get)), coder=int(max(votes, key=votes.get)), zlib_ratio=avg("zlib_ratio"), inhibitor=int(max(iv, key=iv.get))))
    occupied = sum(1 for r in rows if r["occupied"])
    print("occupied", occupied)
    tables = crate / "tables"; tables.mkdir(exist_ok=True)
    payload = dict(version="cont1088-v2-real-2026-08-26", note="Real Silesia+Calgary 16K windows zlib-9", bins=BINS, window=WIN, samples=n, occupied=occupied, files={p.name: p.stat().st_size for p in files}, windows_per_file=dict(by_file), rows=rows)
    (tables / "cont_1088_v2_real.json").write_text(json.dumps(payload))
    write_rust(crate / "src" / "cont1088_table.rs", rows, n, occupied, dict(by_file))
    print("wrote table")

def write_rust(path, rows, n_samples, occupied, by_file):
    L = []
    L.append("//! Auto-generated Cont-1088 table from REAL Silesia+Calgary files.")
    L.append("//! version cont1088-v2-real-2026-08-26")
    L.append(f"//! files={by_file}")
    L.append("#[derive(Debug, Clone, Copy)]")
    L.append("pub struct BinRow { pub occupied: bool, pub n: u16, pub e_lo: f32, pub e_hi: f32, pub e_mean: f32, pub mu: f32, pub sigma: f32, pub theta: f32, pub phason: f32, pub w: f32, pub density: f32, pub q_best: u8, pub coder: u8, pub zlib_ratio: f32, pub inhibitor: u8, }")
    L.append(f"pub const N_SAMPLES: u32 = {n_samples};")
    L.append(f"pub const OCCUPIED: u16 = {occupied};")
    L.append('pub const TABLE_VERSION: &str = "cont1088-v2-real-2026-08-26";')
    L.append("pub const ROWS: [BinRow; 1088] = [")
    for r in rows:
        L.append("    BinRow { occupied: %s, n: %d, e_lo: %.6f, e_hi: %.6f, e_mean: %.6f, mu: %.6f, sigma: %.6f, theta: %.6f, phason: %.6f, w: %.6f, density: %.6f, q_best: %d, coder: %d, zlib_ratio: %.6f, inhibitor: %d }," % ("true" if r["occupied"] else "false", r["n"], r["e_lo"], r["e_hi"], r["e_mean"], r["mu"], r["sigma"], r["theta"], r["phason"], r["w"], r["density"], r["q_best"], r["coder"], r["zlib_ratio"], r["inhibitor"]))
    L.append("];")
    L.append("""
pub fn lookup_index(e: f64) -> usize {
    if e <= ROWS[0].e_hi as f64 { return 0; }
    let mut lo = 0usize; let mut hi = ROWS.len();
    while lo + 1 < hi {
        let mid = (lo + hi) / 2;
        if e < ROWS[mid].e_lo as f64 { hi = mid; } else { lo = mid; }
    }
    lo
}
pub fn lookup_e(e: f64) -> &'static BinRow { &ROWS[lookup_index(e)] }
pub fn coder_name(id: u8) -> &'static str {
    match id { 0=>"STORE",1=>"DEFLATE",2=>"DELTA",3=>"HANGRY5",4=>"XOR_F",5=>"RLE",6=>"T_ZERO",7=>"ANS_BWT",8=>"ANS",_=>"STORE" }
}
""")
    path.write_text("\n".join(L) + "\n")

if __name__ == "__main__":
    main()
