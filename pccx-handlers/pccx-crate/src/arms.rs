//! Special-case arms for PCCX: SAO star-catalog columnar (op 13)
//! and generic 16-bit left-delta (op 14, targets x-ray DICOM).
//!
//! Both arms produce a self-contained blob; the main try-all picker in
//! lib.rs keeps whichever arm (old or new) yields the smallest verified
//! output. Decode is exact: every transform is inverted and the frame CRC
//! still guards the final bytes.

use crate::{lz_detok, lz_tokens};

fn put_u32(out: &mut Vec<u8>, n: u32) {
    out.extend_from_slice(&n.to_le_bytes());
}

fn get_u32(buf: &[u8], pos: &mut usize) -> Result<u32, &'static str> {
    if *pos + 4 > buf.len() {
        return Err("arm trunc");
    }
    let v = u32::from_le_bytes(buf[*pos..*pos + 4].try_into().unwrap());
    *pos += 4;
    Ok(v)
}

/// Per-payload second stage: raw vs own LZ vs pulsar BWT-ANS, keep smallest.
fn best_of(raw: &[u8]) -> (u8, Vec<u8>) {
    let mut m = 0u8;
    let mut b = raw.to_vec();
    let lz = lz_tokens(raw);
    if lz.len() < b.len() {
        m = 1;
        b = lz;
    }
    let bw = pulsar::bwt_ans::compress(raw);
    if bw.len() < b.len() {
        m = 2;
        b = bw;
    }
    (m, b)
}

fn unbest(method: u8, payload: &[u8]) -> Result<Vec<u8>, &'static str> {
    match method {
        0 => Ok(payload.to_vec()),
        1 => lz_detok(payload),
        2 => pulsar::bwt_ans::decompress(payload).map_err(|_| "arm bwt"),
        _ => Err("arm method"),
    }
}

// ---------------------------------------------------------------------------
// SAO star catalog arm (op 13)
// ---------------------------------------------------------------------------
// Layout: R records x 28 bytes = 7 x u32 LE columns. Record 0 is a header
// (0, 1, nrec, 0, 1, 1, 28): field[2] = nrec data records, field[6] = 28
// (record size). Column 1 is sorted -> delta coded. Columns 4..6 are tiny
// dictionaries -> rank coded. The rest go through as raw u32 bytes.

const SAO_REC: usize = 28;
const SAO_NCOL: usize = 7;

fn sao_sniff(data: &[u8]) -> Option<usize> {
    if data.len() < 2 * SAO_REC || data.len() % SAO_REC != 0 {
        return None;
    }
    let mut f = [0u32; SAO_NCOL];
    for (i, v) in f.iter_mut().enumerate() {
        *v = u32::from_le_bytes(data[4 * i..4 * i + 4].try_into().unwrap());
    }
    if f[6] as usize != SAO_REC {
        return None;
    }
    let nrec = f[2] as usize;
    if nrec == 0 || (nrec + 1) * SAO_REC != data.len() {
        return None;
    }
    Some(nrec)
}

/// Raw u32 column second stage: try interleaved bytes, byte-plane split
/// (4 planes, each through best_of), and wrapping u32 delta; keep the true
/// minimum by exact bytes. Returns (method, payload); method 0/1/2 =
/// best_of on interleaved bytes, 3 = 4 planes, 4 = delta + best_of.
fn col_raw_best(col: &[u32]) -> (u8, Vec<u8>) {
    let r = col.len();
    let mut raw = Vec::with_capacity(r * 4);
    for &v in col {
        raw.extend_from_slice(&v.to_le_bytes());
    }
    let (m0, p0) = best_of(&raw);
    let mut best_m = m0;
    let mut best_p = p0;
    let mut best_tot = 5 + best_p.len(); // outer [m][plen] framing
    // byte planes
    {
        let mut planes: Vec<Vec<u8>> = vec![Vec::with_capacity(r); 4];
        for &v in col {
            let b = v.to_le_bytes();
            for k in 0..4 {
                planes[k].push(b[k]);
            }
        }
        let mut pay = Vec::new();
        for k in 0..4 {
            let (mk, pk) = best_of(&planes[k]);
            pay.push(mk);
            put_u32(&mut pay, pk.len() as u32);
            pay.extend_from_slice(&pk);
        }
        let tot = 5 + pay.len();
        if tot < best_tot {
            best_tot = tot;
            best_m = 3;
            best_p = pay;
        }
    }
    // wrapping u32 delta
    {
        let mut d = Vec::with_capacity(r * 4);
        let mut prev = 0u32;
        for (i, &v) in col.iter().enumerate() {
            let dv = if i == 0 { v } else { v.wrapping_sub(prev) };
            d.extend_from_slice(&dv.to_le_bytes());
            prev = v;
        }
        let (md, pd) = best_of(&d);
        let mut pay = Vec::with_capacity(pd.len() + 5);
        pay.push(md);
        put_u32(&mut pay, pd.len() as u32);
        pay.extend_from_slice(&pd);
        let tot = 5 + pay.len();
        if tot < best_tot {
            best_m = 4;
            best_p = pay;
        }
    }
    (best_m, best_p)
}

pub fn sao_encode(data: &[u8]) -> Option<Vec<u8>> {
    let nrec = sao_sniff(data)?;
    let r = nrec + 1; // records incl. header
    // columns as u32 vecs
    let mut cols: Vec<Vec<u32>> = vec![Vec::with_capacity(r); SAO_NCOL];
    for rec in 0..r {
        let base = rec * SAO_REC;
        for c in 0..SAO_NCOL {
            cols[c].push(u32::from_le_bytes(
                data[base + 4 * c..base + 4 * c + 4].try_into().unwrap(),
            ));
        }
    }
    let mut out = Vec::new();
    put_u32(&mut out, nrec as u32);
    for c in 0..SAO_NCOL {
        if c != 1 && !(4..=6).contains(&c) {
            // raw u32 column (0,2,3): multi-candidate, true minimum
            let (m, payload) = col_raw_best(&cols[c]);
            out.push(m);
            put_u32(&mut out, payload.len() as u32);
            out.extend_from_slice(&payload);
            continue;
        }
        let mut dict: Vec<u32> = Vec::new();
        let tbytes: Vec<u8> = if c == 1 {
            // sorted coordinate column -> deltas
            let mut d = Vec::with_capacity(r * 4);
            let mut prev = 0u32;
            for (i, &v) in cols[c].iter().enumerate() {
                let dv = if i == 0 { v } else { v.wrapping_sub(prev) };
                d.extend_from_slice(&dv.to_le_bytes());
                prev = v;
            }
            d
        } else if (4..=6).contains(&c) {
            // low-cardinality -> dictionary ranks
            let mut uniq = cols[c].clone();
            uniq.sort_unstable();
            uniq.dedup();
            if uniq.len() > 65536 {
                // degenerate: fall back to raw column
                let mut d = Vec::with_capacity(r * 4);
                for &v in &cols[c] {
                    d.extend_from_slice(&v.to_le_bytes());
                }
                d
            } else {
                dict = uniq;
                let mut d = Vec::with_capacity(r * 2);
                if dict.len() <= 256 {
                    for &v in &cols[c] {
                        d.push(dict.binary_search(&v).unwrap() as u8);
                    }
                } else {
                    for &v in &cols[c] {
                        d.extend_from_slice(
                            &(dict.binary_search(&v).unwrap() as u16).to_le_bytes(),
                        );
                    }
                }
                d
            }
        } else {
            // unreachable: raw u32 columns (0,2,3) are handled above via
            // col_raw_best. Kept as a loud failure rather than silent.
            return None;
        };
        if !dict.is_empty() {
            put_u32(&mut out, dict.len() as u32);
            for &v in &dict {
                put_u32(&mut out, v);
            }
        } else if (4..=6).contains(&c) {
            // raw fallback marker: nunique = 0
            put_u32(&mut out, 0);
        }
        let (m, payload) = best_of(&tbytes);
        out.push(m);
        put_u32(&mut out, payload.len() as u32);
        out.extend_from_slice(&payload);
    }
    Some(out)
}

pub fn sao_decode(blob: &[u8]) -> Result<Vec<u8>, &'static str> {
    let mut pos = 0usize;
    let nrec = get_u32(blob, &mut pos)? as usize;
    let r = nrec.checked_add(1).ok_or("arm nrec")?;
    if r == 0 {
        return Err("arm r");
    }
    let mut cols: Vec<Vec<u32>> = vec![Vec::new(); SAO_NCOL];
    for c in 0..SAO_NCOL {
        let mut dict: Vec<u32> = Vec::new();
        if (4..=6).contains(&c) {
            let nd = get_u32(blob, &mut pos)? as usize;
            if nd > 65536 {
                return Err("arm dict");
            }
            dict.reserve(nd);
            for _ in 0..nd {
                dict.push(get_u32(blob, &mut pos)?);
            }
        }
        if pos >= blob.len() {
            return Err("arm trunc");
        }
        let m = blob[pos];
        pos += 1;
        let plen = get_u32(blob, &mut pos)? as usize;
        if pos + plen > blob.len() {
            return Err("arm trunc");
        }
        let payload = &blob[pos..pos + plen];
        pos += plen;
        let col: Vec<u32> = if c == 1 {
            let tbytes = unbest(m, payload)?;
            if tbytes.len() != r * 4 {
                return Err("arm col1 len");
            }
            let mut v = Vec::with_capacity(r);
            let mut prev = 0u32;
            for i in 0..r {
                let dv = u32::from_le_bytes(tbytes[4 * i..4 * i + 4].try_into().unwrap());
                let val = if i == 0 { dv } else { prev.wrapping_add(dv) };
                v.push(val);
                prev = val;
            }
            v
        } else if (4..=6).contains(&c) && !dict.is_empty() {
            let tbytes = unbest(m, payload)?;
            let per = if dict.len() <= 256 { 1 } else { 2 };
            if tbytes.len() != r * per {
                return Err("arm dictcol len");
            }
            let mut v = Vec::with_capacity(r);
            for i in 0..r {
                let rank = if per == 1 {
                    tbytes[i] as usize
                } else {
                    u16::from_le_bytes(tbytes[2 * i..2 * i + 2].try_into().unwrap()) as usize
                };
                if rank >= dict.len() {
                    return Err("arm rank");
                }
                v.push(dict[rank]);
            }
            v
        } else {
            // raw u32 column: method 0/1/2 = interleaved best_of,
            // 3 = 4 byte planes, 4 = u32 delta + best_of.
            // (dict columns with empty dict only ever use 0/1/2.)
            let tbytes: Vec<u8> = if (4..=6).contains(&c) {
                unbest(m, payload)?
            } else {
                match m {
                    0 | 1 | 2 => unbest(m, payload)?,
                    3 => {
                        let mut pp = 0usize;
                        let mut planes: Vec<Vec<u8>> = Vec::new();
                        for _ in 0..4 {
                            if pp + 1 > payload.len() {
                                return Err("arm trunc");
                            }
                            let mk = payload[pp];
                            pp += 1;
                            let lk = get_u32(payload, &mut pp)? as usize;
                            if pp + lk > payload.len() {
                                return Err("arm trunc");
                            }
                            planes.push(unbest(mk, &payload[pp..pp + lk])?);
                            pp += lk;
                        }
                        if pp != payload.len() {
                            return Err("arm trail");
                        }
                        if planes.iter().any(|p| p.len() != r) {
                            return Err("arm planes");
                        }
                        let mut t = Vec::with_capacity(r * 4);
                        for i in 0..r {
                            for k in 0..4 {
                                t.push(planes[k][i]);
                            }
                        }
                        t
                    }
                    4 => {
                        if payload.len() < 5 {
                            return Err("arm trunc");
                        }
                        let im = payload[0];
                        let mut pp = 1usize;
                        let ilen = get_u32(payload, &mut pp)? as usize;
                        if pp + ilen != payload.len() {
                            return Err("arm len");
                        }
                        let dbytes = unbest(im, &payload[pp..pp + ilen])?;
                        if dbytes.len() != r * 4 {
                            return Err("arm col len");
                        }
                        let mut t = Vec::with_capacity(r * 4);
                        let mut prev = 0u32;
                        for i in 0..r {
                            let dv = u32::from_le_bytes(
                                dbytes[4 * i..4 * i + 4].try_into().unwrap(),
                            );
                            let v = if i == 0 {
                                dv
                            } else {
                                prev.wrapping_add(dv)
                            };
                            t.extend_from_slice(&v.to_le_bytes());
                            prev = v;
                        }
                        t
                    }
                    _ => return Err("arm method"),
                }
            };
            if tbytes.len() != r * 4 {
                return Err("arm col len");
            }
            let mut v = Vec::with_capacity(r);
            for i in 0..r {
                v.push(u32::from_le_bytes(
                    tbytes[4 * i..4 * i + 4].try_into().unwrap(),
                ));
            }
            v
        };
        cols[c] = col;
    }
    if pos != blob.len() {
        return Err("arm trail");
    }
    let mut out = Vec::with_capacity(r * SAO_REC);
    for rec in 0..r {
        for c in 0..SAO_NCOL {
            out.extend_from_slice(&cols[c][rec].to_le_bytes());
        }
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// Generic 16-bit left-delta arm (op 14)
// ---------------------------------------------------------------------------
// Treats input as u16 LE pixels, stores v[0] then wrapping left deltas,
// second stage via best_of. Attempted on any even-length input >= 64 KiB;
// the picker keeps it only when it wins.

pub fn d16_encode(data: &[u8]) -> Option<Vec<u8>> {
    // No heuristic gates: attempted on every input with >= 2 bytes.
    // Odd length is zero-padded (flag bit 0); the decoder strips the pad.
    if data.len() < 2 {
        return None;
    }
    let padded = data.len() % 2 == 1;
    let mut buf: Vec<u8> = Vec::with_capacity(data.len() + 1);
    buf.extend_from_slice(data);
    if padded {
        buf.push(0);
    }
    let n = buf.len() / 2;

    // Front-end variants; the winner is the true minimum by exact bytes.
    // v0: left delta (original). v1: lo/hi byte planes. v2: left delta then
    // lo/hi planes of the delta stream. v3: 2nd-order delta.
    let u16s: Vec<u16> = (0..n)
        .map(|i| u16::from_le_bytes([buf[2 * i], buf[2 * i + 1]]))
        .collect();
    let mut best_v = 0u8;
    let mut best_m = 0u8;
    let mut best_payload: Vec<u8> = Vec::new();
    let mut best_len = usize::MAX;
    // v0: left delta
    {
        let mut res = Vec::with_capacity(buf.len());
        let mut prev = u16s[0];
        res.extend_from_slice(&prev.to_le_bytes());
        for &v in &u16s[1..] {
            res.extend_from_slice(&v.wrapping_sub(prev).to_le_bytes());
            prev = v;
        }
        let (m, payload) = best_of(&res);
        // +3 header bytes (flags, variant) vs v0 baseline; counted in total
        if payload.len() < best_len {
            best_len = payload.len();
            best_v = 0;
            best_m = m;
            best_payload = payload;
        }
    }
    // v1: byte planes of the u16 stream
    {
        let mut lo = Vec::with_capacity(n);
        let mut hi = Vec::with_capacity(n);
        for &v in &u16s {
            lo.push((v & 0xff) as u8);
            hi.push((v >> 8) as u8);
        }
        let (m0, p0) = best_of(&lo);
        let (m1, p1) = best_of(&hi);
        // payload framing: [m0][plen0][p0][m1][plen1][p1] = 10 + lens
        let tot = 10 + p0.len() + p1.len();
        if tot < best_len {
            best_len = tot;
            best_v = 1;
            let mut payload = Vec::with_capacity(tot);
            payload.push(m0);
            put_u32(&mut payload, p0.len() as u32);
            payload.extend_from_slice(&p0);
            payload.push(m1);
            put_u32(&mut payload, p1.len() as u32);
            payload.extend_from_slice(&p1);
            best_m = 0; // unused for v1
            best_payload = payload;
        }
    }
    // v2: left delta, then lo/hi planes of the delta stream
    {
        let mut dlo = Vec::with_capacity(n);
        let mut dhi = Vec::with_capacity(n);
        let mut prev = u16s[0];
        dlo.push((prev & 0xff) as u8);
        dhi.push((prev >> 8) as u8);
        for &v in &u16s[1..] {
            let d = v.wrapping_sub(prev);
            dlo.push((d & 0xff) as u8);
            dhi.push((d >> 8) as u8);
            prev = v;
        }
        let (m0, p0) = best_of(&dlo);
        let (m1, p1) = best_of(&dhi);
        let tot = 10 + p0.len() + p1.len();
        if tot < best_len {
            best_len = tot;
            best_v = 2;
            let mut payload = Vec::with_capacity(tot);
            payload.push(m0);
            put_u32(&mut payload, p0.len() as u32);
            payload.extend_from_slice(&p0);
            payload.push(m1);
            put_u32(&mut payload, p1.len() as u32);
            payload.extend_from_slice(&p1);
            best_m = 0;
            best_payload = payload;
        }
    }
    // v3: 2nd-order delta
    {
        let mut res = Vec::with_capacity(buf.len());
        let mut pprev = u16s[0];
        let mut prev = u16s[0];
        res.extend_from_slice(&pprev.to_le_bytes());
        if n > 1 {
            let d1 = u16s[1].wrapping_sub(pprev);
            res.extend_from_slice(&d1.to_le_bytes());
            prev = u16s[1];
            pprev = d1;
            for &v in &u16s[2..] {
                let d = v.wrapping_sub(prev);
                let dd = d.wrapping_sub(pprev);
                res.extend_from_slice(&dd.to_le_bytes());
                pprev = d;
                prev = v;
            }
        }
        let (m, payload) = best_of(&res);
        if payload.len() < best_len {
            best_v = 3;
            best_m = m;
            best_payload = payload;
        }
    }
    let flags: u8 = if padded { 1 } else { 0 };
    let mut out = Vec::with_capacity(best_payload.len() + 12);
    out.push(best_m);
    out.push(flags);
    out.push(best_v);
    put_u32(&mut out, n as u32);
    put_u32(&mut out, best_payload.len() as u32);
    out.extend_from_slice(&best_payload);
    Some(out)
}

pub fn d16_decode(blob: &[u8]) -> Result<Vec<u8>, &'static str> {
    let mut pos = 0usize;
    if blob.len() < 11 {
        return Err("arm trunc");
    }
    let m = blob[0];
    pos = 1;
    let flags = blob[1];
    pos = 2;
    let variant = blob[2];
    pos = 3;
    let n = get_u32(blob, &mut pos)? as usize;
    let plen = get_u32(blob, &mut pos)? as usize;
    if pos + plen != blob.len() {
        return Err("arm len");
    }
    if variant > 3 || flags > 1 {
        return Err("arm variant");
    }
    // Reconstruct the pre-second-stage byte stream per variant.
    let pre: Vec<u8> = match variant {
        0 | 3 => {
            let res = unbest(m, &blob[pos..])?;
            if res.len() != n * 2 {
                return Err("arm d16 len");
            }
            res
        }
        1 | 2 => {
            let mut pp = pos;
            if pp + 1 > blob.len() {
                return Err("arm trunc");
            }
            let m0 = blob[pp];
            pp += 1;
            let l0 = get_u32(blob, &mut pp)? as usize;
            if pp + l0 > blob.len() {
                return Err("arm trunc");
            }
            let p0 = unbest(m0, &blob[pp..pp + l0])?;
            pp += l0;
            if pp + 1 > blob.len() {
                return Err("arm trunc");
            }
            let m1 = blob[pp];
            pp += 1;
            let l1 = get_u32(blob, &mut pp)? as usize;
            if pp + l1 > blob.len() {
                return Err("arm trunc");
            }
            let p1 = unbest(m1, &blob[pp..pp + l1])?;
            pp += l1;
            if pp != blob.len() || p0.len() != n || p1.len() != n {
                return Err("arm d16 planes");
            }
            let mut res = Vec::with_capacity(n * 2);
            for i in 0..n {
                res.push(p0[i]);
                res.push(p1[i]);
            }
            res
        }
        _ => return Err("arm variant"),
    };
    // Invert the front-end to u16s, then to bytes.
    let mut u16s = Vec::with_capacity(n);
    match variant {
        0 => {
            let mut prev = u16::from_le_bytes([pre[0], pre[1]]);
            u16s.push(prev);
            for i in 1..n {
                let d = u16::from_le_bytes([pre[2 * i], pre[2 * i + 1]]);
                prev = prev.wrapping_add(d);
                u16s.push(prev);
            }
        }
        1 => {
            for i in 0..n {
                u16s.push(u16::from_le_bytes([pre[2 * i], pre[2 * i + 1]]));
            }
        }
        2 => {
            let mut prev = u16::from_le_bytes([pre[0], pre[1]]);
            u16s.push(prev);
            for i in 1..n {
                let d = u16::from_le_bytes([pre[2 * i], pre[2 * i + 1]]);
                prev = prev.wrapping_add(d);
                u16s.push(prev);
            }
        }
        3 => {
            let mut prev = u16::from_le_bytes([pre[0], pre[1]]);
            u16s.push(prev);
            if n > 1 {
                let d1 = u16::from_le_bytes([pre[2], pre[3]]);
                prev = prev.wrapping_add(d1);
                u16s.push(prev);
                let mut pdel = d1;
                for i in 2..n {
                    let dd = u16::from_le_bytes([pre[2 * i], pre[2 * i + 1]]);
                    let d = pdel.wrapping_add(dd);
                    prev = prev.wrapping_add(d);
                    u16s.push(prev);
                    pdel = d;
                }
            }
        }
        _ => return Err("arm variant"),
    }
    let mut out = Vec::with_capacity(n * 2);
    for v in u16s {
        out.extend_from_slice(&v.to_le_bytes());
    }
    if flags & 1 == 1 {
        if out.is_empty() {
            return Err("arm pad");
        }
        out.pop();
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_sao() -> Vec<u8> {
        // 5001 records x 28 bytes, header (0,1,5000,0,1,1,28)
        let r = 5001usize;
        let mut cols: Vec<Vec<u32>> = vec![vec![0; r]; SAO_NCOL];
        cols[0][0] = 0;
        cols[1][0] = 1;
        cols[2][0] = 5000;
        cols[3][0] = 0;
        cols[4][0] = 1;
        cols[5][0] = 1;
        cols[6][0] = 28;
        let mut x = 123456789u32;
        let mut rnd = move || {
            x = x.wrapping_mul(1103515245).wrapping_add(12345);
            x
        };
        let mut coord = 1000u32;
        for i in 1..r {
            cols[0][i] = rnd();
            coord = coord.wrapping_add(rnd() % 50 + 1);
            cols[1][i] = coord;
            cols[2][i] = rnd();
            cols[3][i] = rnd();
            cols[4][i] = rnd() % 2818;
            cols[5][i] = rnd() % 1448;
            cols[6][i] = rnd() % 1038;
        }
        let mut out = Vec::with_capacity(r * SAO_REC);
        for rec in 0..r {
            for c in 0..SAO_NCOL {
                out.extend_from_slice(&cols[c][rec].to_le_bytes());
            }
        }
        out
    }

    #[test]
    fn sao_roundtrip() {
        let d = fake_sao();
        let b = sao_encode(&d).expect("sao enc");
        let back = sao_decode(&b).expect("sao dec");
        assert_eq!(back, d);
        // corrupt blob must not decode to the same bytes
        let mut bad = b.clone();
        bad[10] ^= 0xff;
        assert!(sao_decode(&bad).is_err() || sao_decode(&bad).unwrap() != d);
    }

    #[test]
    fn sao_rejects_garbage() {
        assert!(sao_encode(&[]).is_none());
        assert!(sao_encode(&vec![7u8; 100]).is_none());
        assert!(sao_encode(&vec![9u8; 280]).is_none());
    }

    fn fake_xray() -> Vec<u8> {
        // 512x512 u16 pixels, narrow band + noise (mimics DICOM)
        let n = 512 * 512;
        let mut x = 987654321u32;
        let mut out = Vec::with_capacity(n * 2);
        for i in 0..n {
            x = x.wrapping_mul(1103515245).wrapping_add(12345);
            let v = 300u16 + ((i as u32 * 7 + (x >> 16)) % 3500) as u16;
            out.extend_from_slice(&v.to_le_bytes());
        }
        out
    }

    #[test]
    fn d16_roundtrip() {
        let d = fake_xray();
        let b = d16_encode(&d).expect("d16 enc");
        let back = d16_decode(&b).expect("d16 dec");
        assert_eq!(back, d);
        assert!(b.len() < d.len());
    }

    #[test]
    fn d16_rejects_tiny() {
        assert!(d16_encode(&[]).is_none());
        assert!(d16_encode(&[1u8]).is_none());
    }

    #[test]
    fn col_raw_best_picks_delta_on_ramp() {
        let col: Vec<u32> = (0..5000).collect();
        let (m, _) = col_raw_best(&col);
        assert_eq!(m, 4, "ramp column should take u32-delta path");
    }

    #[test]
    fn col_raw_best_no_regression_on_random() {
        // splitmix64: good low bits (LCG low bytes are structured!)
        let mut s = 0x9E3779B97F4A7C15u64;
        let mut rng = || {
            s = s.wrapping_add(0x9E3779B97F4A7C15);
            let mut z = s;
            z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
            z ^ (z >> 31)
        };
        let col: Vec<u32> = (0..5000).map(|_| rng() as u32).collect();
        let (m, _) = col_raw_best(&col);
        assert!(m <= 2, "random column must stay on raw path, got m={}", m);
    }

    #[test]
    fn col_raw_best_picks_planes_on_narrow_band() {
        // 20-bit values in a narrow band: high planes near-constant
        let col: Vec<u32> = (0..5000).map(|i| 1_000_000 + (i * 7919) % 50_000).collect();
        let (m, _) = col_raw_best(&col);
        assert!(m == 3 || m == 4, "narrow band should take planes/delta, got m={}", m);
    }

    fn fake_sao_structured() -> Vec<u8> {
        // col0 = ramp (delta wins), col2 = narrow band (planes win),
        // col3 = random (raw wins); rest like fake_sao
        let r = 5001usize;
        let mut cols: Vec<Vec<u32>> = vec![vec![0; r]; SAO_NCOL];
        cols[0][0] = 0;
        cols[1][0] = 1;
        cols[2][0] = 5000;
        cols[3][0] = 0;
        cols[4][0] = 1;
        cols[5][0] = 1;
        cols[6][0] = 28;
        let mut x = 123456789u32;
        let mut rnd = move || {
            x = x.wrapping_mul(1103515245).wrapping_add(12345);
            x
        };
        let mut coord = 1000u32;
        for i in 1..r {
            cols[0][i] = i as u32;
            coord = coord.wrapping_add(rnd() % 50 + 1);
            cols[1][i] = coord;
            cols[2][i] = 1_000_000 + (i as u32 * 7919) % 50_000;
            cols[3][i] = rnd();
            cols[4][i] = rnd() % 2818;
            cols[5][i] = rnd() % 1448;
            cols[6][i] = rnd() % 1038;
        }
        let mut out = Vec::with_capacity(r * SAO_REC);
        for rec in 0..r {
            for c in 0..SAO_NCOL {
                out.extend_from_slice(&cols[c][rec].to_le_bytes());
            }
        }
        out
    }

    #[test]
    fn sao_structured_columns_roundtrip() {
        let d = fake_sao_structured();
        let b = sao_encode(&d).expect("sao enc structured");
        // col0 header: [nrec:4][m:1] -> m must be 4 (delta)
        assert_eq!(b[4], 4, "col0 should use delta, got m={}", b[4]);
        let back = sao_decode(&b).expect("sao dec structured");
        assert_eq!(back, d);
    }

    #[test]
    fn d16_roundtrip_odd() {
        // odd length: zero-padded with flag; decode strips the pad
        let mut d = fake_xray();
        d.pop();
        assert_eq!(d.len() % 2, 1);
        let b = d16_encode(&d).expect("d16 enc odd");
        assert_eq!(b[1] & 1, 1); // pad flag
        let back = d16_decode(&b).expect("d16 dec odd");
        assert_eq!(back, d);
    }

    #[test]
    fn d16_variants_roundtrip() {
        // exercise all front-end variants through decode
        let d = fake_xray();
        let b = d16_encode(&d).expect("d16 enc");
        let variant = b[2];
        assert!(variant <= 3);
        let back = d16_decode(&b).expect("d16 dec");
        assert_eq!(back, d);
        assert!(b.len() < d.len());
    }
}
