#!/usr/bin/env python3
"""Train riser-v2 tables. Replaces the old stub that pointed at a session artifact.

Recipe (from docs/TRAINING.md lab note): lab corpus (zeros, runs, fox,
xml-ish, logs, json, ramps) = 314,260 bytes; SGD 4000 steps x batch 32,
lr 0.03; CE loss 4.86 -> ~3.07 (uniform = ln(256) = 5.55).

The trained net mirrors the exact C forward in src/riser.c (net_logits):
    feat  = 8 context bytes (0..255) + bias const 256
    h_pre = (B1*16 + W1 . feat) >> 8, hid = ReLU(h_pre)
    lg    = B2*16 + W2 . hid
Training runs in normalized units, then train/quantize_riser.py maps the
float weights to the int16 tables (RISER_W1/B1/W2/B2) in src/riser_weights.h.

Usage (local, needs torch):  python3 train/train_riser.py --steps 4000
Usage (Modal T4):            python3 train/modal_riser_train.py
Outputs: train/riser_v2_float.json  (float weights + metrics)
"""
import argparse
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS_SIZE = 314260
CORPUS_SEED = 0x52495331  # 'RIS1', same seed as the C LCG init
CTX, HID = 8, 16

# (name, size) — sums to exactly 314260
PARTS = [
    ("zeros", 32768),
    ("runs", 32768),
    ("fox", 49152),
    ("xml", 65536),
    ("logs", 65536),
    ("json", 49152),
    ("ramps", 19348),
]
assert sum(s for _, s in PARTS) == CORPUS_SIZE


def _fill(buf: bytearray, chunk: bytes, size: int) -> None:
    while len(buf) < size:
        buf += chunk[: size - len(buf)]


def build_corpus(seed: int = CORPUS_SEED) -> bytes:
    rng = random.Random(seed)
    out = bytearray()
    for name, size in PARTS:
        part = bytearray()
        if name == "zeros":
            part = bytearray(size)
        elif name == "runs":
            while len(part) < size:
                b = rng.randrange(256)
                part += bytes([b]) * rng.randint(3, 200)
            part = part[:size]
        elif name == "fox":
            words = ("the quick brown fox jumps over the lazy dog and the "
                     "pack my box with five dozen liquor jugs how vexingly "
                     "quick daft zebras jump bright vixens sphinx of black "
                     "quartz judge my vow").split()
            while len(part) < size:
                n = rng.randint(4, 14)
                sent = " ".join(rng.choice(words) for _ in range(n))
                sent = sent[0].upper() + sent[1:] + ". "
                part += sent.encode()
            part = part[:size]
        elif name == "xml":
            tags = ["item", "entry", "node", "rec", "field", "val", "prop"]
            while len(part) < size:
                t = rng.choice(tags)
                v = "".join(chr(rng.randint(97, 122)) for _ in range(rng.randint(3, 18)))
                if rng.random() < 0.4:
                    part += ('<%s id="%d" k="%s">%s</%s>' % (t, rng.randrange(10000), v, v, t)).encode()
                else:
                    part += ("<%s>%s</%s>" % (t, v, t)).encode()
            part = part[:size]
        elif name == "logs":
            hosts = ["web-1", "db-0", "gpu-2", "edge-7", "api-3"]
            msgs = ["request ok", "cache miss", "retrying chunk", "heartbeat",
                    "slow query", "conn reset", "batch sealed", "tick"]
            while len(part) < size:
                line = "%d-%02d-%02dT%02d:%02d:%02d %s t=%d ms=%d %s\n" % (
                    2026, rng.randint(1, 12), rng.randint(1, 28),
                    rng.randint(0, 23), rng.randint(0, 59), rng.randint(0, 59),
                    rng.choice(hosts), rng.randrange(10**6), rng.randrange(5000),
                    rng.choice(msgs))
                part += line.encode()
            part = part[:size]
        elif name == "json":
            keys = ["id", "name", "kind", "score", "tags", "ok", "n"]
            while len(part) < size:
                obj = {rng.choice(keys): rng.randrange(100000) for _ in range(rng.randint(2, 5))}
                obj["ok"] = bool(rng.randrange(2))
                part += (json.dumps(obj) + "\n").encode()
            part = part[:size]
        elif name == "ramps":
            while len(part) < size:
                start = rng.randrange(256)
                ln = rng.randint(16, 300)
                if rng.random() < 0.5:
                    part += bytes((start + i) % 256 for i in range(ln))
                else:
                    part += bytes((start - i) % 256 for i in range(ln))
            part = part[:size]
        assert len(part) == size, (name, len(part), size)
        out += part
    assert len(out) == CORPUS_SIZE, len(out)
    return bytes(out)


def sample_batch(corpus: bytes, batch: int, rng: random.Random):
    """Yield (feat, target): feat = 8 ctx bytes zero-left-padded + bias 256,
    exactly matching net_logits() incl. start-of-stream (ctxn < CTX)."""
    n = len(corpus)
    feats, tgts = [], []
    for _ in range(batch):
        i = rng.randrange(n)
        ctx = [0] * CTX
        lo = max(0, i - CTX)
        ctx[CTX - (i - lo):] = corpus[lo:i]
        feats.append(ctx + [256])
        tgts.append(corpus[i])
    return feats, tgts


def train(steps: int = 4000, batch: int = 32, lr: float = 0.03,
          seed: int = CORPUS_SEED, log_every: int = 500, resume: str = ""):
    import torch
    torch.manual_seed(seed)
    g = torch.Generator().manual_seed(seed + 1)
    corpus = build_corpus(seed)
    rng = random.Random(seed + 2)

    # Normalized-unit params; quantize_riser.py maps these to C int units.
    U1 = torch.randn(HID, CTX + 1, generator=g) * 0.35
    b1 = torch.zeros(HID)
    U2 = torch.randn(256, HID, generator=g) * 0.12
    c2 = torch.zeros(256)
    if resume:
        with open(resume) as f:
            w0 = json.load(f)
        U1 = torch.tensor(w0["U1"]); b1 = torch.tensor(w0["b1"])
        U2 = torch.tensor(w0["U2"]); c2 = torch.tensor(w0["c2"])
    for p in (U1, b1, U2, c2):
        p.requires_grad_(True)
    opt = torch.optim.SGD([U1, b1, U2, c2], lr=lr)
    use_adam = os.environ.get("RISER_OPT", "") == "adam"
    if use_adam:
        opt = torch.optim.Adam([U1, b1, U2, c2], lr=lr)

    init_ce = None
    for step in range(1, steps + 1):
        feats, tgts = sample_batch(corpus, batch, rng)
        F = torch.tensor(feats, dtype=torch.float32) / 256.0  # x in [0,1], bias=1
        y = torch.tensor(tgts, dtype=torch.long)
        h = torch.relu(b1 + F @ U1.T)
        lg = c2 + h @ U2.T
        ce = torch.nn.functional.cross_entropy(lg, y)
        if init_ce is None:
            init_ce = ce.item()
        opt.zero_grad()
        ce.backward()
        opt.step()
        if step % log_every == 0 or step == steps:
            print("step %d/%d  CE=%.4f" % (step, steps, ce.item()), flush=True)

    final_ce = ce.item()
    print("corpus=%d bytes  init_CE=%.4f  final_CE=%.4f  uniform=%.4f"
          % (len(corpus), init_ce, final_ce, math.log(256)))
    weights = {
        "U1": U1.detach().tolist(), "b1": b1.detach().tolist(),
        "U2": U2.detach().tolist(), "c2": c2.detach().tolist(),
        "metrics": {"steps": steps, "batch": batch, "lr": lr,
                    "init_ce": init_ce, "final_ce": final_ce,
                    "corpus_size": len(corpus), "corpus_seed": seed},
    }
    with open(os.path.join(HERE, "riser_v2_float.json"), "w") as f:
        json.dump(weights, f)
    print("wrote train/riser_v2_float.json")
    return weights


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=4000)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=0.03)
    ap.add_argument("--resume", type=str, default="")
    a = ap.parse_args(argv)
    train(steps=a.steps, batch=a.batch, lr=a.lr, resume=a.resume)


if __name__ == "__main__":
    main()
