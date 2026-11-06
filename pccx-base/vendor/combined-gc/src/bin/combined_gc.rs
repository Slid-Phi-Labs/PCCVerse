use anyhow::{bail, Result};
use clap::Parser;
use combined_gc::{frame, gate, models_live, zrw, VERSION};
use flate2::write::GzEncoder;
use flate2::Compression;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "combined_gc", version = VERSION)]
#[command(about = "SlidPhiLabs Combined GC — Gate + ZRW + AWARE frame")]
struct Args {
    #[arg(short, long)]
    input: PathBuf,

    #[arg(short, long)]
    output: Option<PathBuf>,

    /// Print sizes vs gzip-9
    #[arg(long)]
    bench: bool,

    /// Decode an AWAREv5.1 / ZRW file
    #[arg(long)]
    decompress: bool,

    /// Superblock size, e.g. 900K or 900000
    #[arg(long)]
    block: Option<String>,
}

fn gzip9_len(data: &[u8]) -> usize {
    let mut enc = GzEncoder::new(Vec::new(), Compression::best());
    enc.write_all(data).ok();
    enc.finish().map(|v| v.len()).unwrap_or(data.len())
}

fn main() -> Result<()> {
    let args = Args::parse();
    let data = fs::read(&args.input)?;

    if args.decompress {
        let out = frame::decompress(&data).map_err(|e| anyhow::anyhow!(e))?;
        println!(
            "decoded {} -> {} bytes",
            args.input.display(),
            out.len()
        );
        if let Some(p) = args.output {
            fs::write(p, out)?;
        }
        return Ok(());
    }

    let stats = gate::cheap_stats(&data);
    let (path, weights) = gate::route(&stats);
    println!(
        "combined-gc {}  file={}  raw={}",
        VERSION,
        args.input.display(),
        data.len()
    );
    println!(
        "Gate: {:?} entropy={:.3} printable={:.2} zero_runs={} delta_var={:.3} weights={:?}",
        path, stats.entropy, stats.printable_ratio, stats.zero_runs, stats.delta_var, weights
    );

    if zrw::is_zero_run(&data) && !args.bench {
        let compressed = zrw::compress_zeros_int32_le(data.len());
        println!("ZRW 8B flagship: {} -> {} bytes", data.len(), compressed.len());
        if let Some(out) = args.output {
            fs::write(out, compressed)?;
        }
        return Ok(());
    }

    let pack = args
        .block
        .as_deref()
        .and_then(frame::parse_block_arg)
        .unwrap_or_else(|| frame::pack_size(data.len()));
    let result = frame::compress_with_pack(&data, pack);
    let st = models_live::analyze_block(&data);
    println!(
        "AWARE {}  type={:?} H={:.3}  {} -> {}  program={}",
        VERSION,
        result.analysis.guessed_type,
        result.analysis.entropy,
        data.len(),
        result.bytes.len(),
        result.program.describe()
    );
    println!(
        "Cont-1088 {} bin={}/{} trained={} coder={} q={} E={:.3} dens={:.3} {:?}",
        combined_gc::cont1088_table::TABLE_VERSION,
        st.bin,
        models_live::CONT_BINS,
        st.trained,
        combined_gc::cont1088_table::coder_name(st.coder),
        st.q_best,
        st.e,
        st.density,
        st.inhibitor
    );

    if args.bench {
        let gz = gzip9_len(&data);
        println!("gzip-9 {}", gz);
        if result.bytes.len() > 0 {
            let ratio = result.bytes.len() as f64 / data.len().max(1) as f64;
            println!(
                "AWARE/raw {:.3}  AWARE vs gzip-9 {:+.1}%",
                ratio,
                (result.bytes.len() as f64 / gz.max(1) as f64 - 1.0) * 100.0
            );
        }
        println!("honest: table cont1088-v3-full-silesia 13151 windows zlib-9; not a 21.4% dickens claim");
        return Ok(());
    }

    if let Some(out) = args.output {
        fs::write(&out, &result.bytes)?;
        println!("wrote {}", out.display());
    } else if result.bytes.len() >= data.len() && !zrw::is_zero_run(&data) {
        bail!(
            "AWARE {} >= raw {} — not writing (pass --output to force)",
            result.bytes.len(),
            data.len()
        );
    }
    Ok(())
}
