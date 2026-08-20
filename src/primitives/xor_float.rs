//! XOR consecutive IEEE-754 floats (little-endian).

pub fn compress_xor_float(data: &[u8]) -> Vec<u8> {
    if data.len() < 4 { return data.to_vec(); }
    let mut out = Vec::with_capacity(data.len());
    out.extend_from_slice(&data[0..4]);
    let mut prev = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    let mut i = 4;
    while i + 3 < data.len() {
        let cur = u32::from_le_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]);
        out.extend_from_slice(&(cur ^ prev).to_le_bytes());
        prev = cur;
        i += 4;
    }
    while i < data.len() { out.push(data[i]); i += 1; }
    out
}

pub fn decompress_xor_float(data: &[u8]) -> Vec<u8> {
    if data.len() < 4 { return data.to_vec(); }
    let mut out = Vec::with_capacity(data.len());
    out.extend_from_slice(&data[0..4]);
    let mut prev = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    let mut i = 4;
    while i + 3 < data.len() {
        let xored = u32::from_le_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]);
        let cur = xored ^ prev;
        out.extend_from_slice(&cur.to_le_bytes());
        prev = cur;
        i += 4;
    }
    while i < data.len() { out.push(data[i]); i += 1; }
    out
}
