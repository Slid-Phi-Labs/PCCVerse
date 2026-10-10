//! PCCX 0.2.0 — closed crate. One package. PCC1 on the wire.

pub const VERSION: &str = "pccx-0.3.0";
pub const MAGIC: &[u8; 4] = b"PCC1";
pub const VER: u8 = 2;

mod ptasz;
mod o2rle;
mod prerle;
mod an8;
mod adp_o1;
mod huff67;
mod bandit;

#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Op {
    Zero = 0,
    Match = 1,
    Bwt = 2,
    Store = 3,
    Aware = 12,
}

pub fn version() -> &'static str {
    VERSION
}

fn crc32(data: &[u8]) -> u32 {
    let mut c = 0xffff_ffffu32;
    for &b in data {
        c ^= b as u32;
        for _ in 0..8 {
            let bit = c & 1;
            c >>= 1;
            if bit != 0 {
                c ^= 0xedb8_8320;
            }
        }
    }
    !c
}

fn put_u32(out: &mut Vec<u8>, n: u32) {
    out.extend_from_slice(&n.to_le_bytes());
}

pub(crate) fn huff_lens(freq_in: &[u32; 256]) -> [u8; 256] {
    let mut freq = *freq_in;
    for _scale in 0..12 {
    #[derive(Clone, Copy)]
    struct N {
        f: u64,
        i: i16,
    }
    let mut heap: Vec<N> = Vec::new();
    for (i, &f) in freq.iter().enumerate() {
        if f > 0 {
            heap.push(N { f: f as u64, i: i as i16 });
        }
    }
    if heap.is_empty() {
        return [0; 256];
    }
    if heap.len() == 1 {
        let mut l = [0u8; 256];
        l[heap[0].i as usize] = 1;
        return l;
    }
    // parent of node k (>=256) stored in par
    let mut par = vec![-1i16; 512];
    let mut next = 256i16;
    while heap.len() > 1 {
        heap.sort_by_key(|n| (n.f, n.i));
        let a = heap.remove(0);
        let b = heap.remove(0);
        par[a.i as usize] = next;
        par[b.i as usize] = next;
        heap.push(N { f: a.f + b.f, i: next });
        next += 1;
    }
    let mut len = [0u8; 256];
    for i in 0..256 {
        if freq[i] == 0 {
            continue;
        }
        let mut d = 0u8;
        let mut x = i as i16;
        while x < next && par[x as usize] >= 0 {
            d = d.saturating_add(1);
            x = par[x as usize];
            if d == 32 {
                break;
            }
        }
        if d == 0 {
            d = 1;
        }
        len[i] = d;
    }
    let maxd = len.iter().copied().max().unwrap_or(0);
    let mut kraft = 0u64;
    for &l in &len {
        if l > 0 && l <= 24 {
            kraft += 1u64 << (24 - l);
        }
    }
    if maxd <= 24 && maxd > 0 && kraft <= (1u64 << 24) {
        return len;
    }
    for f in freq.iter_mut() {
        *f = (*f / 2).max(if *f > 0 { 1 } else { 0 });
    }
    }
    let mut last = [0u8; 256];
    for i in 0..256 {
        if freq_in[i] > 0 {
            last[i] = 8;
        }
    }
    last
}

pub(crate) fn huff_codes(len: &[u8; 256]) -> [u32; 256] {
    let mut bl = [0u32; 25];
    for &l in len {
        if l > 0 && l <= 24 {
            bl[l as usize] += 1;
        }
    }
    let mut next = [0u32; 25];
    let mut code = 0u32;
    for l in 1..=24 {
        code = (code + bl[l - 1]) << 1;
        next[l] = code;
    }
    let mut c = [0u32; 256];
    for i in 0..256 {
        let l = len[i] as usize;
        if l > 0 {
            c[i] = next[l];
            next[l] += 1;
        }
    }
    c
}

fn huff_encode(data: &[u8]) -> Vec<u8> {
    let mut freq = [0u32; 256];
    for &b in data {
        freq[b as usize] += 1;
    }
    let len = huff_lens(&freq);
    let codes = huff_codes(&len);
    let mut out = Vec::with_capacity(256 + data.len());
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    out.extend_from_slice(&len);
    let mut acc = 0u64;
    let mut bits = 0u32;
    for &b in data {
        let l = len[b as usize] as u32;
        if l == 0 {
            continue;
        }
        acc = (acc << l) | codes[b as usize] as u64;
        bits += l;
        while bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    if bits > 0 {
        out.push((acc << (8 - bits)) as u8);
    }
    out
}

fn huff_decode(buf: &[u8]) -> Result<Vec<u8>, &'static str> {
    if buf.len() < 260 {
        return Err("huff");
    }
    let n = u32::from_le_bytes(buf[0..4].try_into().unwrap()) as usize;
    let mut len = [0u8; 256];
    len.copy_from_slice(&buf[4..260]);
    let codes = huff_codes(&len);
    // first-code and symbol list per length
    let mut first = [0u32; 25];
    let mut count = [0u32; 25];
    for &l in &len {
        if l > 0 && l <= 24 {
            count[l as usize] += 1;
        }
    }
    let mut code = 0u32;
    for l in 1..=24 {
        first[l] = code;
        code = (code + count[l]) << 1;
    }
    let mut syms: Vec<Vec<u8>> = vec![Vec::new(); 25];
    let mut nextc = first;
    let mut placed = [0u16; 17];
    for s in 0..256u16 {
        let l = len[s as usize] as usize;
        if l == 0 {
            continue;
        }
        let pos = (codes[s as usize] - first[l]) as usize;
        if syms[l].len() <= pos {
            syms[l].resize(pos + 1, 0);
        }
        syms[l][pos] = s as u8;
        nextc[l] = nextc[l].saturating_add(1);
        placed[l] += 1;
    }
    let mut out = Vec::with_capacity(n);
    let mut i = 260usize;
    let mut acc = 0u64;
    let mut have = 0u32;
    while out.len() < n {
        if have < 24 {
            if i < buf.len() {
                acc = (acc << 8) | buf[i] as u64;
                i += 1;
                have += 8;
            } else if have == 0 {
                return Err("huff eof");
            } else {
                acc <<= 1;
                have += 1;
            }
        }
        let mut found = false;
        for l in 1usize..=24 {
            if have < l as u32 {
                continue;
            }
            let v = ((acc >> (have - l as u32)) & ((1u64 << l) - 1)) as u32;
            if count[l] == 0 {
                continue;
            }
            if v >= first[l] && v < first[l] + count[l] {
                let idx = (v - first[l]) as usize;
                if idx < syms[l].len() {
                    out.push(syms[l][idx]);
                    have -= l as u32;
                    found = true;
                    break;
                }
            }
        }
        if !found {
            if i >= buf.len() && have < 16 {
                return Err("huff code");
            }
            if i >= buf.len() {
                return Err("huff code");
            }
        }
    }
    Ok(out)
}

fn mtab_encode(data: &[u8], parts: usize) -> Vec<u8> {
    let parts = parts.clamp(2, 6);
    let n = data.len();
    let mut out = Vec::from(*b"MTAB");
    out.push(parts as u8);
    out.extend_from_slice(&(n as u32).to_le_bytes());
    for p in 0..parts {
        let a = n * p / parts;
        let b = n * (p + 1) / parts;
        let h = huff_encode(&data[a..b]);
        out.extend_from_slice(&(h.len() as u32).to_le_bytes());
        out.extend_from_slice(&h);
    }
    out
}

fn mtab_decode(buf: &[u8]) -> Result<Vec<u8>, &'static str> {
    if buf.len() < 9 || &buf[..4] != b"MTAB" {
        return Err("mtab");
    }
    let parts = buf[4] as usize;
    let n = u32::from_le_bytes(buf[5..9].try_into().unwrap()) as usize;
    if parts < 2 || parts > 6 {
        return Err("mtab n");
    }
    let mut pos = 9usize;
    let mut out = Vec::with_capacity(n);
    for _ in 0..parts {
        if pos + 4 > buf.len() {
            return Err("mtab hdr");
        }
        let hl = u32::from_le_bytes(buf[pos..pos + 4].try_into().unwrap()) as usize;
        pos += 4;
        if pos + hl > buf.len() {
            return Err("mtab body");
        }
        out.extend_from_slice(&huff_decode(&buf[pos..pos + hl])?);
        pos += hl;
    }
    if out.len() != n {
        return Err("mtab len");
    }
    Ok(out)
}

/// Interpolative: zero-run lengths of MTF ranks (rank 0 only).
fn interp_encode(ranks: &[u8]) -> Vec<u8> {
    let mut runs: Vec<u32> = Vec::new();
    let mut z = 0u32;
    let mut other = Vec::new();
    for &b in ranks {
        if b == 0 {
            z += 1;
        } else {
            runs.push(z);
            z = 0;
            other.push(b);
        }
    }
    runs.push(z);
    let mut out = Vec::from(*b"IP01");
    out.extend_from_slice(&(ranks.len() as u32).to_le_bytes());
    out.extend_from_slice(&(runs.len() as u32).to_le_bytes());
    for r in runs {
        out.extend_from_slice(&r.to_le_bytes());
    }
    out.extend_from_slice(&huff_encode(&other));
    out
}

fn interp_decode(buf: &[u8]) -> Result<Vec<u8>, &'static str> {
    if buf.len() < 12 || &buf[..4] != b"IP01" {
        return Err("ip");
    }
    let n = u32::from_le_bytes(buf[4..8].try_into().unwrap()) as usize;
    let nr = u32::from_le_bytes(buf[8..12].try_into().unwrap()) as usize;
    if buf.len() < 12 + nr * 4 {
        return Err("ip runs");
    }
    let mut runs = Vec::with_capacity(nr);
    let mut pos = 12usize;
    for _ in 0..nr {
        runs.push(u32::from_le_bytes(buf[pos..pos + 4].try_into().unwrap()));
        pos += 4;
    }
    let other = huff_decode(&buf[pos..])?;
    let mut out = Vec::with_capacity(n);
    let mut oi = 0usize;
    for (i, z) in runs.iter().enumerate() {
        for _ in 0..*z {
            out.push(0);
        }
        if i + 1 < runs.len() {
            if oi >= other.len() {
                return Err("ip o");
            }
            out.push(other[oi]);
            oi += 1;
        }
    }
    if out.len() != n {
        return Err("ip n");
    }
    Ok(out)
}

fn range0_encode(data: &[u8]) -> Vec<u8> {
    let mut freq = [1u32; 256];
    for &b in data {
        freq[b as usize] += 1;
    }
    let mut cf = [0u32; 257];
    for i in 0..256 {
        cf[i + 1] = cf[i] + freq[i];
    }
    let tot = cf[256];
    let mut out = Vec::from(*b"R0__");
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    for i in 0..256 {
        out.extend_from_slice(&freq[i].to_le_bytes());
    }
    let mut low = 0u64;
    let mut rng = 0xffff_ffffu64;
    for &b in data {
        let c0 = cf[b as usize] as u64;
        let c1 = cf[b as usize + 1] as u64;
        low += rng * c0 / tot as u64;
        rng = rng * (c1 - c0) / tot as u64;
        if rng == 0 {
            rng = 1;
        }
        while rng < (1u64 << 24) {
            out.push((low >> 24) as u8);
            low = (low << 8) & 0xffff_ffff;
            rng = (rng << 8) & 0xffff_ffff;
            if rng == 0 {
                rng = 1;
            }
        }
    }
    for _ in 0..4 {
        out.push((low >> 24) as u8);
        low <<= 8;
    }
    out
}

fn range0_decode(buf: &[u8]) -> Result<Vec<u8>, &'static str> {
    if buf.len() < 8 + 256 * 4 || &buf[..4] != b"R0__" {
        return Err("r0");
    }
    let n = u32::from_le_bytes(buf[4..8].try_into().unwrap()) as usize;
    let mut freq = [0u32; 256];
    let mut pos = 8usize;
    for i in 0..256 {
        freq[i] = u32::from_le_bytes(buf[pos..pos + 4].try_into().unwrap());
        pos += 4;
    }
    let mut cf = [0u32; 257];
    for i in 0..256 {
        cf[i + 1] = cf[i] + freq[i];
    }
    let tot = cf[256];
    if tot == 0 {
        return Err("r0 tot");
    }
    let mut code = 0u64;
    for _ in 0..4 {
        code = (code << 8) | *buf.get(pos).unwrap_or(&0) as u64;
        pos += 1;
    }
    let mut low = 0u64;
    let mut rng = 0xffff_ffffu64;
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        if rng == 0 {
            rng = 1;
        }
        let t = ((code.saturating_sub(low) + 1) * tot as u64 - 1) / rng;
        let mut s = 255u8;
        for i in 0..256 {
            if cf[i + 1] as u64 > t {
                s = i as u8;
                break;
            }
        }
        out.push(s);
        let c0 = cf[s as usize] as u64;
        let c1 = cf[s as usize + 1] as u64;
        low += rng * c0 / tot as u64;
        rng = rng * (c1 - c0) / tot as u64;
        if rng == 0 {
            rng = 1;
        }
        while rng < (1u64 << 24) {
            code = ((code << 8) | *buf.get(pos).unwrap_or(&0) as u64) & 0xffff_ffff;
            pos += 1;
            low = (low << 8) & 0xffff_ffff;
            rng = (rng << 8) & 0xffff_ffff;
            if rng == 0 {
                rng = 1;
            }
        }
    }
    Ok(out)
}

pub fn is_pccx(buf: &[u8]) -> bool {
    buf.len() >= 17 && buf.starts_with(MAGIC) && buf[4] == VER
}

/// Hash-chain LZ. Own matcher. 1 MiB window, min 4.
fn lz_tokens(data: &[u8]) -> Vec<u8> {
    const W: usize = 1 << 20;
    const H: usize = 1 << 18;
    let n = data.len();
    let mut head = vec![-1i32; H];
    let mut prev = vec![-1i32; n];
    let mut out = Vec::with_capacity(n / 2 + 16);
    out.extend_from_slice(&(n as u32).to_le_bytes());
    let mut i = 0usize;
    while i < n {
        let mut best_l = 0usize;
        let mut best_d = 0usize;
        if i + 3 < n {
            let h = u32::from_le_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]) as usize
                % H;
            let mut p = head[h];
            let floor = i.saturating_sub(W) as i32;
            let mut steps = 0u32;
            while p >= floor && steps < 1024 {
                let j = p as usize;
                let mut l = 0usize;
                while i + l < n && j + l < i && data[i + l] == data[j + l] && l < 255 {
                    l += 1;
                }
                if l >= 4 && l > best_l {
                    best_l = l;
                    best_d = i - j;
                }
                p = prev[j];
                steps += 1;
            }
            prev[i] = head[h];
            head[h] = i as i32;
        }
        if best_l >= 4 {
            out.push(1);
            out.push(best_l as u8);
            out.extend_from_slice(&(best_d as u32).to_le_bytes());
            for k in 1..best_l {
                if i + k + 3 < n {
                    let h = u32::from_le_bytes([
                        data[i + k],
                        data[i + k + 1],
                        data[i + k + 2],
                        data[i + k + 3],
                    ]) as usize
                        % H;
                    prev[i + k] = head[h];
                    head[h] = (i + k) as i32;
                }
            }
            i += best_l;
        } else {
            out.push(0);
            out.push(data[i]);
            i += 1;
        }
    }
    out
}

fn lz_detok(buf: &[u8]) -> Result<Vec<u8>, &'static str> {
    if buf.len() < 4 {
        return Err("lz");
    }
    let n = u32::from_le_bytes(buf[0..4].try_into().unwrap()) as usize;
    let mut i = 4usize;
    let mut out = Vec::with_capacity(n);
    while out.len() < n {
        if i >= buf.len() {
            return Err("lz trunc");
        }
        match buf[i] {
            0 => {
                i += 1;
                if i >= buf.len() {
                    return Err("lz lit");
                }
                out.push(buf[i]);
                i += 1;
            }
            1 => {
                i += 1;
                if i + 5 > buf.len() {
                    return Err("lz m");
                }
                let len = buf[i] as usize;
                i += 1;
                let d = u32::from_le_bytes(buf[i..i + 4].try_into().unwrap()) as usize;
                i += 4;
                if d == 0 || d > out.len() {
                    return Err("lz dist");
                }
                for _ in 0..len {
                    out.push(out[out.len() - d]);
                }
            }
            _ => return Err("lz op"),
        }
    }
    if out.len() != n {
        return Err("lz n");
    }
    Ok(out)
}

fn solid(data: &[u8]) -> Option<u8> {
    if data.is_empty() {
        return None;
    }
    let s = data[0];
    if data.iter().all(|&b| b == s) {
        Some(s)
    } else {
        None
    }
}

fn pack(raw_len: u32, crc: u32, op: Op, blob: &[u8]) -> Vec<u8> {
    let mut out = Vec::from(*MAGIC);
    out.push(VER);
    put_u32(&mut out, raw_len);
    put_u32(&mut out, crc);
    put_u32(&mut out, 1);
    out.push(op as u8);
    put_u32(&mut out, raw_len);
    put_u32(&mut out, blob.len() as u32);
    out.extend_from_slice(blob);
    out
}

fn foreign_host(buf: &[u8]) -> bool {
    (buf.len() >= 2 && buf.starts_with(&[0x1f, 0x8b]))
        || (buf.len() >= 4
            && (buf.starts_with(b"XZ1\0") || buf.starts_with(b"ZLB1") || buf.starts_with(b"BZh") || buf.starts_with(b"\xfd7zXZ")))
}

fn consider(data: &[u8], crc: u32, op: Op, blob: Vec<u8>, best_op: &mut Op, best: &mut Vec<u8>) {
    if blob.len() >= best.len() {
        return;
    }
    let trial = pack(data.len() as u32, crc, op, &blob);
    if decode(&trial).ok().as_deref() == Some(data) {
        *best_op = op;
        *best = blob;
    }
}

/// One chunk: every own seat, pick smallest that round-trips.
fn encode_solid(data: &[u8]) -> Option<Vec<u8>> {
    let crc = crc32(data);
    let mut best_op = Op::Store;
    let mut best = data.to_vec();
    if let Some(s) = solid(data) {
        consider(data, crc, Op::Zero, vec![s], &mut best_op, &mut best);
    }
    consider(data, crc, Op::Match, lz_tokens(data), &mut best_op, &mut best);
    if let Some(oz) = pulsar::own_lz::own_lz_encode(data) {
        consider(data, crc, Op::Match, oz, &mut best_op, &mut best);
    }
    if let Some(p) = pulsar::pulsar_encode(data) {
        let op = if p.starts_with(b"OZL2") { Op::Match } else { Op::Bwt };
        consider(data, crc, op, p, &mut best_op, &mut best);
    }
    consider(
        data,
        crc,
        Op::Bwt,
        pulsar::bwt_ans::compress(data),
        &mut best_op,
        &mut best,
    );
    let bcj = combined_gc::bcj::encode(data);
    if bcj.as_slice() != data {
        let mut w = Vec::from(*b"BCJ1");
        w.extend_from_slice(&lz_tokens(&bcj));
        consider(data, crc, Op::Match, w, &mut best_op, &mut best);
    }
    let gc = combined_gc::frame::compress_with_pack(data, data.len().max(1)).bytes;
    if !foreign_host(&gc) {
        consider(data, crc, Op::Aware, gc, &mut best_op, &mut best);
    }
    // Hot path only: raw BWT + O1 / ADO1 / H69. Losing seats stay in decode.
    {
        let flag = 0u8;
        let (l, prim) = combined_gc::transforms::bwt_big_block(data);
        let ranks = combined_gc::mtf::mtf_encode(&l);
        let rle = combined_gc::mtf::rle0_from_ranks(&ranks);
        let o1 = combined_gc::order1_ans::encode_auto(&rle);
        let mut bm = Vec::from(*b"BM01");
        bm.push(flag);
        bm.extend_from_slice(&(data.len() as u32).to_le_bytes());
        bm.extend_from_slice(&(prim as u32).to_le_bytes());
        bm.extend_from_slice(&o1);
        consider(data, crc, Op::Bwt, bm, &mut best_op, &mut best);
        for (tag, payload) in [
            (*b"ADO1", crate::adp_o1::encode(&rle)),
        ] {
            let mut v = Vec::from(tag);
            v.push(flag);
            v.extend_from_slice(&(data.len() as u32).to_le_bytes());
            v.extend_from_slice(&(prim as u32).to_le_bytes());
            v.extend_from_slice(&payload);
            consider(data, crc, Op::Bwt, v, &mut best_op, &mut best);
        }
    }
    if best.len() >= data.len() && best_op != Op::Zero {
        return None;
    }
    let out = pack(data.len() as u32, crc, best_op, &best);
    match decode(&out) {
        Ok(back) if back == data && out.len() < data.len() => Some(out),
        _ => None,
    }
}

fn tile_features(data: &[u8], pos: f64, prev: usize) -> [f64; crate::bandit::D] {
    let n = data.len().max(1) as f64;
    let mut z = 0.0;
    let mut hist = [0u32; 256];
    for &b in data {
        hist[b as usize] += 1;
        if b == 0 {
            z += 1.0;
        }
    }
    let mut h = 0.0;
    for c in hist {
        if c > 0 {
            let p = c as f64 / n;
            h -= p * p.log2();
        }
    }
    let mut hits = 0u32;
    let mut seen = 0u32;
    let mut last = [0u32; 256];
    for (i, w) in data.windows(3).enumerate() {
        let k = ((w[0] as u32) << 16) ^ ((w[1] as u32) << 8) ^ w[2] as u32;
        let slot = (k as usize) & 255;
        if last[slot] != 0 && i as u32 >= last[slot] && (i as u32) - last[slot] < 4096 {
            hits += 1;
        }
        last[slot] = i as u32 + 1;
        seen += 1;
        if seen > 4096 {
            break;
        }
    }
    crate::bandit::features(
        z / n,
        h / 8.0,
        hits as f64 / seen.max(1) as f64,
        pos,
        prev,
    )
}

fn encode_match_only(data: &[u8]) -> Option<Vec<u8>> {
    let crc = crc32(data);
    let mut best_op = Op::Store;
    let mut best = data.to_vec();
    consider(data, crc, Op::Match, lz_tokens(data), &mut best_op, &mut best);
    if best.len() >= data.len() {
        return None;
    }
    let out = pack(data.len() as u32, crc, best_op, &best);
    match decode(&out) {
        Ok(back) if back == data && out.len() < data.len() => Some(out),
        _ => None,
    }
}

fn encode_ado1_only(data: &[u8]) -> Option<Vec<u8>> {
    let crc = crc32(data);
    let mut best_op = Op::Store;
    let mut best = data.to_vec();
    let (l, prim) = combined_gc::transforms::bwt_big_block(data);
    let ranks = combined_gc::mtf::mtf_encode(&l);
    let rle = combined_gc::mtf::rle0_from_ranks(&ranks);
    let mut v = Vec::from(*b"ADO1");
    v.push(0u8);
    v.extend_from_slice(&(data.len() as u32).to_le_bytes());
    v.extend_from_slice(&(prim as u32).to_le_bytes());
    v.extend_from_slice(&crate::adp_o1::encode(&rle));
    consider(data, crc, Op::Bwt, v, &mut best_op, &mut best);
    if best.len() >= data.len() {
        return None;
    }
    let out = pack(data.len() as u32, crc, best_op, &best);
    match decode(&out) {
        Ok(back) if back == data && out.len() < data.len() => Some(out),
        _ => None,
    }
}

fn pack_tiles(data: &[u8], tile: usize) -> Option<Vec<u8>> {
    if data.len() <= tile {
        return None;
    }
    let crc = crc32(data);
    let mut chunks: Vec<(Op, u32, Vec<u8>)> = Vec::new();
    let mut i = 0usize;
    let mut ucb = crate::bandit::LinUcb::new(0.5);
    let mut prev_arm = crate::bandit::ARM_BWT;
    let mut tile_i = 0usize;
    while i < data.len() {
        let sl = &data[i..(i + tile).min(data.len())];
        let x = tile_features(sl, i as f64 / data.len().max(1) as f64, prev_arm);
        let one = if tile_i == 0 {
            encode_solid(sl)
        } else if ucb.select(&x) == crate::bandit::ARM_MATCH {
            encode_match_only(sl).or_else(|| encode_solid(sl))
        } else {
            encode_ado1_only(sl).or_else(|| encode_solid(sl))
        };
        let (mop, blob) = if let Some(one) = one {
            if one.len() < 26 {
                return None;
            }
            let op = one[17];
            let bl = u32::from_le_bytes(one[22..26].try_into().ok()?) as usize;
            let blob = one[26..26 + bl].to_vec();
            let mop = match op {
                0 => Op::Zero,
                1 => Op::Match,
                2 => Op::Bwt,
                12 => Op::Aware,
                _ => Op::Store,
            };
            (mop, blob)
        } else {
            (Op::Store, sl.to_vec())
        };
        let arm = if mop == Op::Match {
            crate::bandit::ARM_MATCH
        } else {
            crate::bandit::ARM_BWT
        };
        let reward = (1.0 - blob.len() as f64 / sl.len().max(1) as f64).clamp(0.0, 1.0);
        ucb.update(arm, &x, reward);
        prev_arm = arm;
        tile_i += 1;
        chunks.push((mop, sl.len() as u32, blob));
        i += sl.len();
    }
    let mut out = Vec::from(*MAGIC);
    out.push(VER);
    put_u32(&mut out, data.len() as u32);
    put_u32(&mut out, crc);
    put_u32(&mut out, chunks.len() as u32);
    for (op, rl, blob) in &chunks {
        out.push(*op as u8);
        put_u32(&mut out, *rl);
        put_u32(&mut out, blob.len() as u32);
        out.extend_from_slice(blob);
    }
    match decode(&out) {
        Ok(back) if back == data && out.len() < data.len() => Some(out),
        _ => None,
    }
}

pub fn encode(data: &[u8]) -> Option<Vec<u8>> {
    if data.is_empty() {
        return None;
    }
    const TILE: usize = 256 * 1024;
    if data.len() <= TILE {
        return encode_solid(data);
    }
    // Large inputs: tile first. One BWT of the whole file is too slow.
    pack_tiles(data, TILE)
}

fn decode_bm(blob: &[u8]) -> Result<Vec<u8>, &'static str> {
    if blob.len() < 13 {
        return Err("bm");
    }
    let tag = &blob[..4];
    let flag = blob[4];
    let delta = flag == 1;
    let prerle = flag == 2;
    let n = u32::from_le_bytes(blob[5..9].try_into().unwrap()) as usize;
    let prim = u32::from_le_bytes(blob[9..13].try_into().unwrap());
    let rest = &blob[13..];
    let l = if tag == b"BM01" {
        let rle = combined_gc::order1_ans::decode(rest)?;
        let ranks = combined_gc::mtf::rle0_to_ranks(&rle);
        combined_gc::mtf::mtf_decode(&ranks)
    } else if tag == b"BM32" {
        let ranks = combined_gc::clean_o32::decode(rest)?;
        combined_gc::mtf::mtf_decode(&ranks)
    } else if tag == b"BWFC" {
        let w = combined_gc::order1_ans::decode(rest)?;
        combined_gc::wfc::wfc_rle0_decode(&w)
    } else if tag == b"BMCM" {
        let rle = combined_gc::cm::cm_decode(rest)?;
        let ranks = combined_gc::mtf::rle0_to_ranks(&rle);
        combined_gc::mtf::mtf_decode(&ranks)
    } else if tag == b"BMCR" {
        let ranks = combined_gc::cm::cm_decode(rest)?;
        combined_gc::mtf::mtf_decode(&ranks)
    } else if tag == b"BMHF" {
        let rle = huff_decode(rest)?;
        let ranks = combined_gc::mtf::rle0_to_ranks(&rle);
        combined_gc::mtf::mtf_decode(&ranks)
    } else if tag == b"BMHR" {
        let ranks = huff_decode(rest)?;
        combined_gc::mtf::mtf_decode(&ranks)
    } else if tag == b"BMIP" {
        let ranks = interp_decode(rest)?;
        combined_gc::mtf::mtf_decode(&ranks)
    } else if tag == b"BMR0" {
        let rle = range0_decode(rest)?;
        let ranks = combined_gc::mtf::rle0_to_ranks(&rle);
        combined_gc::mtf::mtf_decode(&ranks)
    } else if tag == b"BMT2" || tag == b"BMT3" || tag == b"BMT6" {
        let rle = mtab_decode(rest)?;
        let ranks = combined_gc::mtf::rle0_to_ranks(&rle);
        combined_gc::mtf::mtf_decode(&ranks)
    } else if tag == b"PTS2" || tag == b"PTS3" || tag == b"PTS6" {
        let rle = crate::ptasz::decode(rest)?;
        let ranks = combined_gc::mtf::rle0_to_ranks(&rle);
        combined_gc::mtf::mtf_decode(&ranks)
    } else if tag == b"BMO2" {
        let rle = crate::o2rle::decode(rest)?;
        let ranks = combined_gc::mtf::rle0_to_ranks(&rle);
        combined_gc::mtf::mtf_decode(&ranks)
    } else if tag == b"ADO1" {
        let rle = crate::adp_o1::decode(rest)?;
        let ranks = combined_gc::mtf::rle0_to_ranks(&rle);
        combined_gc::mtf::mtf_decode(&ranks)
    } else if tag == b"H69\0" {
        let rle = crate::huff67::decode(rest)?;
        let ranks = combined_gc::mtf::rle0_to_ranks(&rle);
        combined_gc::mtf::mtf_decode(&ranks)
    } else {
        return Err("bm tag");
    };
    if l.len() != n {
        return Err("bm n");
    }
    let mut idx = Vec::with_capacity(8 + l.len());
    idx.extend_from_slice(&(n as u32).to_le_bytes());
    idx.extend_from_slice(&prim.to_le_bytes());
    idx.extend_from_slice(&l);
    let raw = combined_gc::transforms::ibwt_16k_indexed(&idx)?;
    if prerle {
        crate::prerle::decode(&raw)
    } else if delta {
        Ok(combined_gc::transforms::undelta_transform(&raw))
    } else {
        Ok(raw)
    }
}

fn decode_blob(op: u8, raw_len: usize, blob: &[u8]) -> Result<Vec<u8>, &'static str> {
    let out = match op {
        0 => {
            if blob.len() != 1 {
                return Err("zero");
            }
            vec![blob[0]; raw_len]
        }
        1 => {
            if blob.starts_with(b"BCJ1") {
                let inner = &blob[4..];
                let mid = if inner.starts_with(b"OZL2") {
                    pulsar::own_lz::own_lz_decode(inner)?
                } else {
                    lz_detok(inner)?
                };
                combined_gc::bcj::decode(&mid)
            } else if blob.starts_with(b"OZL2") {
                pulsar::own_lz::own_lz_decode(blob)?
            } else {
                lz_detok(blob)?
            }
        }
        2 => {
            if blob.len() >= 13
                && (blob.starts_with(b"BM01")
                    || blob.starts_with(b"BM32")
                    || blob.starts_with(b"BWFC")
                    || blob.starts_with(b"BMCM")
                    || blob.starts_with(b"BMCR")
                    || blob.starts_with(b"BMHF")
                    || blob.starts_with(b"BMHR")
                    || blob.starts_with(b"BMIP")
                    || blob.starts_with(b"BMR0")
                    || blob.starts_with(b"BMT2")
                    || blob.starts_with(b"BMT3")
                    || blob.starts_with(b"BMT6")
                    || blob.starts_with(b"PTS2")
                    || blob.starts_with(b"PTS3")
                    || blob.starts_with(b"PTS6")
                    || blob.starts_with(b"BMO2")
                    || blob.starts_with(b"ADO1")
                    || blob.starts_with(b"H69\0")) {
                decode_bm(blob)?
            } else {
                pulsar::pulsar_decode(blob).or_else(|_| pulsar::bwt_ans::decompress(blob).map_err(|_| "bwt"))?
            }
        }
        12 => {
            if blob.starts_with(b"CM11") {
                combined_gc::cm::cm_decode(blob)?
            } else {
                combined_gc::frame::decompress(blob)?
            }
        }
        3 => {
            if blob.len() != raw_len {
                return Err("store");
            }
            blob.to_vec()
        }
        _ => return Err("op"),
    };
    if out.len() != raw_len {
        return Err("n");
    }
    Ok(out)
}

pub fn decode(buf: &[u8]) -> Result<Vec<u8>, &'static str> {
    if !is_pccx(buf) {
        return Err("pccx");
    }
    let raw_len = u32::from_le_bytes(buf[5..9].try_into().unwrap()) as usize;
    let crc = u32::from_le_bytes(buf[9..13].try_into().unwrap());
    let nb = u32::from_le_bytes(buf[13..17].try_into().unwrap()) as usize;
    if nb == 0 || nb > 4096 {
        return Err("pccx blocks");
    }
    let mut pos = 17usize;
    let mut out = Vec::with_capacity(raw_len);
    for _ in 0..nb {
        if pos + 9 > buf.len() {
            return Err("pccx hdr");
        }
        let op = buf[pos];
        pos += 1;
        let rl = u32::from_le_bytes(buf[pos..pos + 4].try_into().unwrap()) as usize;
        pos += 4;
        let bl = u32::from_le_bytes(buf[pos..pos + 4].try_into().unwrap()) as usize;
        pos += 4;
        if pos + bl > buf.len() {
            return Err("pccx len");
        }
        let piece = decode_blob(op, rl, &buf[pos..pos + bl])?;
        out.extend_from_slice(&piece);
        pos += bl;
    }
    if out.len() != raw_len {
        return Err("n");
    }
    if crc32(&out) != crc {
        return Err("crc");
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zeros() {
        let s = vec![0u8; 1000];
        let e = encode(&s).unwrap();
        assert_eq!(decode(&e).unwrap(), s);
        assert!(e.len() < 40);
    }

    #[test]
    fn repeat() {
        let s = b"the cat sat on the mat. the cat sat. ".repeat(80);
        let e = encode(&s).unwrap();
        assert_eq!(decode(&e).unwrap(), s);
        assert!(e.len() < s.len());
    }

    #[test]
    fn huff_rt() {
        let s = b"abracadabra".repeat(40);
        let e = huff_encode(&s);
        assert_eq!(huff_decode(&e).unwrap(), s);
    }

    #[test]
    fn ptasz_rt() {
        let s = b"the cat sat on the mat. the cat sat. ".repeat(80);
        let e = crate::ptasz::encode(&s, 3);
        assert_eq!(crate::ptasz::decode(&e).unwrap(), s);
    }

    #[test]
    fn h69_rt() {
        let s: Vec<u8> = (0..800).map(|i| (i % 9) as u8).collect();
        let e = crate::huff67::encode(&s);
        assert_eq!(crate::huff67::decode(&e).unwrap(), s);
    }

    #[test]
    fn adp_small_rt() {
        let s: Vec<u8> = (0..400).map(|i| (i % 5) as u8).collect();
        let e = crate::adp_o1::encode(&s);
        assert_eq!(crate::adp_o1::decode(&e).unwrap(), s);
    }

    #[test]
    fn isolated_dickens_seats() {
        let path = "/home/workdir/artifacts/private/corpus/silesia/dickens";
        let Ok(all) = std::fs::read(path) else { return };
        let data = &all[..all.len().min(256 * 1024)];
        let (l,_) = combined_gc::transforms::bwt_big_block(data);
        let ranks = combined_gc::mtf::mtf_encode(&l);
        let rle = combined_gc::mtf::rle0_from_ranks(&ranks);
        let o1 = combined_gc::order1_ans::encode_auto(&rle);
        let n_esc = rle.iter().filter(|&&b| b>=66).count();
        let adp = crate::adp_o1::encode(&rle);
        let h67 = crate::huff67::encode(&rle);
        let back = crate::adp_o1::decode(&adp);
        eprintln!(
            "static_o1={} adaptive_o1={} h67={} rle={} esc={} rt={} h67rt={}",
            o1.len(), adp.len(), h67.len(), rle.len(), n_esc,
            back.as_ref().ok().map(|b| b.as_slice() == rle.as_slice()).unwrap_or(false),
            crate::huff67::decode(&h67).ok().as_ref().map(|b| b.as_slice()==rle.as_slice()).unwrap_or(false)
        );
    }
}
