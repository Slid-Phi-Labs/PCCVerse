//! x86 BCJ — relative CALL/JMP (E8/E9) → absolute address conversion.
//!
//! Faithful Rust port of liblzma's `simple/x86.c` `x86_code`, used in
//! one-shot mode (`now_pos = 0`, fresh state per call) — exactly what
//! `lzma_bcj_x86_encode` / `lzma_bcj_x86_decode` do.
//!
//! The subtle point a naive port misses: the encoder does NOT store the
//! converted address's true top byte. It stores `0x00` or `0xFF` encoding
//! the *parity* (low bit) of the top byte:
//!
//! ```text
//! stored_top = ~(((dest >> 24) & 1) - 1)   // 0x00 if bit clear, 0xFF if set
//! ```
//!
//! The decoder's MSByte test (`0x00`/`0xFF`) must succeed on *every*
//! converted instruction for encoder and decoder to stay in sync. Writing
//! the true top byte breaks that: the decoder skips the instruction, the
//! mask state desyncs, and the stream corrupts from that point on.
//!
//! The parity trick is also what makes the filter a perfect involution:
//! the stored parity bit exactly compensates the `+P`/`-P` borrow, so the
//! decoder's written bytes match the original even though it never sees
//! the true top byte. Hence `decode(encode(x)) == x` for all `x`.

#[inline]
fn test_msbyte(b: u8) -> bool {
    b == 0x00 || b == 0xFF
}

const MASK_TO_BIT_NUMBER: [u32; 5] = [0, 1, 2, 2, 3];

fn convert(data: &[u8], encode: bool) -> Vec<u8> {
    let mut buf = data.to_vec();
    let size = buf.len();
    if size < 5 {
        return buf;
    }
    // One-shot: now_pos = 0, fresh filter state.
    let now_pos: u32 = 0;
    let mut prev_mask: u32 = 0;
    let mut prev_pos: u32 = 0u32.wrapping_sub(5);
    // liblzma: if (now_pos - prev_pos > 5) prev_pos = now_pos - 5;
    // With the values above now_pos - prev_pos == 5, so this is a no-op,
    // kept to mirror the reference.
    if now_pos.wrapping_sub(prev_pos) > 5 {
        prev_pos = now_pos.wrapping_sub(5);
    }

    let limit = size - 5;
    let mut buffer_pos: usize = 0;
    while buffer_pos <= limit {
        let b = buf[buffer_pos];
        if b != 0xE8 && b != 0xE9 {
            buffer_pos += 1;
            continue;
        }
        let offset = now_pos
            .wrapping_add(buffer_pos as u32)
            .wrapping_sub(prev_pos);
        prev_pos = now_pos.wrapping_add(buffer_pos as u32);
        if offset > 5 {
            prev_mask = 0;
        } else {
            for _ in 0..offset {
                prev_mask &= 0x77;
                prev_mask <<= 1;
            }
        }
        let b = buf[buffer_pos + 4];
        if test_msbyte(b) && (prev_mask >> 1) <= 4 && (prev_mask >> 1) != 3 {
            let mut src = ((b as u32) << 24)
                | ((buf[buffer_pos + 3] as u32) << 16)
                | ((buf[buffer_pos + 2] as u32) << 8)
                | (buf[buffer_pos + 1] as u32);
            let dest: u32 = loop {
                let d = if encode {
                    src.wrapping_add(
                        now_pos
                            .wrapping_add(buffer_pos as u32)
                            .wrapping_add(5),
                    )
                } else {
                    src.wrapping_sub(
                        now_pos
                            .wrapping_add(buffer_pos as u32)
                            .wrapping_add(5),
                    )
                };
                if prev_mask == 0 {
                    break d;
                }
                let i = MASK_TO_BIT_NUMBER[(prev_mask >> 1) as usize];
                let bb = (d >> (24 - i * 8)) as u8;
                if !test_msbyte(bb) {
                    break d;
                }
                // (1 << (32 - i*8)) - 1; written via u32::MAX to avoid the
                // C shift-by-32 UB when i == 0 (means 0xFFFF_FFFF).
                src = d ^ (u32::MAX >> (i * 8));
            };
            // Store the low three bytes plus the parity-compressed top byte
            // (0x00/0xFF) — NOT the true top byte of dest.
            buf[buffer_pos + 4] = (!(((dest >> 24) & 1).wrapping_sub(1))) as u8;
            buf[buffer_pos + 3] = (dest >> 16) as u8;
            buf[buffer_pos + 2] = (dest >> 8) as u8;
            buf[buffer_pos + 1] = dest as u8;
            buffer_pos += 5;
            prev_mask = 0;
        } else {
            buffer_pos += 1;
            prev_mask |= 1;
            if test_msbyte(b) {
                prev_mask |= 0x10;
            }
        }
    }
    buf
}

pub fn encode(data: &[u8]) -> Vec<u8> {
    convert(data, true)
}

pub fn decode(data: &[u8]) -> Vec<u8> {
    convert(data, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_on_text() {
        let s = b"the quick brown fox jumps over the lazy dog\n".repeat(20);
        let e = encode(&s);
        assert_eq!(decode(&e), s);
    }

    #[test]
    fn call_rel32_roundtrip() {
        // e8 + rel32 that looks like a near call (MSByte 0xFF)
        let mut s = vec![0x90u8; 32];
        s[8] = 0xE8;
        s[9..13].copy_from_slice(&(-16i32).to_le_bytes());
        let e = encode(&s);
        assert_eq!(decode(&e), s);
        // filter should have rewritten the displacement
        assert_ne!(&e[9..13], &s[9..13]);
    }

    #[test]
    fn regression_ooffice_desync() {
        // Minimal form of the ooffice block-1 failure: E8 at position 0
        // with src = 0x00FFFFFF. dest = src + 5 = 0x01000004, whose true
        // top byte (0x01) fails the decoder's MSByte test. The old port
        // wrote the true top byte and desynced here; the faithful port
        // stores the parity-compressed top byte and roundtrips.
        let mut s = vec![0u8; 64];
        s[0] = 0xE8;
        s[1..5].copy_from_slice(&0x00FF_FFFFu32.to_le_bytes());
        let e = encode(&s);
        assert_eq!(decode(&e), s);
        // The stored top byte must be 0x00/0xFF (parity), never 0x01.
        assert!(e[4] == 0x00 || e[4] == 0xFF);
    }

    #[test]
    fn roundtrip_overlapping_e8() {
        // E8 opcodes within 3 bytes of each other exercise the prev_mask
        // overlap logic on both encode and decode.
        let mut s = vec![0x90u8; 128];
        for pos in [10usize, 12, 20, 23, 40, 41, 42, 80] {
            s[pos] = 0xE8;
            s[pos + 1..pos + 5].copy_from_slice(&(-8i32).to_le_bytes());
        }
        let e = encode(&s);
        assert_eq!(decode(&e), s);
    }

    #[test]
    fn roundtrip_pseudo_random() {
        // Deterministic xorshift stream with frequent E8/E9 bytes, so the
        // filter actually converts throughout the buffer.
        let mut x: u64 = 0x1234_5678_9ABC_DEF1;
        let mut s = vec![0u8; 4096];
        for b in s.iter_mut() {
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            *b = (x & 0xFF) as u8;
            if x % 7 == 0 {
                *b = 0xE8;
            }
        }
        let e = encode(&s);
        assert_eq!(decode(&e), s);
    }
}
