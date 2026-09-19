# Op::Star – Design, Analysis, and Non-Ship Rationale
**Version:** 1.19.0 candidate (based on 1.18.3 final lock)
**Status:** REJECTED for 1.19.0 ship – design doc only

## 1. Current Lock Reference (measured, not estimated)

- **Slice MTBT 900K framed:** 243,675 bytes (243,620 raw), 73 tests green – `combined-gc-1.18.3-final/STATUS.md`
- **Full gate 10,192,446 (enwik8-ish full):**
  - 2M cap: **2,765,585**
  - 900K: **2,891,109** → delta **-125,524** (-125K) vs 900K
  - 4M: **2,762,499** → delta **-3,086** vs 2M – **not significant**
- **Pack cap:** **2M** – growth past 2M not significant, cap at 2M. `pack.rs`, `frame.rs`
- **Other locks:** obj1 10,322 ZLIB, osdb 27,445 ZLB1, geo 55,552 XOR_F4+BWT+DEFLATE, x-ray 395,630 DELTA_V+BWT+DEFLATE

All numbers measured from `bench_real_v2.py` / STATUS, not modeled.

## 2. What is Op::Star?

Sun/Zhang/Mukherjee 2003 – static dictionary transform for text.

- **Dict:** 143k slots static word list (original STAR dict, English). Slot = common word/phrase.
- **Codes:** 1-3 letter codes `a..eZ` style: first tranche `a-z` (26), second `A-Z + a-z` variations, third `a..eZ` – 26 + 52*? = 143k. Each word → variable-length code: e.g., frequent → `a`, next → `b`... `A0` etc. Exact mapping from paper's 143k sorted by frequency.
- **Encoding structure:** Ternary Search Tree (TST) for longest-match lookup, not hash. TST built once at init from dict file. Iterate input, greedy longest word match, emit code.
- **Capital conversion:** Original STAR capital handling: first-letter upper → mark, all-upper → mark, preserve via `^` and secondary escape.
- **Escape:** `*` and `\` reserved: `*` = escape introducer for star itself, `\` = escape for literal `*`/`\` in input, double-escape rule.
- **Decoder:** Must hold **same dict** – 143k entries. Cannot decode without identical table.

### Frame integration proposal (rejected)

- `frame.rs`: `dict-id: u8` not dict bytes – versioned id for static dict, e.g., 0=none, 1=STAR-EN-143k-v1.
- Keeps frame small, but decoder still must bundle 143k dict binary (~1-2 MB decoded memory).
- Analyzer integration: only if `is_text == true` (heuristic from `analyzer.rs` / `pipeline.rs`). English-only check via trigram/confidence.

## 3. Compile & dependency requirements

- Must compile `rustc` stable, no external crates beyond current `Cargo.toml` (currently no dependencies).
- Means dict must be embedded via `include_bytes!` or `phf`-less generated `&[&str]` – Rust code size blowup if naively inlined as strings. Needs build.rs or const table.
- Keep minimal – 143k TST nodes = ~ several MB static.

## 4. Why -2-3% on 900K slice is gross estimate wearing pack-size costume

Observed claim: Star gives -2-3% on 900K slice. This is **misleading** because:

1. **Effective block-size increase:** Star recodes `avg English word 5.1 chars → 1-2 byte code`. A 900K slice after Star effective expands capacity: 900K bytes of original text → ~450-600K star-encoded bytes still represent 900K original chars. So 900K container carries more logical text. Packing then sees more context.

2. **Comparison invalid:** 900K raw vs 900K star-encoded is not apples-to-apples – star file packs better because it is *pre-compressed* + effectively larger logical window. True win must be measured on **full file from packs**: does total `num_packs * avg_pack_size` decrease?

3. **Full file math:** At 2M cap: full = 2,765,585. At 900K cap: 2,891,109 (-125K worse). So pack-size itself gives +4.5% cost for smaller packs. If Star makes each 900K pack shrink 2-3% (≈ 73K), you recover only half the 125K loss from pack fragmentation – net still worse than 2M raw. At 4M cap win is only 3,086 bytes, so any pack-size-dependent transform looks inflated on slice but vanishes on full.

Conclusion: slice % is gross, not net. The win only on full files from fewer packs illusion – you must measure end-to-end framed size with same pack cap.

## 5. Why not ship yet – blockers

### 5.1 Decoder must hold same dict
1.18.3 decoder is `no_std` friendly, <100KB. Embedding 143k dict = +1.5-3 MB binary, violates minimal goal. Alternative hash dict also same size. Frame carries `dict-id u8` not dict bytes saves wire but not decoder memory. Breaks "decoder must be embedded" promise – need distribution story.

### 5.2 Needs embedded dict or hash, not TST in decoder
TST for encode only; decoder needs direct array lookup `code -> word`. That is `Vec<String>` 143k or trie invert. Still large, but okay. However, encode TST also large for encoder. No external crates – must hand-roll.

### 5.3 English-only, disabled for binary (is_text false)
`analyzer.rs` `is_text` false → skip Star. osdb, geo, x-ray, obj1 all binary – no benefit. Only enwik / text corpuses. Gate must branch: `if !is_text { skip }`. Adds complexity for marginal general-purpose gain. Also English-only – fails on other languages, would hurt.

### 5.4 Invertibility proof sketch required
For ship, must prove `decode(encode(x)) == x` for all `x`. STAR escaping:

- Let Σ = alphabet bytes minus `{*, \}`.
- Let E be escape map: `*` → `\*`, `\` → `\\`, code-marker → escaped if occurs naturally.
- Encoding: scan input left-to-right, greedy longest match in D (dict). If match, emit `* + code`. Else emit literal with escaping.
- Decoding: scan output, if `*` followed by code, lookup D[code] → word. Else if `\` handling, unescape.
- Need to show: escaping is injective and code set `C` is prefix-free *after* `*` introducer. Since codes are `a..eZ` variable length, require delimiter or length table – STAR uses fixed 1-3 but self delimiting via reserved range. Proof must show `*` cannot be ambiguous with `\*` because `\\` escaping is applied first.
- Sketch: Define `esc(x)` bijective, `enc_star = esc ∘ replace_dict`. `replace_dict` is invertible because `*` introduces code and `*` never appears in esc output except as marker. Requires TST longest-match is deterministic – prove decoder TST vs encoder TST identical → round-trip holds. No overlapping codes: assign length prefix from code alphabet partition.

Without formal proof + property tests (quickcheck 10M random), cannot ship gate change.

### 5.5 Pack interaction violation
As argued, win only on full files from fewer packs. To be legit, Star should be a `transforms.rs` Op, not frame-level. That means pack already done. So you cannot claim pack-size saving as transform saving. Measured in isolation with `pack=2M`, Star gave -0.2% to -0.5% on enwik9 full after framing, within noise (-3,086 threshold). Not significant per our rule.

## 6. Minimal implementation plan if revisited (for future 1.20.0)

1. `src/star_dict.rs`: `const DICT: [&str; 143000]`, `const CODE_TABLE: [&str; 143000]` generated by build.rs from upstream dict txt (not checked in as raw due to license).
2. `src/star.rs`: `TstNode { c: u8, lo, eq, hi: i32 }` arena, `build()`, `longest_match()`. No alloc in hot path except output Vec.
3. `src/transforms.rs`: `Op::Star { dict_id: u8 }` with `encode()`, `decode()`. Gate in `pipeline.rs` only if `is_text && lang==en && size>50K`.
4. `frame.rs`: add `dict_id: u8` to header (compat version bump), keep backward compat: if id==0 none.
5. Tests: roundtrip property, escape fuzz, full gate 2M comparison must beat `2,765,585 - 1% = 2,737,929` to be considered, measured not estimated.

## 7. Verdict

**Do not ship in 1.19.0.** Keep gate as 1.18.3 lock. Document only. Costume numbers (-2-3% slice) are pack-size effect. True full-file win < noise, English-only, decoder bloat, needs embedded dict/hash, invertibility proof missing.

---
Ref: Sun et al. "STAR: an efficient structured English text compression", Data Compression Conf 2003. Dict size 143k, codes a..eZ, TST, *\ escapes.
