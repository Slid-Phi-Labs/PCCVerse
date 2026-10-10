## What changed

<!-- One or two sentences. -->

## Checks

- [ ] `cargo test --lib` passes
- [ ] Any encode-path change was roundtripped: `encode IN -o OUT`, `decode OUT -o BACK`, `sha256sum IN BACK` match
- [ ] Benchmark numbers in the PR text were re-run from this branch, not copy-pasted
- [ ] Public name stays `pulsar`; the hosted PCC product is not mentioned as this tree
- [ ] Contribution is offered under GPL-3.0-or-later (this tree, from 2.4.0)
