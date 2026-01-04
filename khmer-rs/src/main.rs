use clap::Parser;
use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::Path;
use std::time::Instant;
use rayon::prelude::*;
use std::cell::RefCell;

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

// ============================================================================
// 1BRC Optimization: Fast JSON builder with thread-local buffers
// Avoids serde_json overhead and allocation per record
// ============================================================================

/// Pre-computed hex digits table (avoids snprintf overhead)
const HEX_DIGITS: &[u8] = b"0123456789abcdef";

thread_local! {
    static JSON_BUFFER: RefCell<String> = RefCell::new(String::with_capacity(1024));
}

/// Fast JSON string escaper - appends directly to buffer
#[inline]
fn escape_json_to(out: &mut String, s: &str) {
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                // Fast hex encoding using lookup table
                let code = c as u8;
                out.push_str("\\u00");
                out.push(HEX_DIGITS[(code >> 4) as usize] as char);
                out.push(HEX_DIGITS[(code & 0xF) as usize] as char);
            }
            c => out.push(c),
        }
    }
}

/// Fast integer to string - appends directly to buffer
#[inline]
fn append_int(out: &mut String, val: usize) {
    if val == 0 {
        out.push('0');
        return;
    }
    let mut buf = [0u8; 20];
    let mut i = 20;
    let mut v = val;
    while v > 0 {
        i -= 1;
        buf[i] = b'0' + (v % 10) as u8;
        v /= 10;
    }
    for j in i..20 {
        out.push(buf[j] as char);
    }
}

/// Build JSON record directly using thread-local buffer
#[inline]
fn build_json_record(id: usize, input: &str, segments: &[String]) -> String {
    JSON_BUFFER.with(|buf| {
        let mut buffer = buf.borrow_mut();
        buffer.clear();

        // Build: {"id":N,"input":"...","segments":["...", ...]}
        buffer.push_str("{\"id\":");
        append_int(&mut buffer, id);
        buffer.push_str(",\"input\":\"");
        escape_json_to(&mut buffer, input);
        buffer.push_str("\",\"segments\":[");

        for (i, seg) in segments.iter().enumerate() {
            if i > 0 {
                buffer.push(',');
            }
            buffer.push('"');
            escape_json_to(&mut buffer, seg);
            buffer.push('"');
        }

        buffer.push_str("]}");
        buffer.clone()
    })
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

    // Parallel processing using Rayon with 1BRC fast JSON builder
    let results: Vec<String> = lines.par_iter()
        .enumerate()
        .map(|(i, line)| {
            let segments = segmenter.segment(line);
            // 1BRC: Use fast inline JSON builder instead of serde_json
            build_json_record(i, line, &segments)
        })
        .collect();

    // Write results to file only if output is specified
    if let Some(ref output_path) = args.output {
        let output_file = File::create(output_path)?;
        // 1BRC: Use buffered writer with large buffer for better I/O
        let mut writer = BufWriter::with_capacity(262144, output_file);
        for result in &results {
            writeln!(writer, "{}", result)?;
        }
        writer.flush()?;
    }

    let duration = start_process.elapsed();
    if let Some(ref output_path) = args.output {
        println!("Done. Saved to {}", output_path);
    }
    println!("Time taken: {:.2}s", duration.as_secs_f32());
    println!("Speed: {:.2} lines/sec", lines.len() as f32 / duration.as_secs_f32());

    Ok(())
}
