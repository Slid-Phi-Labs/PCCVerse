# Zero Range Wave (ZRW) — Pricing & packaging

**Product:** `zero-range-wave-compression` v5  
**Positioning:** Integer-sequence compressor that **beats gzip** on zeros, ramps, and low-volatility walks (see verified benches below).  
**Publisher account:** `zerorangewave` (npm)

## Why these prices

Benchmarks (this pack, lossless RT) justify specialty-SDK pricing — not commodity OSS:

| Input | ZRW packed | gzip -9 (verified 2026-10-14) |
|-------|------------|-------------------------------|
| zeros × 1k | **8 B** | 55 B (**6.9×**) |
| ramp × 1k | **8 B** | 1,454 B (**182×**) |
| repo walk × 10k, step 1 | **128 B** | 13,865 B (**108×**) † |
| repo walk × 10k, step 5 | **420 B** | 14,099 B (**33.6×**) † |
| true Gaussian walk × 10k, σ=1 | **3,923 B** | 6,241 B (**1.59×**) |
| true Gaussian walk × 10k, σ=5 | **17,472 B** | 12,023 B (gzip wins) |

† The repository's bundled "walk" is an LCG ±step sequence whose
floating-point overflow makes it drift almost entirely upward (82 direction
changes in 9,998 steps) — effectively a ramp, not a random walk. We report
it for reproducibility and give true Gaussian-walk figures separately.
Do not cite "40× on random walks": on a true Gaussian walk (σ=1) the
measured advantage is ~1.6×; at σ=5 gzip wins. Zeros and ramp figures are
exact round-trips from the real codec (commit 8c0f227). Brotli comparisons
were not independently re-verified.

Peers that ship “destroy the baseline” numbers (specialized codecs / analytics SDKs) usually sit **$50–$700** one-time or annual — not $5 freemium.  
We price **below enterprise codec licenses**, **above** Slid Phi Labs donate ($29.99), aligned with Support-class tools ($199–$699).

---

## Free tier — **25 licenses only**

| | |
|--|--|
| **Name** | **Free Gate** |
| **Price** | **$0** |
| **Seats** | **Exactly 25** global free keys (first-come; no more free keys after allotment) |
| **Use** | Non-commercial / evaluation / open-source projects with attribution |
| **Ops** | **100,000** `compress` calls / calendar month |
| **Payload** | Max **10,000** ints per call |
| **Livestream** | **Not included** (no streaming/chunk API commercial use) |
| **Output** | Personal / OSS only — no SaaS resale of the codec |
| **Support** | Community / docs only |
| **How** | Request a free key: email **ceedotrock@gmail.com** subject `ZRW FREE` — keys from the pool of 25 |

When 25 free keys are issued, Free Gate closes. Upgrade paths stay open.

---

## Paid tiers (one-time license + optional renewal for support)

### 1. Starting Gate — **$79** one-time
**Buy:** https://buy.stripe.com/28EfZic3z69i3P72Wc6wE0b

| Limit | Value |
|-------|--------|
| Products / apps | **1** commercial product |
| Ops / month | **5,000,000** compress calls |
| Max ints / call | **100,000** |
| Livestream / chunked | **No** |
| Input types | Integer sequences (primary API) |
| Output | Commercial app use OK; no redistributing the codec as a product |
| Support | Best-effort email (72h) |

**Who:** Indie apps, game saves, single internal tool.

---

### 2. Pro Starter (Mid Road) — **$249** one-time
**Buy:** https://buy.stripe.com/cNidRaebHbtC71j8gw6wE0c

| Limit | Value |
|-------|--------|
| Products / apps | **5** |
| Ops / month | **50,000,000** |
| Max ints / call | **1,000,000** |
| Livestream / chunked | **Yes** (batch or stream of chunks; commercial) |
| Input | Ints + production telemetry pipelines |
| Output | Commercial + multi-service |
| Support | Email **24–48h**, upgrade path to consulting |

**Who:** Startups shipping metrics, multi-service backends, “we need stream.”

---

### 3. l33t Unlimited — **$699** one-time
**Buy:** https://buy.stripe.com/14AeVe9Vr8hqadvbsI6wE0d

| Limit | Value |
|-------|--------|
| Products / apps | **Unlimited** |
| Ops / month | **Unlimited** |
| Max ints / call | **Unlimited** (practical memory limits only) |
| Livestream | **Yes** — full production |
| Runtime redistribution | **Yes** — ship the minified runtime inside your product (not re-selling ZRW as a competing library) |
| Support | **Priority** + optional paid consulting add-on |
| Input / output | All supported modes, commercial white-box use |

**Who:** High-volume platforms, IoT fleets, anything that “destroyed gzip” in their own benches and needs unlimited headroom.

---

## Tier map (names)

| Gate | Role | Price |
|------|------|------:|
| **Free Gate** | 25 free seats | $0 |
| **Starting Gate** | Entry commercial | **$79** |
| **Pro Starter** | Mid-road | **$249** |
| **l33t Unlimited** | Top | **$699** |

Optional later: annual support renewal (~40% of tier) without re-buying the license.

---

## What each limit means

| Metric | Definition |
|--------|------------|
| **Input** | Integer arrays (and future byte/stream adapters under paid livestream) |
| **Output** | Packed `Uint8Array` from `compress`; commercial rights per tier |
| **Ops** | One `compress` **or** `decompress` invocation = 1 op |
| **Livestream** | Continuous/chunked encode of live series (not single offline batch) |
| **License** | Key string checked at runtime (see `license.mjs`); Free pool max 25 |

---

## Fair use & enforcement

- Free keys are **HMAC-signed** and rate-limited; allotment capped at **25**.  
- Paid keys unlocked after Stripe receipt + email.  
- No key / invalid key → Free Gate limits if under 25 unregistered eval installs, else soft-fail with upgrade URL (implement in `license.mjs`).  
- Benchmarks and OSS research: use Free Gate or unpaid source review; shipping to users requires Starting Gate+.

---

## Related (Slid Phi Labs / cptasz13 — different brand)

- Donate Slid Phi Labs $29.99: https://buy.stripe.com/eVq9AUd7D0OY0CVdAQ6wE0a  
- Support $199: https://buy.stripe.com/7sYbJ27NjfJSbhz8gw6wE09  

ZRW is **zerorangewave** commercial packaging; Slid Phi Labs remains MIT OSS with separate donate/support.
