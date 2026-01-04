use clap::Parser;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::time::Instant;
use rayon::prelude::*;
use serde::Serialize;

use khmer_rs::dictionary::Dictionary;
use khmer_rs::segmenter::KhmerSegmenter;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Path to dictionary file
    #[arg(short, long, default_value = "../data/khmer_dictionary_words.txt")]
    dict: String,

    /// Path to frequency file
    #[arg(short, long, default_value = "../data/khmer_word_frequencies.json")]
    freq: String,

    /// Input text file
    #[arg(short, long)]
    input: String,

    /// Output file (JSONL) - optional, skip to benchmark only
    #[arg(short, long)]
    output: Option<String>,

    /// Limit number of lines to process
    #[arg(short, long)]
    limit: Option<usize>,
}

#[derive(Serialize)]
struct OutputRecord<'a> {
    id: usize,
    input: &'a str,
    segments: Vec<String>,
}

fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    println!("Initializing Segmenter...");
    println!("Dictionary: {}", args.dict);
    println!("Frequencies: {}", args.freq);

    let start_load = Instant::now();
    let dictionary = Dictionary::new(Path::new(&args.dict), Path::new(&args.freq))?;
    let segmenter = KhmerSegmenter::new(dictionary);
    println!("Model loaded in {:.2}s", start_load.elapsed().as_secs_f32());

    println!("Reading source: {}", args.input);
    let file = File::open(&args.input)?;
    let reader = BufReader::new(file);
    // Read and trim lines - must match Python's line.strip() behavior
    let mut lines: Vec<String> = reader
        .lines()
        .collect::<Result<Vec<String>, _>>()?
        .into_iter()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    if let Some(limit) = args.limit {
        if limit < lines.len() {
            lines.truncate(limit);
        }
    }

    println!("Processing {} lines...", lines.len());
    let start_process = Instant::now();

    // Parallel processing using Rayon
    // We collect results into a Vec first to ensure order is preserved and to keep IO out of the parallel section
    let results: Vec<String> = lines.par_iter()
        .enumerate()
        .map(|(i, line)| {
            let segments = segmenter.segment(line);

            let record = OutputRecord {
                id: i,
                input: line,
                segments,
            };
            serde_json::to_string(&record).unwrap_or_default()
        })
        .collect();

    // Write results to file only if output is specified
    if let Some(ref output_path) = args.output {
        let mut output_file = File::create(output_path)?;
        for result in results {
            writeln!(output_file, "{}", result)?;
        }
    }

    let duration = start_process.elapsed();
    if let Some(ref output_path) = args.output {
        println!("Done. Saved to {}", output_path);
    }
    println!("Time taken: {:.2}s", duration.as_secs_f32());
    println!("Speed: {:.2} lines/sec", lines.len() as f32 / duration.as_secs_f32());

    Ok(())
}
