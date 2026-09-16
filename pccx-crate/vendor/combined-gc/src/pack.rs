//! pack.rs 1.18.3 — cap at 2M, measured 4M vs 2M = -3,086 not significant
//! 900K -> 2,891,109, 2M -> 2,765,585 -125K -4.3%, 4M -> 2,762,499 -3K
//! Default on cold LAST_SA_MS=0 previously picked 8M -> SA(S||S) 16MB hang

pub fn pack_size(file_len: u64) -> usize {
    if file_len < 100_000 { 64_000 }
    else if file_len < 500_000 { 256_000 }
    else if file_len <= 900_000 { 900_000 }
    else { 2_000_000 } // cap, do not grow to 4M/8M, -0.11% not significant
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_pack_10M_is_2M() { assert_eq!(pack_size(10_192_446), 2_000_000); }
    #[test]
    fn test_pack_900K_is_900K() { assert_eq!(pack_size(900_000), 900_000); }
    #[test]
    fn test_pack_cold_not_8M() {
        for len in [100u64, 1_000, 10_000, 100_000, 500_000, 900_000, 2_000_000, 10_000_000, 100_000_000] {
            let ps = pack_size(len);
            assert!(ps <= 2_000_000);
            assert_ne!(ps, 8_000_000);
        }
    }
}
