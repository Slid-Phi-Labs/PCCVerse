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
            let mut d = Vec::with_capacity(r * 4);
            for &v in &cols[c] {
                d.extend_from_slice(&v.to_le_bytes());
            }
            d
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
        let tbytes = unbest(m, &blob[pos..pos + plen])?;
        pos += plen;
        let col: Vec<u32> = if c == 1 {
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
    if data.len() < 65536 || data.len() % 2 != 0 {
        return None;
    }
    let n = data.len() / 2;
    let mut res = Vec::with_capacity(data.len());
    let mut prev = u16::from_le_bytes([data[0], data[1]]);
    res.extend_from_slice(&prev.to_le_bytes());
    for i in 1..n {
        let v = u16::from_le_bytes([data[2 * i], data[2 * i + 1]]);
        res.extend_from_slice(&v.wrapping_sub(prev).to_le_bytes());
        prev = v;
    }
    let (m, payload) = best_of(&res);
    let mut out = Vec::with_capacity(payload.len() + 9);
    out.push(m);
    put_u32(&mut out, n as u32);
    put_u32(&mut out, payload.len() as u32);
    out.extend_from_slice(&payload);
    Some(out)
}

pub fn d16_decode(blob: &[u8]) -> Result<Vec<u8>, &'static str> {
    let mut pos = 0usize;
    if blob.is_empty() {
        return Err("arm trunc");
    }
    let m = blob[0];
    pos = 1;
    let n = get_u32(blob, &mut pos)? as usize;
    let plen = get_u32(blob, &mut pos)? as usize;
    if pos + plen != blob.len() {
        return Err("arm len");
    }
    let res = unbest(m, &blob[pos..])?;
    if res.len() != n * 2 {
        return Err("arm d16 len");
    }
    let mut out = Vec::with_capacity(n * 2);
    let mut prev = u16::from_le_bytes([res[0], res[1]]);
    out.extend_from_slice(&prev.to_le_bytes());
    for i in 1..n {
        let d = u16::from_le_bytes([res[2 * i], res[2 * i + 1]]);
        prev = prev.wrapping_add(d);
        out.extend_from_slice(&prev.to_le_bytes());
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
    fn d16_rejects_small_odd() {
        assert!(d16_encode(&vec![1u8; 1000]).is_none());
        assert!(d16_encode(&vec![1u8; 65537]).is_none());
    }
}
