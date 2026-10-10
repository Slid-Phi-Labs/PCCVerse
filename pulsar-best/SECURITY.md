# Security Policy

pulsar is a lossless compressor. Anything that breaks losslessness or lets
a crafted input escape the decoder is a security issue, not a normal bug.

## Reporting a vulnerability

Please do not open a public issue for security problems.

- Email: corey@slidphilabs.com with the subject line `pulsar security`
- Or use GitHub's private vulnerability reporting on this repository
  (Security tab, "Report a vulnerability"):
  https://github.com/ceedot-rock/pulsar-best/security/advisories/new

Include the pulsar version and how you built it, the command and flags,
a minimal input that triggers it, and what you expected versus what
happened.

You can expect an acknowledgement within 3 business days. We will keep you
updated while we investigate and credit you unless you prefer to stay
anonymous.

## In scope

- Roundtrip breakage: any input where `decode(encode(x)) != x`
- Decoder robustness: panics, hangs, or runaway memory on crafted input
- Anything that silently corrupts output instead of erroring out

## Out of scope

- The private encoder, Combined GC, AWARE residuals, and taught weights —
  they are not in this tree and never will be
- Benchmark debates, feature requests, build friction
- Licensing questions — see COMMERCIAL.md or ask at corey@slidphilabs.com
