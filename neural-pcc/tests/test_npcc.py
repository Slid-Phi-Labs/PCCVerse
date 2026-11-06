import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from npcc import PATHWAY, compress, decompress
from npcc.format import unpack


def check(x: bytes) -> bytes:
    c = compress(x)
    y = decompress(c)
    assert y == x, (len(x), len(y), unpack(c)["pathway_id"])
    return c


def test_cases():
    samples = [
        b"",
        b"\x00",
        b"\x00" * 100,
        b"\x00" * 2000,
        b"A" * 500,
        b"ab" * 400,
        b"The quick brown fox jumps over the lazy dog. " * 20,
        bytes(range(256)),
        bytes(range(256)) * 4,
        b"\xff\x00" * 300,
    ]
    for x in samples:
        c = check(x)
        info = unpack(c)
        print(f"{len(x):6d} -> {len(c):6d}  path={PATHWAY(info['pathway_id']).name}")




# --- FUZZ-BLOCK: property roundtrips (verse bench harness) ---
def test_fuzz_random_bytes():
    import random
    rng = random.Random(0xF02)
    for trial in range(40):
        n = rng.randrange(0, 3000)
        x = bytes(rng.randrange(256) for _ in range(n))
        c = compress(x)
        y = decompress(c)
        assert y == x, (trial, n)
    print("ok fuzz: 40 random roundtrips")


def test_fuzz_corrupt_input_refuses():
    import random
    rng = random.Random(0xBAD)
    x = bytes(rng.randrange(256) for _ in range(500))
    good = compress(x)
    # truncations must raise, never return partial/garbage
    for cut in (0, 1, 2, 5, len(good) // 2, len(good) - 1):
        try:
            decompress(good[:cut])
        except Exception:
            pass
        else:
            raise AssertionError("truncated blob accepted (cut=%d)" % cut)
    # random garbage must raise
    for trial in range(40):
        blob = bytes(rng.randrange(256) for _ in range(rng.randrange(0, 60)))
        if blob == b"":
            continue
        try:
            decompress(blob)
        except Exception:
            pass
        else:
            raise AssertionError("garbage blob accepted (trial=%d)" % trial)
    # bit flips of a valid blob must raise or reproduce the input exactly
    for trial in range(40):
        bad = bytearray(good)
        pos = rng.randrange(len(bad))
        bad[pos] ^= 1 << rng.randrange(8)
        try:
            y = decompress(bytes(bad))
        except Exception:
            pass
        else:
            assert y == x, (trial, "silent corruption")
    print("ok fuzz: truncations/garbage/bitflips refused-or-exact")
if __name__ == "__main__":
    test_cases()
    test_fuzz_random_bytes()
    test_fuzz_corrupt_input_refuses()
    print("ok")
