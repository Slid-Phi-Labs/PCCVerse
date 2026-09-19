//! Adaptive order-2 range coder for MTF-RLE0.

pub fn encode(data: &[u8]) -> Vec<u8> {
    let mut cnt = vec![1u16; 256 * 256];
    let mut tot = [256u32; 256];
    let mut out = Vec::from(*b"O2R0");
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    let mut low = 0u64;
    let mut rng = 0xffff_ffffu64;
    let mut prev = 0u8;
    for &s in data {
        let base = prev as usize * 256;
        let mut c0 = 0u32;
        for i in 0..s as usize {
            c0 += cnt[base + i] as u32;
        }
        let cs = cnt[base + s as usize] as u32;
        let t = tot[prev as usize] as u64;
        low += rng * c0 as u64 / t;
        rng = rng * cs as u64 / t;
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
        cnt[base + s as usize] = cnt[base + s as usize].saturating_add(2);
        tot[prev as usize] = tot[prev as usize].saturating_add(2);
        if tot[prev as usize] > 16_000 {
            let mut nt = 0u32;
            for i in 0..256 {
                cnt[base + i] = (cnt[base + i] / 2).max(1);
                nt += cnt[base + i] as u32;
            }
            tot[prev as usize] = nt;
        }
        prev = s;
    }
    for _ in 0..4 {
        out.push((low >> 24) as u8);
        low <<= 8;
    }
    out
}

pub fn decode(buf: &[u8]) -> Result<Vec<u8>, &'static str> {
    if buf.len() < 8 || &buf[..4] != b"O2R0" {
        return Err("o2");
    }
    let n = u32::from_le_bytes(buf[4..8].try_into().unwrap()) as usize;
    let mut pos = 8usize;
    let mut cnt = vec![1u16; 256 * 256];
    let mut tot = [256u32; 256];
    let mut code = 0u64;
    for _ in 0..4 {
        code = (code << 8) | *buf.get(pos).unwrap_or(&0) as u64;
        pos += 1;
    }
    let mut low = 0u64;
    let mut rng = 0xffff_ffffu64;
    let mut prev = 0u8;
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        if rng == 0 {
            rng = 1;
        }
        let t = tot[prev as usize] as u64;
        let target = ((code.saturating_sub(low) + 1) * t - 1) / rng;
        let base = prev as usize * 256;
        let mut acc = 0u32;
        let mut s = 255u8;
        for i in 0..256 {
            let c = cnt[base + i] as u32;
            if acc as u64 + c as u64 > target {
                s = i as u8;
                break;
            }
            acc += c;
        }
        let c0 = {
            let mut x = 0u32;
            for i in 0..s as usize {
                x += cnt[base + i] as u32;
            }
            x
        };
        let cs = cnt[base + s as usize] as u32;
        low += rng * c0 as u64 / t;
        rng = rng * cs as u64 / t;
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
        cnt[base + s as usize] = cnt[base + s as usize].saturating_add(2);
        tot[prev as usize] = tot[prev as usize].saturating_add(2);
        if tot[prev as usize] > 16_000 {
            let mut nt = 0u32;
            for i in 0..256 {
                cnt[base + i] = (cnt[base + i] / 2).max(1);
                nt += cnt[base + i] as u32;
            }
            tot[prev as usize] = nt;
        }
        out.push(s);
        prev = s;
    }
    Ok(out)
}
