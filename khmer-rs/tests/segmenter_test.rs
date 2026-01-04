//! Unit tests for Khmer Word Segmenter.
//! Tests against the shared test cases to ensure 100% match with Python baseline.

use khmer_rs::dictionary::Dictionary;
use khmer_rs::segmenter::KhmerSegmenter;
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize)]
struct TestCase {
    id: usize,
    input: String,
    description: String,
    expected: Vec<String>,
}

fn setup() -> (KhmerSegmenter, Vec<TestCase>) {
    let data_dir = Path::new("../data");
    let dict_path = data_dir.join("khmer_dictionary_words.txt");
    let freq_path = data_dir.join("khmer_word_frequencies.json");
    let test_cases_path = data_dir.join("test_cases.json");

    let dictionary = Dictionary::new(&dict_path, &freq_path)
        .expect("Failed to load dictionary");
    let segmenter = KhmerSegmenter::new(dictionary);

    let test_cases_json = std::fs::read_to_string(&test_cases_path)
        .expect("Failed to read test cases");
    let test_cases: Vec<TestCase> = serde_json::from_str(&test_cases_json)
        .expect("Failed to parse test cases");

    (segmenter, test_cases)
}

#[test]
fn test_all_cases_match_expected() {
    let (segmenter, test_cases) = setup();
    let mut failures = Vec::new();

    for tc in &test_cases {
        let result = segmenter.segment(&tc.input);
        if result != tc.expected {
            failures.push(format!(
                "[{}] {}\n  Input: {}\n  Expected: {:?}\n  Actual: {:?}",
                tc.id, tc.description, tc.input, tc.expected, result
            ));
        }
    }

    if !failures.is_empty() {
        panic!(
            "{}/{} test cases failed:\n{}",
            failures.len(),
            test_cases.len(),
            failures.join("\n")
        );
    }
}

#[test]
fn test_single_known_word() {
    let (segmenter, _) = setup();

    let result = segmenter.segment("សួស្តី");
    assert_eq!(result, vec!["សួស្តី"]);

    let result = segmenter.segment("កម្ពុជា");
    assert_eq!(result, vec!["កម្ពុជា"]);
}

#[test]
fn test_multiple_words() {
    let (segmenter, _) = setup();
    let result = segmenter.segment("ខ្ញុំស្រលាញ់កម្ពុជា");
    assert_eq!(result, vec!["ខ្ញុំ", "ស្រលាញ់", "កម្ពុជា"]);
}

#[test]
fn test_with_spaces() {
    let (segmenter, _) = setup();
    let result = segmenter.segment("សួស្តី បង");
    assert_eq!(result, vec!["សួស្តី", " ", "បង"]);
}

#[test]
fn test_numbers() {
    let (segmenter, _) = setup();
    let result = segmenter.segment("១២៣៤៥");
    assert_eq!(result, vec!["១២៣៤៥"]);
}

#[test]
fn test_empty_string() {
    let (segmenter, _) = setup();
    let result = segmenter.segment("");
    assert!(result.is_empty());
}

#[test]
fn test_space_before_sign_pattern() {
    // Regression test for the fix
    let (segmenter, _) = setup();
    let result = segmenter.segment("សម្រា ប់ការ");
    assert_eq!(result, vec!["ស", "ម្រា ប់", "ការ"]);
}

#[test]
fn test_punctuation() {
    let (segmenter, _) = setup();
    let result = segmenter.segment("សួស្តី។");
    assert_eq!(result, vec!["សួស្តី", "។"]);
}
