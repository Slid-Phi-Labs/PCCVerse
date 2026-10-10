# Security Policy

PCCX decodes untrusted input. A bug that lets a crafted file crash the
decoder, hang it, or produce output that does not match what was encoded is a
security issue, not a normal bug.

## Reporting a vulnerability

Please do not open a public issue for security problems.

- Use GitHub's private vulnerability reporting on this repository
  (Security tab, "Report a vulnerability"), or
- Email: corey@slidphilabs.com with the subject line `PCCX security`

Include the affected crate and file, the input or command that triggers it,
and what you expected versus what happened. If the input is sensitive,
describe it rather than attaching it.

You can expect an acknowledgement within 3 business days. We will keep you
updated while we investigate.

## In scope

- Decoder panics, hangs, or excessive memory use on crafted input
- Roundtrip failures: `decode(encode(x))` differs from `x`
- Incorrect decoding (silent data corruption)
- The `pccx` crate and the `pccx` binary

## Out of scope

- Benchmark or compression-ratio regressions (file as a normal issue)
- Deployments we do not run
