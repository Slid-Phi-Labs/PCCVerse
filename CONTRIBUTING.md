# Contributing to PCCX

PCCX is a closed-source lossless compression codec maintained by Slid Phi Labs.
Contributions are by invitation or prior arrangement; there is no public
contributor program.

## Ground rules

- This crate is proprietary (`license = "UNLICENSED"`). By contributing you
  agree your contribution becomes part of the closed codebase.
- Never touch vendored third-party code in `vendor/` except through the
  maintainer's update process.
- The encode path stays lab-owned technology: no outside codec may be added to
  the encode path. Decode support for outside formats is fine where it exists.
- Never guess a destination, format magic, or constant: every byte in the
  container format is specified or derived, never invented.

## Checks before you open a PR

```sh
cd pccx-0.3.0/pccx-crate && cargo test   # crate unit tests
```

Every change must also roundtrip: `decode(encode(x))` is byte-identical to `x`
on at least one corpus file. A change that alters encoded output for existing
inputs must say so in the PR and update the recorded measurements.

CI runs the crate build and test suite on every push and pull request.
