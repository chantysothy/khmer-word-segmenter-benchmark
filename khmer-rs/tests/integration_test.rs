use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use serde::Deserialize;
use serde_json::Value;

use khmer_rs::dictionary::Dictionary;
use khmer_rs::segmenter::KhmerSegmenter;

#[derive(Deserialize)]
struct GoldenRecord {
    id: usize,
    input: String,
    segments: Vec<String>,
}

#[test]
fn test_against_golden_master() {
    let dict_path = Path::new("../data/khmer_dictionary_words.txt");
    let freq_path = Path::new("../data/khmer_word_frequencies.json");
    let golden_path = Path::new("../data/golden_master.jsonl");

    if !dict_path.exists() || !freq_path.exists() || !golden_path.exists() {
        eprintln!("Skipping integration test: Data files not found. Run scripts/generate_golden_master.py first.");
        return;
    }

    println!("Loading model...");
    let dictionary = Dictionary::new(dict_path, freq_path).expect("Failed to load dictionary");
    let segmenter = KhmerSegmenter::new(dictionary);

    let file = File::open(golden_path).expect("Failed to open golden master");
    let reader = BufReader::new(file);

    let mut passed = 0;
    let mut failed = 0;

    for line in reader.lines() {
        let line = line.expect("Failed to read line");
        if line.trim().is_empty() { continue; }

        let record: GoldenRecord = serde_json::from_str(&line).expect("Failed to parse golden record");

        let rust_segments = segmenter.segment(&record.input);

        if rust_segments != record.segments {
            println!("Mismatch at ID {}", record.id);
            println!("Input: {}", record.input);
            println!("Golden: {:?}", record.segments);
            println!("Rust:   {:?}", rust_segments);
            failed += 1;
        } else {
            passed += 1;
        }
    }

    println!("Passed: {}, Failed: {}", passed, failed);
    assert_eq!(failed, 0, "Integration test failed with {} mismatches", failed);
}
