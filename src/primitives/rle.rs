//! Simple run-length encoding with escape.

pub fn compress_rle(data: &[u8]) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut out = Vec::with_capacity(data.len());
    let mut i = 0;
    while i < data.len() {
        let b = data[i];
        let mut run = 1usize;
        while i + run < data.len() && data[i + run] == b && run < 255 { run += 1; }
        if run >= 4 {
            out.push(0xFE); out.push(b); out.push(run as u8); i += run;
        } else {
            if b == 0xFE { out.push(0xFE); out.push(0x00); } else { out.push(b); }
            i += 1;
        }
    }
    out
}

pub fn decompress_rle(data: &[u8], original_len: usize) -> Vec<u8> {
    let mut out = Vec::with_capacity(original_len);
    let mut i = 0;
    while i < data.len() && out.len() < original_len {
        if data[i] == 0xFE && i + 1 < data.len() {
            if data[i + 1] == 0x00 { out.push(0xFE); i += 2; }
            else if i + 2 < data.len() {
                let b = data[i + 1]; let run = data[i + 2] as usize;
                for _ in 0..run { if out.len() >= original_len { break; } out.push(b); }
                i += 3;
            } else { out.push(data[i]); i += 1; }
        } else { out.push(data[i]); i += 1; }
    }
    out.truncate(original_len); out
}
