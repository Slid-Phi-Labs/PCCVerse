# Security Policy

Zero Range Wave is a commercial, license-gated codec. A bug that lets
someone use the compressor, the hosted API, or the MCP server without
a valid license is a security issue, not a normal bug.

## Reporting a vulnerability

Please do not open a public issue for security problems.

- Use GitHub's private vulnerability reporting on this repository
  (Security tab, "Report a vulnerability")

Include the affected file, steps or inputs to reproduce, and what you
expected versus what happened.

You can expect an acknowledgement within 3 business days. We will keep
you updated while we investigate and credit you in the changelog unless
you prefer to stay anonymous.

## In scope

- License-gate bypass: any path where compression, the HTTP API, or the
  MCP server works without the license a tier requires
- Key issuance abuse: generating or validating keys outside `license.mjs`
- API auth bypass in `server.mjs` (missing/invalid key accepted)
- Roundtrip corruption: inputs where `decompress(compress(x))` is not
  bit-identical to `x`
- The `zero-range-wave-compression` npm package and this repository's
  workflows

## Out of scope

- Operator deployments we do not run (including hosted API instances)
- Social engineering, spam, or denial-of-service against hosted endpoints
