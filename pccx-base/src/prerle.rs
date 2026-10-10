//! Reversible run-length before BWT (bzip2-like: runs of 4+).

pub fn encode(input: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(input.len() + 8);
    out.extend_from_slice(&(input.len() as u32).to_le_bytes());
    let mut i = 0;
    while i < input.len() {
        let b = input[i];
        let mut run = 1usize;
        while i + run < input.len() && input[i + run] == b && run < 255 {
            run += 1;
        }
        if run >= 4 {
            out.extend_from_slice(&[0xFF, b, run as u8]);
        } else {
            for _ in 0..run {
                if b == 0xFF {
                    out.extend_from_slice(&[0xFF, 0xFF, 1]);
                } else {
                    out.push(b);
                }
            }
        }
        i += run;
    }
    out
}

pub fn decode(buf: &[u8]) -> Result<Vec<u8>, &'static str> {
    if buf.len() < 4 {
        return Err("rle");
    }
    let n = u32::from_le_bytes(buf[0..4].try_into().unwrap()) as usize;
    let mut out = Vec::with_capacity(n);
    let mut i = 4usize;
    while out.len() < n {
        if i >= buf.len() {
            return Err("rle eof");
        }
        if buf[i] == 0xFF {
            if i + 2 >= buf.len() {
                return Err("rle ff");
            }
            let b = buf[i + 1];
            let run = buf[i + 2] as usize;
            if run == 0 {
                return Err("rle 0");
            }
            out.extend(std::iter::repeat(b).take(run));
            i += 3;
        } else {
            out.push(buf[i]);
            i += 1;
        }
    }
    if out.len() != n {
        return Err("rle n");
    }
    Ok(out)
}
