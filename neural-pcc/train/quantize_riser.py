#!/usr/bin/env python3
"""Quantize riser-v2 float weights to the int16 tables in src/riser_weights.h.

Mapping (C units, from net_logits in src/riser.c):
    h_pre_C = (B1*16 + W1 . feat) / 256,  hid_C = ReLU(h_pre_C)
    lg_C    = B2*16 + W2 . hid_C,         feat in 0..256
Float net was trained as: h = ReLU(b + U1 . x), lg = c + U2 . h, x = feat/256.
With W1 = S1*U1, B1 = 16*S1*b, W2 = (S2/S1)*U2, B2 = (S2/16)*c, the int net
computes exactly S1*h_pre and S2*lg (ReLU is scale-equivariant for S1 > 0).

Calibration target is DEPLOYED codelength, not softmax CE: the C pipeline
(mixed_freqs crude d+4096 map, normalize, 1:7 mix with adaptive counts,
normalize) is simulated bit-exactly in Python ints, and (S1, S2) minimize
ideal bits -log2(freq/4096) on tuning slices. Softmax CE is the wrong
objective here because the deployed map clips logit differences beyond 4096.

Stdlib only. Usage: python3 train/quantize_riser.py [weights.json]
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
I16 = 32700  # int16 headroom
FREQ_SUM = 4096
MIX_NET, MIX_ADP = 1, 7
CTX, HID = 8, 16


def lcg_weights():
    """Replicate the untrained riser-v1 LCG init (model_init in src/riser.c)."""
    s = 0x52495331

    def nxt():
        nonlocal s
        s = (1664525 * s + 1013904223) & 0xFFFFFFFF
        return s

    W1 = [[(nxt() % 4915) - 2457 for _ in range(9)] for _ in range(16)]
    B1 = [(nxt() % 1639) - 819 for _ in range(16)]
    W2 = [[(nxt() % 1639) - 819 for _ in range(16)] for _ in range(256)]
    B2 = [(nxt() % 821) - 410 for _ in range(256)]
    return W1, B1, W2, B2


def normalize(counts):
    """Bit-exact port of normalize() in src/riser.c."""
    tot = sum(counts)
    if not tot:
        f = [FREQ_SUM // 256] * 256
        f[255] = FREQ_SUM - (FREQ_SUM // 256) * 255
        return f
    freqs = [0] * 256
    present = [i for i in range(256) if counts[i]]
    acc = 0
    for i in present:
        f = (counts[i] * FREQ_SUM) // tot
        if f < 1:
            f = 1
        freqs[i] = f
        acc += f
    if acc > FREQ_SUM:
        while acc > FREQ_SUM:
            j = present[0]
            for k in present[1:]:
                if freqs[k] > freqs[j]:
                    j = k
            if freqs[j] <= 1:
                break
            freqs[j] -= 1
            acc -= 1
    elif acc < FREQ_SUM:
        j = present[0]
        for k in present[1:]:
            if counts[k] > counts[j]:
                j = k
        freqs[j] += FREQ_SUM - acc
    return freqs


def deployed_bits(W1, B1, W2, B2, corpus, positions):
    """Ideal deployed codelength (bits) of corpus bytes at positions, with a
    fresh adaptive model per contiguous run. Returns (bits, n)."""
    bits = 0.0
    n = 0
    counts = [1] * 256
    prev = -2
    for i in positions:
        if i != prev + 1:
            counts = [1] * 256
        prev = i
        ctx = [0] * CTX
        lo = max(0, i - CTX)
        seg = corpus[lo:i]
        ctx[CTX - len(seg):] = seg
        feat = ctx + [256]
        hid = []
        for h in range(HID):
            s = B1[h] * 16
            Wh = W1[h]
            s += Wh[0] * feat[0] + Wh[1] * feat[1] + Wh[2] * feat[2] + \
                Wh[3] * feat[3] + Wh[4] * feat[4] + Wh[5] * feat[5] + \
                Wh[6] * feat[6] + Wh[7] * feat[7] + Wh[8] * feat[8]
            hid.append(s >> 8 if s > 0 else 0)
        lg = []
        for o in range(256):
            s = B2[o] * 16
            Wo = W2[o]
            t = 0
            for h in range(HID):
                t += Wo[h] * hid[h]
            lg.append(s + t)
        m = max(lg)
        nc = [d - m + 4096 if d - m + 4096 > 1 else 1 for d in lg]
        nf = normalize(nc)
        af = normalize(counts)
        mix = [MIX_NET * a + MIX_ADP * b for a, b in zip(nf, af)]
        fr = normalize(mix)
        y = corpus[i]
        bits += math.log2(FREQ_SUM) - math.log2(fr[y])
        counts[y] += 1
        n += 1
    return bits, n


def main(argv):
    wpath = argv[1] if len(argv) > 1 else os.path.join(HERE, "riser_v2_float.json")
    with open(wpath) as f:
        w = json.load(f)
    U1, b1, U2, c2 = w["U1"], w["b1"], w["U2"], w["c2"]

    sys.path.insert(0, HERE)
    from train_riser import build_corpus, PARTS
    corpus = build_corpus()

    # Part boundaries for stratified slices (name, start, size)
    bounds, off = {}, 0
    for name, size in PARTS:
        bounds[name] = (off, size)
        off += size

    def windows(per, offset=512, skip_parts=("zeros",)):
        # Contiguous blocks per part so the adaptive counts behave like a
        # real encode (strided isolated positions would neuter the mixer).
        pos = []
        for name, (start, size) in bounds.items():
            if name in skip_parts:
                continue
            s = start + 8 + (offset % max(1, size - per - 16))
            pos.extend(range(s, s + per))
        return pos

    # Logit spread of the float net (for S2 targets)
    lgs = []
    for i in range(0, len(corpus), 3719):
        ctx = [0] * CTX
        lo = max(0, i - CTX)
        seg = corpus[lo:i]
        ctx[CTX - len(seg):] = seg
        x = [(v / 256.0) for v in ctx + [256]]
        h = [max(0.0, bb + sum(a * b for a, b in zip(row, x))) for row, bb in zip(U1, b1)]
        lgs.append([cc + sum(a * b for a, b in zip(row, h)) for row, cc in zip(U2, c2)])
    mean = sum(v for row in lgs for v in row) / (len(lgs) * 256)
    std = (sum((v - mean) ** 2 for row in lgs for v in row) / (len(lgs) * 256)) ** 0.5 or 1e-9
    print("float logit std=%.3f" % std)

    def quantize(S1, spread):
        S2 = spread / std
        flat = [int(round(S1 * v)) for row in U1 for v in row]
        W1 = [flat[i * 9:(i + 1) * 9] for i in range(16)]
        B1 = [int(round(16 * S1 * v)) for v in b1]
        W2 = [[int(round(S2 / S1 * v)) for v in row] for row in U2]
        B2 = [int(round(S2 / 16 * v)) for v in c2]
        if max(abs(v) for row in W1 for v in row) > I16: return None
        if max(abs(v) for v in B1) > I16: return None
        if max(abs(v) for row in W2 for v in row) > I16: return None
        if max(abs(v) for v in B2) > I16: return None
        if max(abs(v) for row in W2 for v in row) > 500: return None
        return (W1, B1, W2, B2, S1, S2)

    tune = windows(100, offset=512)  # 100 contiguous evals per part
    print("tuning positions: %d" % len(tune))
    base = deployed_bits(*lcg_weights(), corpus, tune)
    print("LCG baseline: %.4f bits/byte" % (base[0] / base[1]))

    # Stage 1: fix S1=128, sweep spread
    stage1 = []
    for spread in (1500, 6000, 24000, 96000, 384000):
        q = quantize(128, spread)
        if q is None:
            continue
        b, n = deployed_bits(*q[:4], corpus, tune)
        print("S1=128 spread=%7d  %.4f bits/byte" % (spread, b / n))
        stage1.append((b / n, spread))
    best_spread = min(stage1)[1]
    print("stage1 best spread=%d" % best_spread)

    # Stage 2: sweep S1 around best spread
    results = []
    for S1 in (64, 128, 256, 512):
        for spread in (best_spread // 2, best_spread, best_spread * 2):
            q = quantize(S1, spread)
            if q is None:
                continue
            b, n = deployed_bits(*q[:4], corpus, tune)
            print("S1=%4d spread=%7d  %.4f bits/byte" % (S1, spread, b / n))
            results.append((b / n, S1, spread, q))
    results.sort()
    bpb, S1, spread, q = results[0]
    print("picked S1=%d spread=%d  %.4f bits/byte (LCG %.4f)" % (S1, spread, bpb, base[0] / base[1]))

    # Validation on fresh offsets
    val = windows(200, offset=5000)
    vb, vn = deployed_bits(*q[:4], corpus, val)
    lb, ln = deployed_bits(*lcg_weights(), corpus, val)
    print("validate: trained %.4f vs LCG %.4f bits/byte" % (vb / vn, lb / ln))

    W1, B1, W2, B2, S1, S2 = q

    def arr(name, vals, per_line):
        lines = ["static const int16_t %s[%d] = {" % (name, len(vals))]
        for i in range(0, len(vals), per_line):
            lines.append("    " + ", ".join(str(v) for v in vals[i:i + per_line]) + ",")
        lines.append("};")
        return "\n".join(lines)

    hdr = (
        "/* riser-v2 trained tables. Generated by train/quantize_riser.py — do not hand-edit.\n"
        " * tune %.4f / validate %.4f bits/byte vs LCG %.4f / %.4f; S1=%d S2=%.2f */\n"
        "#ifndef NPCC_RISER_WEIGHTS_H\n#define NPCC_RISER_WEIGHTS_H\n\n"
        "#include <stdint.h>\n\n%s\n\n%s\n\n%s\n\n%s\n\n#endif\n"
        % (bpb, vb / vn, base[0] / base[1], lb / ln, S1, S2,
           arr("RISER_W1", [v for row in W1 for v in row], 9),
           arr("RISER_B1", B1, 8),
           arr("RISER_W2", [v for row in W2 for v in row], 16),
           arr("RISER_B2", B2, 8)))
    hpath = os.path.join(ROOT, "src", "riser_weights.h")
    with open(hpath, "w") as f:
        f.write(hdr)
    print("wrote %s" % hpath)


if __name__ == "__main__":
    main(sys.argv)
