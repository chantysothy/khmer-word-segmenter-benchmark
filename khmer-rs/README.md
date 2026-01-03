# khmer-rs: High-Performance Khmer Word Segmenter

A Rust port of the [khmer_segmenter](https://github.com/mowlo/khmer_segmenter) Python project. This implementation aims to provide 100% accuracy compatibility with the Python reference implementation while delivering significant performance improvements (>50x speedup).

## Features

- **High Performance**: Written in optimized Rust to minimize memory allocation and maximize throughput.
- **Accuracy**: Implements the exact same Viterbi algorithm and heuristics as the Python version (Golden Master verified).
- **Zero-Copy Architecture**: Uses string slices and indices rather than string copying for core segmentation logic.
- **CLI Interface**: Compatible with batch processing workflows.

## Prerequisites

- [Rust Toolchain](https://rustup.rs/) (1.70.0 or later recommended)

## Installation & Building

1. Navigate to the rust directory:
   ```bash
   cd khmer-rs
   ```

2. Build the release binary:
   ```bash
   cargo build --release
   ```
   The binary will be located at `target/release/khmer-rs` (or `khmer-rs.exe` on Windows).

## Usage

### CLI Command

```bash
./target/release/khmer-rs --input <INPUT_FILE> --output <OUTPUT_FILE> [OPTIONS]
```

**Options:**
- `-i, --input <FILE>`: Input text file (one sentence per line)
- `-o, --output <FILE>`: Output JSONL file
- `-d, --dict <FILE>`: Path to dictionary file (Default: `../data/khmer_dictionary_words.txt`)
- `-f, --freq <FILE>`: Path to frequency file (Default: `../data/khmer_word_frequencies.json`)
- `-l, --limit <NUM>`: Limit number of lines to process

### Example

```bash
./target/release/khmer-rs \
  --input ../data/khmer_folktales_extracted.txt \
  --output results.jsonl \
  --limit 1000
```

## Running Benchmarks

We provide a comparison script to benchmark the Rust implementation against the Python baseline.

1. Ensure you have the Python dependencies installed:
   ```bash
   pip install -r ../requirements.txt
   ```

2. Build the Rust binary (if not already built):
   ```bash
   cd khmer-rs && cargo build --release && cd ..
   ```

3. Run the comparison script:
   ```bash
   python scripts/benchmark_comparison.py --limit 5000
   ```

## Development

### Running Tests
Unit tests and integration tests ensure the logic matches the Python reference.

```bash
cargo test
```

### Project Structure
- `src/main.rs`: CLI entry point.
- `src/lib.rs`: Library exports.
- `src/segmenter.rs`: Core Viterbi algorithm implementation.
- `src/heuristics.rs`: Post-processing rules (numbers, currencies, cleanup).
- `src/dictionary.rs`: Dictionary loading and cost calculation.
- `src/constants.rs`: Khmer Unicode character definitions.

## License

MIT
