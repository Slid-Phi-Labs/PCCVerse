//! Data analysis for Aware Frame: entropy + type heuristics.
//! Guides program selection and NCA starting points.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DataType {
    Text,
    Json,
    Float,
    Code,
    Binary,
    Random,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct Analysis {
    pub guessed_type: DataType,
    pub entropy: f64,
    pub zero_ratio: f64,
    pub ascii_ratio: f64,
}

impl Analysis {
    pub fn is_compressible(&self) -> bool {
        self.entropy < 7.5 || self.zero_ratio > 0.3 || matches!(self.guessed_type, DataType::Text | DataType::Json | DataType::Float | DataType::Code)
    }
}

pub struct Analyzer;
impl Analyzer {
    pub fn analyze(data: &[u8]) -> Analysis {
        if data.is_empty() {
            return Analysis { guessed_type: DataType::Unknown, entropy: 0.0, zero_ratio: 0.0, ascii_ratio: 0.0 };
        }
        let mut freq = [0u64; 256];
        let mut zeros = 0u64;
        let mut ascii = 0u64;
        for &b in data {
            freq[b as usize] += 1;
            if b == 0 { zeros += 1; }
            if b >= 32 && b < 127 { ascii += 1; }
        }
        let n = data.len() as f64;
        let mut entropy = 0.0;
        for &c in &freq {
            if c > 0 {
                let p = c as f64 / n;
                entropy -= p * p.log2();
            }
        }
        let zero_ratio = zeros as f64 / n;
        let ascii_ratio = ascii as f64 / n;

        let guessed_type = if zero_ratio > 0.5 { DataType::Binary }
        else if ascii_ratio > 0.85 {
            if data.windows(2).any(|w| w == b"{\"" || w == b": ") { DataType::Json }
            else if data.windows(3).any(|w| w == b"fn " || w == b"let" || w == b"-> ") { DataType::Code }
            else { DataType::Text }
        } else if data.len() % 4 == 0 && entropy > 4.0 && entropy < 7.0 { DataType::Float }
        else if entropy > 7.8 { DataType::Random }
        else { DataType::Binary };

        Analysis { guessed_type, entropy, zero_ratio, ascii_ratio }
    }
}
