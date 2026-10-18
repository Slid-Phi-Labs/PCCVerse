#!/usr/bin/env python3
"""Modal T4 driver for riser-v2 training. Runs train/train_riser.py on a T4,
fetches back train/riser_v2_float.json, then run train/quantize_riser.py.

Usage: ~/src/modal-gpu/.venv/bin/python train/modal_riser_train.py [--steps 4000]
"""
import argparse
import os
import sys

import modal

HERE = os.path.dirname(os.path.abspath(__file__))
app = modal.App("riser-v2-train")
image = (modal.Image.debian_slim().pip_install("torch")
         .add_local_file(os.path.join(HERE, "train_riser.py"), remote_path="/root/train_riser.py"))


@app.function(gpu="T4", image=image, timeout=2400)
def train_remote(steps: int, batch: int, lr: float, resume_json: str = "",
                 optim: str = "") -> dict:
    import os as _os
    import subprocess
    if optim:
        _os.environ["RISER_OPT"] = optim
    cmd = [sys.executable, "/root/train_riser.py", "--steps", str(steps),
           "--batch", str(batch), "--lr", str(lr)]
    if resume_json:
        with open("/root/resume.json", "w") as f:
            f.write(resume_json)
        cmd += ["--resume", "/root/resume.json"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=2200)
    print(r.stdout[-3000:])
    if r.returncode != 0:
        raise RuntimeError("remote train failed:\n" + r.stderr[-3000:])
    import json
    with open("/root/riser_v2_float.json") as f:
        return json.load(f)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=4000)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=0.03)
    ap.add_argument("--resume-from", type=str, default="")
    ap.add_argument("--optim", type=str, default="")
    a = ap.parse_args(argv)
    with app.run():
        rj = ""
        if a.resume_from:
            with open(a.resume_from) as f:
                rj = f.read()
        w = train_remote.remote(a.steps, a.batch, a.lr, rj, a.optim)
    out = os.path.join(HERE, "riser_v2_float.json")
    import json
    with open(out, "w") as f:
        json.dump(w, f)
    m = w["metrics"]
    print("saved %s  init_CE=%.4f final_CE=%.4f" % (out, m["init_ce"], m["final_ce"]))


if __name__ == "__main__":
    main()
