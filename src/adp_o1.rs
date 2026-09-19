//! Adaptive 4-ctx, 67-ary range coder (low/high). Winner at 78230 isolated.

const N_CTX: usize = 4;
const N_SYM: usize = 67;
const ESC: usize = 66;

fn ctx(prev: u8) -> usize {
    match prev {
        0 => 0,
        1 => 1,
        2 | 3 => 2,
        _ => 3,
    }
}

struct RangeEnc { low: u32, high: u32, out: Vec<u8> }
impl RangeEnc {
    fn new() -> Self { Self { low: 0, high: 0xffff_ffff, out: Vec::new() } }
    fn encode(&mut self, cum: u32, freq: u32, tot: u32) {
        let span = self.high.wrapping_sub(self.low) as u64 + 1;
        let lo = self.low as u64 + span * cum as u64 / tot as u64;
        let hi = self.low as u64 + span * (cum + freq) as u64 / tot as u64 - 1;
        self.low = lo as u32;
        self.high = hi as u32;
        while (self.low ^ self.high) < 0x0100_0000 {
            self.out.push((self.low >> 24) as u8);
            self.low <<= 8;
            self.high = (self.high << 8) | 0xff;
        }
    }
    fn finish(mut self) -> Vec<u8> {
        for _ in 0..4 {
            self.out.push((self.low >> 24) as u8);
            self.low <<= 8;
        }
        self.out
    }
}

struct RangeDec<'a> { low: u32, high: u32, code: u32, src: &'a [u8], pos: usize }
impl<'a> RangeDec<'a> {
    fn new(src: &'a [u8]) -> Result<Self, &'static str> {
        if src.len() < 4 { return Err("ad01 short"); }
        let mut code = 0u32; let mut pos = 0;
        for _ in 0..4 { code = (code << 8) | src[pos] as u32; pos += 1; }
        Ok(Self { low: 0, high: 0xffff_ffff, code, src, pos })
    }
    fn get(&mut self) -> u32 {
        let b = *self.src.get(self.pos).unwrap_or(&0) as u32; self.pos += 1; b
    }
    fn decode_sym(&mut self, cnt: &[u16; N_SYM], tot: u32) -> usize {
        let span = self.high.wrapping_sub(self.low) as u64 + 1;
        let target = (((self.code.wrapping_sub(self.low) as u64 + 1) * tot as u64 - 1) / span) as u32;
        let mut acc = 0u32; let mut sym = N_SYM - 1;
        for i in 0..N_SYM {
            let f = cnt[i] as u32;
            if acc + f > target { sym = i; break; }
            acc += f;
        }
        let f = cnt[sym] as u32;
        let lo = self.low as u64 + span * acc as u64 / tot as u64;
        let hi = self.low as u64 + span * (acc + f) as u64 / tot as u64 - 1;
        self.low = lo as u32; self.high = hi as u32;
        while (self.low ^ self.high) < 0x0100_0000 {
            self.low <<= 8; self.high = (self.high << 8) | 0xff;
            self.code = (self.code << 8) | self.get();
        }
        sym
    }
}

fn bump(cnt: &mut [u16; N_SYM], tot: &mut u32, sym: usize) {
    cnt[sym] = cnt[sym].saturating_add(2);
    *tot += 2;
    if *tot > 8192 {
        let mut n = 0u32;
        for c in cnt.iter_mut() { *c = (*c / 2).max(1); n += *c as u32; }
        *tot = n;
    }
}

pub fn encode(data: &[u8]) -> Vec<u8> {
    let mut cnt = [[1u16; N_SYM]; N_CTX];
    let mut tot = [N_SYM as u32; N_CTX];
    let mut enc = RangeEnc::new();
    let mut prev = 0u8;
    let mut esc = Vec::new();
    for &b in data {
        let c = ctx(prev);
        let sym = if (b as usize) < ESC { b as usize } else { ESC };
        if sym == ESC { esc.push(b); }
        let mut cum = 0u32;
        for i in 0..sym { cum += cnt[c][i] as u32; }
        enc.encode(cum, cnt[c][sym] as u32, tot[c]);
        bump(&mut cnt[c], &mut tot[c], sym);
        prev = b;
    }
    let body = enc.finish();
    let mut out = Vec::from(*b"AD01");
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    out.extend_from_slice(&(esc.len() as u32).to_le_bytes());
    out.extend_from_slice(&esc);
    out.extend_from_slice(&body);
    out
}

pub fn decode(buf: &[u8]) -> Result<Vec<u8>, &'static str> {
    if buf.len() < 12 || &buf[..4] != b"AD01" { return Err("ad01"); }
    let n = u32::from_le_bytes(buf[4..8].try_into().unwrap()) as usize;
    let nesc = u32::from_le_bytes(buf[8..12].try_into().unwrap()) as usize;
    if buf.len() < 12 + nesc { return Err("ad01 esc"); }
    let esc = &buf[12..12 + nesc];
    let mut dec = RangeDec::new(&buf[12 + nesc..])?;
    let mut cnt = [[1u16; N_SYM]; N_CTX];
    let mut tot = [N_SYM as u32; N_CTX];
    let mut prev = 0u8;
    let mut ei = 0usize;
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        let c = ctx(prev);
        let sym = dec.decode_sym(&cnt[c], tot[c]);
        bump(&mut cnt[c], &mut tot[c], sym);
        let b = if sym == ESC {
            if ei >= esc.len() { return Err("ad01 e"); }
            let x = esc[ei]; ei += 1; x
        } else { sym as u8 };
        out.push(b);
        prev = b;
    }
    Ok(out)
}
