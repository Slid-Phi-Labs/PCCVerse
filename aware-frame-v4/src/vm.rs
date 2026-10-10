//! Virtual machine for Aware Frame compression programs.
//! A Program is a sequence of Ops that transform data into a residual.
//! Fitness = program size + residual size (Kolmogorov-inspired).

#[derive(Clone, Debug)]
pub enum Op {
    Store,
    Delta { order: u8 },
    XorFloat,
    Rle,
    Lz { window: usize },
    Dict { dict_id: u8 },
    Ans { table_id: u8 },
    CdcDedup,
    DictTrain,
    Neural,
    // Specialty mathways
    Tru8Zero,
    Tru8TriSum,
    Tru8Dict,
    BlackjackDelta2,
    BlackjackRice,
}

#[derive(Clone, Debug)]
pub struct Program {
    pub ops: Vec<Op>,
    pub dict: Vec<Vec<u8>>,
}

impl Program {
    pub fn describe(&self) -> String {
        self.ops
            .iter()
            .map(|op| match op {
                Op::Store => "STORE",
                Op::Delta { order } => if *order == 1 { "DELTA" } else { "DELTA2" },
                Op::XorFloat => "XOR_F",
                Op::Rle => "RLE",
                Op::Lz { .. } => "LZ_OPT",
                Op::Dict { .. } => "DICT",
                Op::Ans { .. } => "ANS",
                Op::CdcDedup => "CDC_DEDUP",
                Op::DictTrain => "DICT_TRAIN",
                Op::Neural => "NEURAL",
                Op::Tru8Zero => "T_ZERO",
                Op::Tru8TriSum => "T_TRISUM",
                Op::Tru8Dict => "T_DICT",
                Op::BlackjackDelta2 => "BJ_DELTA2",
                Op::BlackjackRice => "BJ_RICE",
            })
            .collect::<Vec<_>>()
            .join(" + ")
    }

    pub fn execute(&self, residual: &[u8], original_len: usize) -> Vec<u8> {
        crate::primitives::decompress_with_program(&self.ops, residual, original_len, &self.dict)
    }

    pub fn size(&self) -> usize {
        self.ops.len() * 2 + self.dict.iter().map(|d| d.len()).sum::<usize>()
    }
}
