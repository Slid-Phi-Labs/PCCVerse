//! Force Theoretical Engine and produce before/after comparison on internal vectors + Calgary.

use aware_frame::bench::BenchmarkHarness;
use std::path::Path;

fn main() {
    println!("=== FORCED THEORETICAL ENGINE - BEFORE vs AFTER ===\n");
    println!("Empirical-only (before)  vs  Forced Theory hybrid (after)\n");

    let harness = BenchmarkHarness::new();

    println!(">>> INTERNAL VECTORS (specialty pathways + demo)\n");
    let internal = harness.run_internal_vectors();
    BenchmarkHarness::print_table(&internal);

    println!("\n>>> CALGARY CORPUS (classic; large files capped at 200KB for speed)\n");
    let calgary_dir = Path::new("/home/workdir/artifacts/corpora/calgary");
    if calgary_dir.exists() {
        let calgary = harness.run_calgary(calgary_dir);
        BenchmarkHarness::print_table(&calgary);
    } else {
        println!("Calgary directory not found - skipping.");
    }

    println!("\n=== NOTES ===");
    println!("- Forced theory uses TheoryBank source-class priors to select pathways.");
    println!("- Hybrid fitness + GapReport are mandatory under force.");
    println!("- Silesia full corpus supported by same harness; point at local files.");
    println!("- Private residual coefficients remain closed; public theory surface only.");
    println!("- NEAR = residual within tolerance of theoretical bound; GAP = theory-practice gap remains.");
}
