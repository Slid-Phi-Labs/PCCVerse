//! Neural Cellular Automata for program evolution.
//! Evolves a population of Programs toward lower description length
//! (program size + residual size).

use crate::analyzer::{Analysis, Analyzer};
use crate::primitives::apply_compression_pipeline;
use crate::vm::{Op, Program};
use rand::Rng;

pub struct NcaConfig {
    pub population: usize,
    pub generations: usize,
    pub mutation_rate: f64,
}

impl Default for NcaConfig {
    fn default() -> Self {
        Self {
            population: 24,
            generations: 12,
            mutation_rate: 0.25,
        }
    }
}

pub struct Nca {
    pub config: NcaConfig,
}

impl Nca {
    pub fn new(config: NcaConfig) -> Self {
        Self { config }
    }

    fn random_program(rng: &mut impl Rng, analysis: &Analysis) -> Program {
        let mut ops = Vec::new();
        // Prefer transforms matching data type
        match analysis.guessed_type {
            crate::analyzer::DataType::Float => {
                ops.push(Op::XorFloat);
                ops.push(Op::Ans { table_id: 0 });
            }
            crate::analyzer::DataType::Json | crate::analyzer::DataType::Text => {
                if rng.gen_bool(0.6) {
                    ops.push(Op::DictTrain);
                }
                ops.push(Op::Lz { window: 131072 });
                ops.push(Op::Ans { table_id: 0 });
            }
            crate::analyzer::DataType::Code => {
                ops.push(Op::Lz { window: 131072 });
                ops.push(Op::Ans { table_id: 0 });
            }
            _ if analysis.zero_ratio > 0.7 => {
                ops.push(Op::Rle);
            }
            _ if analysis.entropy < 5.0 => {
                ops.push(Op::Delta { order: if rng.gen_bool(0.5) { 1 } else { 2 } });
                ops.push(Op::Ans { table_id: 0 });
            }
            _ => {
                ops.push(Op::Lz { window: 65536 });
                ops.push(Op::Ans { table_id: 0 });
            }
        }
        Program { ops, dict: vec![] }
    }

    fn fitness(program: &Program, data: &[u8]) -> f64 {
        let residual = apply_compression_pipeline(&program.ops, data);
        (program.size() + residual.len()) as f64
    }

    fn mutate(program: &Program, rng: &mut impl Rng, rate: f64) -> Program {
        let mut ops = program.ops.clone();
        if ops.is_empty() {
            return program.clone();
        }
        if rng.gen_bool(rate) {
            // swap or replace one op
            let idx = rng.gen_range(0..ops.len());
            let candidates = [
                Op::Delta { order: 1 },
                Op::Delta { order: 2 },
                Op::XorFloat,
                Op::Rle,
                Op::Lz { window: 65536 },
                Op::Lz { window: 131072 },
                Op::Ans { table_id: 0 },
                Op::DictTrain,
                Op::Neural,
            ];
            ops[idx] = candidates[rng.gen_range(0..candidates.len())].clone();
        }
        if rng.gen_bool(rate * 0.5) && ops.len() > 1 {
            let i = rng.gen_range(0..ops.len() - 1);
            ops.swap(i, i + 1);
        }
        Program { ops, dict: program.dict.clone() }
    }

    pub fn evolve(&self, data: &[u8]) -> Program {
        let analysis = Analyzer::analyze(data);
        let mut rng = rand::thread_rng();
        let mut pop: Vec<(Program, f64)> = (0..self.config.population)
            .map(|_| {
                let p = Self::random_program(&mut rng, &analysis);
                let f = Self::fitness(&p, data);
                (p, f)
            })
            .collect();

        for _ in 0..self.config.generations {
            pop.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
            let elite = pop[0].0.clone();
            let mut next = vec![(elite.clone(), pop[0].1)];
            while next.len() < self.config.population {
                let parent = &pop[rng.gen_range(0..(self.config.population / 2).max(1))].0;
                let child = Self::mutate(parent, &mut rng, self.config.mutation_rate);
                let f = Self::fitness(&child, data);
                next.push((child, f));
            }
            pop = next;
        }
        pop.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
        pop[0].0.clone()
    }
}
