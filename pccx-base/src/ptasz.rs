//! Ptaszeński group selection: 50-symbol groups, 2–6 Huffman tables, MTF selectors.

use crate::{huff_codes, huff_lens};

pub const G: usize = 50;

fn cost(group: &[u8], len: &[u8; 256]) -> u64 {
    group.iter().map(|&s| {
        let l = len[s as usize];
        if l == 0 { 12 } else { l as u64 }
    }).sum()
}

pub fn encode(data: &[u8], ntab: usize) -> Vec<u8> {
    let ntab = ntab.clamp(2, 6);
    if data.is_empty() {
        return Vec::from(*b"PTSZ");
    }
    let groups: Vec<&[u8]> = data.chunks(G).collect();
    let g = groups.len();
    let mut freq = vec![[0u32; 256]; ntab];
    for (i, grp) in groups.iter().enumerate() {
        let t = (i * ntab / g.max(1)).min(ntab - 1);
        for &s in *grp {
            freq[t][s as usize] += 1;
        }
    }
    for t in 0..ntab {
        if freq[t].iter().all(|&x| x == 0) {
            freq[t] = [1; 256];
        }
    }
    let mut lens: Vec<[u8; 256]> = freq.iter().map(huff_lens).collect();
    let mut sel = vec![0u8; g];
    for pass in 0..3 {
        let mut nfreq = vec![[0u32; 256]; ntab];
        for (gi, grp) in groups.iter().enumerate() {
            let mut best_t = 0usize;
            let mut best_c = u64::MAX;
            for t in 0..ntab {
                let c = cost(grp, &lens[t]);
                if c < best_c {
                    best_c = c;
                    best_t = t;
                }
            }
            sel[gi] = best_t as u8;
            for &s in *grp {
                nfreq[best_t][s as usize] += 1;
            }
        }
        for t in 0..ntab {
            if nfreq[t].iter().all(|&x| x == 0) {
                nfreq[t] = freq[t];
            }
        }
        freq = nfreq;
        if pass < 2 {
            lens = freq.iter().map(huff_lens).collect();
        }
    }
    let mut mtf: Vec<u8> = (0..ntab as u8).collect();
    let mut smtf = Vec::with_capacity(g);
    for &s in &sel {
        let pos = mtf.iter().position(|&x| x == s).unwrap_or(0);
        smtf.push(pos as u8);
        let v = mtf.remove(pos);
        mtf.insert(0, v);
    }
    let mut out = Vec::from(*b"PTSZ");
    out.push(ntab as u8);
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    out.extend_from_slice(&(g as u32).to_le_bytes());
    for t in 0..ntab {
        out.extend_from_slice(&lens[t]);
    }
    out.extend_from_slice(&smtf);
    let codes: Vec<[u32; 256]> = lens.iter().map(huff_codes).collect();
    let mut acc = 0u64;
    let mut bits = 0u32;
    for (gi, grp) in groups.iter().enumerate() {
        let t = sel[gi] as usize;
        for &s in *grp {
            let l = lens[t][s as usize] as u32;
            if l == 0 {
                continue;
            }
            acc = (acc << l) | codes[t][s as usize] as u64;
            bits += l;
            while bits >= 8 {
                bits -= 8;
                out.push((acc >> bits) as u8);
            }
        }
    }
    if bits > 0 {
        out.push((acc << (8 - bits)) as u8);
    }
    out
}

pub fn decode(buf: &[u8]) -> Result<Vec<u8>, &'static str> {
    if buf.len() < 13 || &buf[..4] != b"PTSZ" {
        return Err("ptsz");
    }
    let ntab = buf[4] as usize;
    if !(2..=6).contains(&ntab) {
        return Err("ptsz ntab");
    }
    let n = u32::from_le_bytes(buf[5..9].try_into().unwrap()) as usize;
    let g = u32::from_le_bytes(buf[9..13].try_into().unwrap()) as usize;
    let mut pos = 13usize;
    let mut lens = vec![[0u8; 256]; ntab];
    for t in 0..ntab {
        if pos + 256 > buf.len() {
            return Err("ptsz lens");
        }
        lens[t].copy_from_slice(&buf[pos..pos + 256]);
        pos += 256;
    }
    if pos + g > buf.len() {
        return Err("ptsz sel");
    }
    let smtf = buf[pos..pos + g].to_vec();
    pos += g;
    let mut mtf: Vec<u8> = (0..ntab as u8).collect();
    let mut sel = vec![0u8; g];
    for i in 0..g {
        let p = smtf[i] as usize;
        if p >= mtf.len() {
            return Err("ptsz mtf");
        }
        let v = mtf.remove(p);
        mtf.insert(0, v);
        sel[i] = v;
    }
    let mut first = vec![[0u32; 25]; ntab];
    let mut count = vec![[0u32; 25]; ntab];
    let mut syms = vec![vec![Vec::<u8>::new(); 25]; ntab];
    for t in 0..ntab {
        for &l in &lens[t] {
            if l > 0 && l <= 24 {
                count[t][l as usize] += 1;
            }
        }
        let mut code = 0u32;
        for l in 1..=24 {
            first[t][l] = code;
            code = (code + count[t][l]) << 1;
        }
        let codes = huff_codes(&lens[t]);
        for s in 0..256 {
            let l = lens[t][s] as usize;
            if l == 0 {
                continue;
            }
            let idx = (codes[s] - first[t][l]) as usize;
            if syms[t][l].len() <= idx {
                syms[t][l].resize(idx + 1, 0);
            }
            syms[t][l][idx] = s as u8;
        }
    }
    let mut out = Vec::with_capacity(n);
    let mut acc = 0u64;
    let mut have = 0u32;
    let mut gi = 0usize;
    let mut in_g = 0usize;
    while out.len() < n {
        if have < 24 {
            if pos < buf.len() {
                acc = (acc << 8) | buf[pos] as u64;
                pos += 1;
                have += 8;
            } else if have == 0 {
                return Err("ptsz eof");
            } else {
                acc <<= 1;
                have += 1;
            }
        }
        let t = sel.get(gi).copied().unwrap_or(0) as usize;
        let mut found = false;
        for l in 1usize..=24 {
            if have < l as u32 {
                continue;
            }
            let v = ((acc >> (have - l as u32)) & ((1u64 << l) - 1)) as u32;
            if count[t][l] == 0 {
                continue;
            }
            if v >= first[t][l] && v < first[t][l] + count[t][l] {
                let idx = (v - first[t][l]) as usize;
                if idx < syms[t][l].len() {
                    out.push(syms[t][l][idx]);
                    have -= l as u32;
                    found = true;
                    in_g += 1;
                    if in_g == G {
                        in_g = 0;
                        gi += 1;
                    }
                    break;
                }
            }
        }
        if !found && pos >= buf.len() {
            return Err("ptsz code");
        }
    }
    Ok(out)
}
