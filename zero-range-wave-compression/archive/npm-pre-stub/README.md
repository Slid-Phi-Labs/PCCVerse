# Pre-stub npm archive

Full codec tarballs were saved **before** unpublishing pre-stub versions from the public registry.

## Location

Host machine / ops archive (not in this public tarball path):
`artifacts/npm_archive/` on the build agent that ran the unpublish prep.

Also retained in **git history** of each repo (commits before the stub cutover).

## Packages archived (SHA-256 recorded at capture)

| Tarball | Notes |
|---------|--------|
| blackjack-compression-1.3.5.tgz | full |
| blackjack-compression-1.3.6.tgz | full |
| shard-zip-0.2.4.tgz | full |
| shard-zip-0.2.5.tgz | full |
| slid-phi-2.1.4.tgz | full |
| slid-phi-2.1.5.tgz | full |
| zero-range-wave-compression-5.0.1.tgz | full |

## Restore

```bash
npm install ./blackjack-compression-1.3.6.tgz
```

## Public npm after cutover

Latest = **stub only**. Customers get real builds via https://www.slidphilabs.com/access
