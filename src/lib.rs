pub mod analyzer;
pub mod frame;
pub mod nca;
pub mod primitives;
pub mod program_bank;
pub mod theoretical_engine;
pub mod theory_bank;
pub mod vm;
pub mod bench;

pub use analyzer::{Analysis, Analyzer, DataType};
pub use frame::{AwareFrame, AwareResult, TrainReport};
pub use program_bank::ProgramBank;
pub use theoretical_engine::{GapReport, SelfTestReport, TheoreticalEngine};
pub use theory_bank::{SourceClass, TheoryBank, TheoryVersion};
pub use vm::{Op, Program};
