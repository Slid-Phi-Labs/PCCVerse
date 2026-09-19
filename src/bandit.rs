//! LinUCB for MATCH vs BWT. Context dim 5.
//! A ← A + x xᵀ,  b ← b + r x,  p = θᵀx + α √(xᵀ A⁻¹ x)

pub const D: usize = 5;
pub const N_ARM: usize = 2;
pub const ARM_MATCH: usize = 0;
pub const ARM_BWT: usize = 1;

#[derive(Clone)]
struct Arm {
    a: [[f64; D]; D],
    b: [f64; D],
}

impl Arm {
    fn new() -> Self {
        let mut a = [[0.0; D]; D];
        for i in 0..D {
            a[i][i] = 1.0;
        }
        Self { a, b: [0.0; D] }
    }
}

pub struct LinUcb {
    arms: [Arm; N_ARM],
    pub alpha: f64,
}

impl Default for LinUcb {
    fn default() -> Self {
        Self::new(0.5)
    }
}

impl LinUcb {
    pub fn new(alpha: f64) -> Self {
        Self {
            arms: [Arm::new(), Arm::new()],
            alpha,
        }
    }

    /// Reward r in [0,1], higher better (e.g. 1 - packed/raw).
    pub fn update(&mut self, arm: usize, x: &[f64; D], r: f64) {
        if arm >= N_ARM {
            return;
        }
        let a = &mut self.arms[arm];
        for i in 0..D {
            a.b[i] += r * x[i];
            for j in 0..D {
                a.a[i][j] += x[i] * x[j];
            }
        }
    }

    pub fn score(&self, arm: usize, x: &[f64; D]) -> f64 {
        let a = &self.arms[arm];
        let inv = invert5(a.a);
        let mut theta = [0.0; D];
        for i in 0..D {
            for j in 0..D {
                theta[i] += inv[i][j] * a.b[j];
            }
        }
        let mut mean = 0.0;
        let mut ax = [0.0; D];
        for i in 0..D {
            mean += theta[i] * x[i];
            for j in 0..D {
                ax[i] += inv[i][j] * x[j];
            }
        }
        let mut quad = 0.0;
        for i in 0..D {
            quad += x[i] * ax[i];
        }
        mean + self.alpha * quad.max(0.0).sqrt()
    }

    pub fn select(&self, x: &[f64; D]) -> usize {
        let mut best = 0usize;
        let mut best_p = f64::NEG_INFINITY;
        for arm in 0..N_ARM {
            let p = self.score(arm, x);
            if p > best_p {
                best_p = p;
                best = arm;
            }
        }
        best
    }
}

fn invert5(m: [[f64; D]; D]) -> [[f64; D]; D] {
    let mut a = m;
    let mut inv = [[0.0; D]; D];
    for i in 0..D {
        inv[i][i] = 1.0;
    }
    for col in 0..D {
        let mut piv = col;
        let mut best = a[col][col].abs();
        for r in col + 1..D {
            let v = a[r][col].abs();
            if v > best {
                best = v;
                piv = r;
            }
        }
        if best < 1e-12 {
            return inv5_fallback(m);
        }
        if piv != col {
            a.swap(col, piv);
            inv.swap(col, piv);
        }
        let d = a[col][col];
        for j in 0..D {
            a[col][j] /= d;
            inv[col][j] /= d;
        }
        for r in 0..D {
            if r == col {
                continue;
            }
            let f = a[r][col];
            for j in 0..D {
                a[r][j] -= f * a[col][j];
                inv[r][j] -= f * inv[col][j];
            }
        }
    }
    inv
}

fn inv5_fallback(_m: [[f64; D]; D]) -> [[f64; D]; D] {
    let mut inv = [[0.0; D]; D];
    for i in 0..D {
        inv[i][i] = 1.0;
    }
    inv
}

/// z, h, match_rate, pos, prev_arm  — all roughly in [0,1]
pub fn features(zero_frac: f64, entropy_norm: f64, match_rate: f64, pos: f64, prev: usize) -> [f64; D] {
    [
        zero_frac.clamp(0.0, 1.0),
        entropy_norm.clamp(0.0, 1.5),
        match_rate.clamp(0.0, 1.0),
        pos.clamp(0.0, 1.0),
        if prev == ARM_BWT { 1.0 } else { 0.0 },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_grows_a_and_b() {
        let mut u = LinUcb::new(0.5);
        let x = [1.0, 0.0, 0.0, 0.0, 0.0];
        u.update(ARM_BWT, &x, 0.8);
        assert!((u.arms[ARM_BWT].a[0][0] - 2.0).abs() < 1e-9); // 1 + 1*1
        assert!((u.arms[ARM_BWT].b[0] - 0.8).abs() < 1e-9);
        assert!((u.arms[ARM_MATCH].a[0][0] - 1.0).abs() < 1e-9);
    }

    #[test]
    fn rewarded_arm_selected() {
        let mut u = LinUcb::new(0.1);
        let x = [0.1, 0.8, 0.05, 0.0, 1.0];
        for _ in 0..20 {
            u.update(ARM_BWT, &x, 0.9);
            u.update(ARM_MATCH, &x, 0.2);
        }
        assert_eq!(u.select(&x), ARM_BWT);
    }
}
