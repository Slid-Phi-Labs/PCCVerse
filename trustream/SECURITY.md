# Security Policy

TRUSTREAM packs live streams — logs, telemetry, sensor frames. A bug that
lets a corrupted stream decode silently, lets a decoder diverge from the
encoder, or lets a tile op break the never-expand law is a security issue,
not a normal bug.

## Reporting a vulnerability

Please do not open a public issue for security problems.

- Use GitHub's private vulnerability reporting on this repository
  (Security tab, "Report a vulnerability")
- Or email: corey@slidphilabs.com with the subject line `TRUSTREAM security`

Include the affected file or tile op, steps or inputs to reproduce, and what
you expected versus what happened.

You can expect an acknowledgement within 3 business days. We will keep you
updated while we investigate and credit you in the changelog unless you prefer
to stay anonymous.

## In scope

- Decoder divergence: any input where `encode_stream` → `decode_stream`
  returns anything other than the original bytes
- Silent corruption: a truncated or tampered frame stream that decodes without
  raising
- Never-expand violations: content encoding larger than its input
  (framing aside)
- Framing weaknesses: tag/length confusion that lets one tile's bytes be read
  as another's
- The `trustream` Python reference implementation and any published package

## Out of scope

- Operator deployments we do not run
- Social engineering, spam, or denial-of-service against hosted demos
