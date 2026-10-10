//! 69-symbol Ptaszeński: canonical Huffman, 50-byte groups, MTF selectors.

const N_SYM: usize = 69;
const ESC: usize = 68;
const G: usize = 50;

fn to_sym(b: u8) -> usize {
    if (b as usize) < ESC { b as usize } else { ESC }
}

fn lengths(freq: &[u32; N_SYM]) -> [u8; N_SYM] {
    #[derive(Clone, Copy)]
    struct N { f: u64, i: i16 }
    let mut freq = *freq;
    for _ in 0..8 {
        let mut heap: Vec<N> = Vec::new();
        for (i, &f) in freq.iter().enumerate() {
            if f > 0 { heap.push(N { f: f as u64, i: i as i16 }); }
        }
        let mut len = [0u8; N_SYM];
        if heap.is_empty() { return len; }
        if heap.len() == 1 {
            len[heap[0].i as usize] = 1;
            return len;
        }
        let mut par = vec![-1i16; 512];
        let mut next = N_SYM as i16;
        while heap.len() > 1 {
            heap.sort_by_key(|n| (n.f, n.i));
            let a = heap.remove(0);
            let b = heap.remove(0);
            par[a.i as usize] = next;
            par[b.i as usize] = next;
            heap.push(N { f: a.f + b.f, i: next });
            next += 1;
        }
        let mut maxd = 0u8;
        for i in 0..N_SYM {
            if freq[i] == 0 { continue; }
            let mut d = 0u8;
            let mut x = i as i16;
            while (x as usize) < par.len() && par[x as usize] >= 0 {
                d = d.saturating_add(1);
                x = par[x as usize];
                if d == 32 { break; }
            }
            if d == 0 { d = 1; }
            len[i] = d;
            if d > maxd { maxd = d; }
        }
        if maxd <= 16 { return len; }
        for f in freq.iter_mut() {
            if *f > 1 { *f /= 2; }
        }
    }
    let mut len = [0u8; N_SYM];
    for i in 0..N_SYM { if freq[i] > 0 { len[i] = 8; } }
    len
}

fn canon(len: &[u8; N_SYM]) -> [u32; N_SYM] {
    let mut bl = [0u32; 17];
    for &l in len {
        if l > 0 && l <= 16 { bl[l as usize] += 1; }
    }
    let mut next = [0u32; 17];
    let mut code = 0u32;
    for l in 1..=16 {
        code = (code + bl[l - 1]) << 1;
        next[l] = code;
    }
    let mut c = [0u32; N_SYM];
    for i in 0..N_SYM {
        let l = len[i] as usize;
        if l > 0 && l <= 16 {
            c[i] = next[l];
            next[l] += 1;
        }
    }
    c
}

struct BitW { out: Vec<u8>, acc: u32, n: u32 }
impl BitW {
    fn new() -> Self { Self { out: Vec::new(), acc: 0, n: 0 } }
    fn put(&mut self, bits: u32, k: u32) {
        if k == 0 { return; }
        self.acc = (self.acc << k) | (bits & ((1u32 << k) - 1));
        self.n += k;
        while self.n >= 8 {
            self.n -= 8;
            self.out.push((self.acc >> self.n) as u8);
        }
    }
    fn finish(mut self) -> Vec<u8> {
        if self.n > 0 { self.out.push((self.acc << (8 - self.n)) as u8); }
        self.out
    }
}

struct BitR<'a> { src: &'a [u8], pos: usize, acc: u32, n: u32 }
impl<'a> BitR<'a> {
    fn new(src: &'a [u8]) -> Self { Self { src, pos: 0, acc: 0, n: 0 } }
    fn get(&mut self) -> Option<u8> {
        if self.n == 0 {
            if self.pos >= self.src.len() { return None; }
            self.acc = self.src[self.pos] as u32;
            self.pos += 1;
            self.n = 8;
        }
        self.n -= 1;
        Some(((self.acc >> self.n) & 1) as u8)
    }
}

fn cost(g: &[u8], len: &[u8; N_SYM]) -> u64 {
    g.iter().map(|&b| {
        let l = len[to_sym(b)];
        if l == 0 { 20 } else { l as u64 }
    }).sum()
}

pub fn encode(data: &[u8]) -> Vec<u8> { encode_ntab(data, 3) }

pub fn encode_ntab(data: &[u8], ntab: usize) -> Vec<u8> {
    let ntab = ntab.clamp(2, 6);
    let mut out = Vec::from(*b"H69\0");
    if data.is_empty() {
        out.push(ntab as u8);
        out.extend_from_slice(&0u32.to_le_bytes());
        return out;
    }
    let groups: Vec<&[u8]> = data.chunks(G).collect();
    let ng = groups.len();
    let mut freq = vec![[0u32; N_SYM]; ntab];
    for (i, grp) in groups.iter().enumerate() {
        let t = (i * ntab / ng.max(1)).min(ntab - 1);
        for &b in *grp { freq[t][to_sym(b)] += 1; }
    }
    for row in freq.iter_mut() {
        if row.iter().all(|&x| x == 0) { row[0] = 1; }
    }
    let mut lens: Vec<[u8; N_SYM]> = freq.iter().map(|f| lengths(f)).collect();
    let mut sel = vec![0u8; ng];
    for pass in 0..3 {
        let mut nf = vec![[0u32; N_SYM]; ntab];
        for (gi, grp) in groups.iter().enumerate() {
            let (mut bt, mut bc) = (0usize, u64::MAX);
            for t in 0..ntab {
                let c = cost(grp, &lens[t]);
                if c < bc { bc = c; bt = t; }
            }
            sel[gi] = bt as u8;
            for &b in *grp { nf[bt][to_sym(b)] += 1; }
        }
        for t in 0..ntab {
            if nf[t].iter().all(|&x| x == 0) { nf[t] = freq[t]; }
        }
        freq = nf;
        if pass < 2 { lens = freq.iter().map(|f| lengths(f)).collect(); }
    }
    let mut mtf: Vec<u8> = (0..ntab as u8).collect();
    let mut smtf = Vec::with_capacity(ng);
    for &s in &sel {
        let pos = mtf.iter().position(|&x| x == s).unwrap_or(0);
        smtf.push(pos as u8);
        let v = mtf.remove(pos);
        mtf.insert(0, v);
    }
    let mut esc = Vec::new();
    for &b in data { if (b as usize) >= ESC { esc.push(b); } }
    out.push(ntab as u8);
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    out.extend_from_slice(&(ng as u32).to_le_bytes());
    out.extend_from_slice(&(esc.len() as u32).to_le_bytes());
    out.extend_from_slice(&esc);
    for t in 0..ntab { out.extend_from_slice(&lens[t]); }
    out.extend_from_slice(&smtf);
    let cds: Vec<[u32; N_SYM]> = lens.iter().map(|l| canon(l)).collect();
    let mut bw = BitW::new();
    for (gi, grp) in groups.iter().enumerate() {
        let t = sel[gi] as usize;
        for &b in *grp {
            let s = to_sym(b);
            let l = lens[t][s] as u32;
            if l == 0 { continue; }
            bw.put(cds[t][s], l);
        }
    }
    out.extend_from_slice(&bw.finish());
    out
}

pub fn decode(buf: &[u8]) -> Result<Vec<u8>, &'static str> {
    if buf.len() < 14 || &buf[..4] != b"H69\0" { return Err("h69"); }
    let ntab = buf[4] as usize;
    if !(2..=6).contains(&ntab) { return Err("h69 n"); }
    let n = u32::from_le_bytes(buf[5..9].try_into().unwrap()) as usize;
    if n == 0 { return Ok(Vec::new()); }
    let ng = u32::from_le_bytes(buf[9..13].try_into().unwrap()) as usize;
    let nesc = u32::from_le_bytes(buf[13..17].try_into().unwrap()) as usize;
    let mut pos = 17usize;
    if buf.len() < pos + nesc { return Err("h69 e"); }
    let esc = &buf[pos..pos + nesc];
    pos += nesc;
    let mut lens = vec![[0u8; N_SYM]; ntab];
    for t in 0..ntab {
        if pos + N_SYM > buf.len() { return Err("h69 L"); }
        lens[t].copy_from_slice(&buf[pos..pos + N_SYM]);
        pos += N_SYM;
    }
    if pos + ng > buf.len() { return Err("h69 s"); }
    let smtf = &buf[pos..pos + ng];
    pos += ng;
    let mut mtf: Vec<u8> = (0..ntab as u8).collect();
    let mut sel = vec![0u8; ng];
    for i in 0..ng {
        let p = smtf[i] as usize;
        if p >= mtf.len() { return Err("h69 m"); }
        let v = mtf.remove(p);
        mtf.insert(0, v);
        sel[i] = v;
    }
    let cds: Vec<[u32; N_SYM]> = lens.iter().map(|l| canon(l)).collect();
    let mut br = BitR::new(&buf[pos..]);
    let mut out = Vec::with_capacity(n);
    let mut ei = 0usize;
    for gi in 0..ng {
        let t = sel[gi] as usize;
        let glen = if gi + 1 == ng { n - gi * G } else { G };
        for _ in 0..glen {
            let mut code = 0u32;
            let mut k = 0u8;
            let mut found = None;
            while k < 16 {
                let bit = br.get().ok_or("h69 eof")?;
                code = (code << 1) | bit as u32;
                k += 1;
                for s in 0..N_SYM {
                    if lens[t][s] == k && cds[t][s] == code {
                        found = Some(s);
                        break;
                    }
                }
                if found.is_some() { break; }
            }
            let s = found.ok_or("h69 code")?;
            let b = if s == ESC {
                if ei >= esc.len() { return Err("h69 e2"); }
                let x = esc[ei]; ei += 1; x
            } else { s as u8 };
            out.push(b);
        }
    }
    if out.len() != n { return Err("h69 n"); }
    Ok(out)
}
