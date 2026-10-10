//! TheoryBank — versioned theoretical knowledge for compression.
//! Public-surface theory only (Shannon residual bounds, source-class priors,
//! optimality conditions for TRU8 / Blackjack / residual pathways).
//! Private residual-attack coefficients stay outside this surface.

use crate::analyzer::DataType;
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct TheoryVersion {
    pub year: u16,
    pub month: u8,
}

impl TheoryVersion {
    pub fn current() -> Self {
        Self { year: 2026, month: 8 }
    }
    pub fn to_string(&self) -> String {
        format!("{}.{}", self.year, self.month)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum SourceClass {
    PureZero,
    NearZero,
    GeometricResidual,
    SequentialInteger,
    HotTrigram,
    StructuredText,
    FloatTimeSeries,
    Code,
    Json,
    Binary,
    Random,
    General,
}

#[derive(Clone, Debug)]
pub struct SourceModel {
    pub class: SourceClass,
    pub expected_residual_rate: f64, // fraction of original size expected after optimal pathway
    pub notes: String,
}

#[derive(Clone, Debug)]
pub struct TheoryBank {
    pub version: TheoryVersion,
    pub models: HashMap<SourceClass, SourceModel>,
    pub pathway_priors: HashMap<String, f64>, // pathway name -> expected residual fraction
}

impl TheoryBank {
    pub fn default_2026_08() -> Self {
        let mut models = HashMap::new();
        models.insert(SourceClass::PureZero, SourceModel {
            class: SourceClass::PureZero,
            expected_residual_rate: 0.0001, // near fixed token cost
            notes: "T_ZERO fixed-cost pathway. Kolmogorov-cheap for pure dormant runs.".into(),
        });
        models.insert(SourceClass::NearZero, SourceModel {
            class: SourceClass::NearZero,
            expected_residual_rate: 0.02,
            notes: "Sparse noise on zero runs; still prefer T_ZERO + residual ANS.".into(),
        });
        models.insert(SourceClass::GeometricResidual, SourceModel {
            class: SourceClass::GeometricResidual,
            expected_residual_rate: 0.15,
            notes: "Rice / geometric coding after prediction is near-optimal.".into(),
        });
        models.insert(SourceClass::SequentialInteger, SourceModel {
            class: SourceClass::SequentialInteger,
            expected_residual_rate: 0.08,
            notes: "\u0394 / \u0394\u00b2 + Rice or Fib/Zeckendorf residual.".into(),
        });
        models.insert(SourceClass::HotTrigram, SourceModel {
            class: SourceClass::HotTrigram,
            expected_residual_rate: 0.35,
            notes: "T_TRISUM packing for hot short sequences.".into(),
        });
        models.insert(SourceClass::StructuredText, SourceModel {
            class: SourceClass::StructuredText,
            expected_residual_rate: 0.25,
            notes: "Dict + LZ + ANS or Neural residual.".into(),
        });
        models.insert(SourceClass::FloatTimeSeries, SourceModel {
            class: SourceClass::FloatTimeSeries,
            expected_residual_rate: 0.30,
            notes: "XorFloat + residual entropy coding.".into(),
        });
        models.insert(SourceClass::Code, SourceModel {
            class: SourceClass::Code,
            expected_residual_rate: 0.20,
            notes: "High repetition; DictTrain + LZ_OPT + ANS.".into(),
        });
        models.insert(SourceClass::Json, SourceModel {
            class: SourceClass::Json,
            expected_residual_rate: 0.18,
            notes: "Key/value templates; Dict + residual.".into(),
        });
        models.insert(SourceClass::Binary, SourceModel {
            class: SourceClass::Binary,
            expected_residual_rate: 0.70,
            notes: "General binary; LZ + ANS fallback.".into(),
        });
        models.insert(SourceClass::Random, SourceModel {
            class: SourceClass::Random,
            expected_residual_rate: 0.99,
            notes: "Incompressible; Store or light ANS only.".into(),
        });
        models.insert(SourceClass::General, SourceModel {
            class: SourceClass::General,
            expected_residual_rate: 0.50,
            notes: "Default mixed; Analyzer decides.".into(),
        });

        let mut pathway_priors = HashMap::new();
        pathway_priors.insert("T_ZERO".into(), 0.0001);
        pathway_priors.insert("T_TRISUM".into(), 0.35);
        pathway_priors.insert("T_DICT".into(), 0.05);
        pathway_priors.insert("BJ_DELTA2".into(), 0.10);
        pathway_priors.insert("BJ_RICE".into(), 0.15);
        pathway_priors.insert("DELTA+LZ+ANS".into(), 0.22);
        pathway_priors.insert("NEURAL+ANS".into(), 0.18);
        pathway_priors.insert("LZ_OPT+ANS".into(), 0.28);
        pathway_priors.insert("STORE".into(), 1.0);

        Self {
            version: TheoryVersion::current(),
            models,
            pathway_priors,
        }
    }

    pub fn classify(&self, data: &[u8], data_type: &DataType) -> SourceClass {
        if data.is_empty() { return SourceClass::General; }
        let zero_count = data.iter().filter(|&&b| b == 0).count();
        let zero_ratio = zero_count as f64 / data.len() as f64;
        if zero_ratio > 0.98 { return SourceClass::PureZero; }
        if zero_ratio > 0.85 { return SourceClass::NearZero; }
        match data_type {
            DataType::Float => SourceClass::FloatTimeSeries,
            DataType::Code => SourceClass::Code,
            DataType::Json => SourceClass::Json,
            DataType::Text => SourceClass::StructuredText,
            DataType::Random => SourceClass::Random,
            _ => {
                // Heuristic for sequential / geometric
                if data.len() >= 8 && data.len() % 4 == 0 {
                    // rough check for sequential integers
                    SourceClass::SequentialInteger
                } else {
                    SourceClass::General
                }
            }
        }
    }

    pub fn expected_bound(&self, class: &SourceClass, original_len: usize) -> f64 {
        let rate = self.models.get(class).map(|m| m.expected_residual_rate).unwrap_or(0.5);
        (original_len as f64 * rate).max(8.0) // at least token overhead
    }
}
