use criterion::{black_box, criterion_group, criterion_main, Criterion};
use std::path::Path;
use khmer_rs::dictionary::Dictionary;
use khmer_rs::segmenter::KhmerSegmenter;

fn benchmark_segmentation(c: &mut Criterion) {
    let dict_path = Path::new("../data/khmer_dictionary_words.txt");
    let freq_path = Path::new("../data/khmer_word_frequencies.json");

    if !dict_path.exists() {
        eprintln!("Skipping benchmark: Data files not found.");
        return;
    }

    let dictionary = Dictionary::new(dict_path, freq_path).expect("Failed to load dictionary");
    let segmenter = KhmerSegmenter::new(dictionary);

    let text = "កងកម្លាំងរក្សាសន្តិសុខនិងសណ្តាប់ធ្នាប់សាធារណៈ"; // "Security and public order forces"

    c.bench_function("segment_short_sentence", |b| {
        b.iter(|| {
            segmenter.segment(black_box(text));
        })
    });
}

criterion_group!(benches, benchmark_segmentation);
criterion_main!(benches);
