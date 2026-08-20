//! Order-N delta encoding. Excellent for slowly changing sequences
//! (timestamps, counters, sensor data, sorted IDs).

pub fn compress_delta(data: &[u8], order: u8) -> Vec<u8> {
    if data.is_empty() || order == 0 {
        return data.to_vec();
    }
    let order = order as usize;
    let mut out = Vec::with_capacity(data.len());
    // Store first `order` bytes raw
    out.extend_from_slice(&data[..order.min(data.len())]);
    for i in order..data.len() {
        let prev = data[i - order];
        out.push(data[i].wrapping_sub(prev));
    }
    out
}

pub fn decompress_delta(data: &[u8], order: u8) -> Vec<u8> {
    if data.is_empty() || order == 0 {
        return data.to_vec();
    }
    let order = order as usize;
    let mut out = Vec::with_capacity(data.len());
    out.extend_from_slice(&data[..order.min(data.len())]);
    for i in order..data.len() {
        let prev = out[i - order];
        out.push(data[i].wrapping_add(prev));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_order1() {
        let data = b"ABCDEFGHIJKLMNOP";
        let c = compress_delta(data, 1);
        let d = decompress_delta(&c, 1);
        assert_eq!(data.as_slice(), d.as_slice());
    }

    #[test]
    fn roundtrip_order2() {
        let data: Vec<u8> = (0..100).map(|i| (i * 3) as u8).collect();
        let c = compress_delta(&data, 2);
        let d = decompress_delta(&c, 2);
        assert_eq!(data, d);
    }
}
