# Khmer Segmenter C++ Port

High-performance C++ implementation of the Khmer Segmenter, designed to outperform Python and Rust implementations.

## Requirements
- C++17 compliant compiler (GCC/Clang)
- GNU Make
- OpenMP (for multi-threading support)

## Build
Run `make` in this directory:
```bash
make
```
This will produce the `khmer_segmenter_cpp` executable.

## Usage
```bash
./khmer_segmenter_cpp --input <input_file> [--output <output_file>] [--dict <dict_file>] [--freq <freq_file>] [--threads <n>]
```

### Arguments
- `--input`: Path to input text file (required).
- `--output`: Path to output file (JSONL format).
- `--dict`: Path to dictionary file (default: `../data/khmer_dictionary_words.txt`).
- `--freq`: Path to frequency file (default: `../data/khmer_word_frequencies.json`).
- `--limit`: Limit number of lines to process.
- `--threads`: Number of OpenMP threads to use (default: 4).

## Benchmark
To compare performance against the Python version:
```bash
./khmer_segmenter_cpp --input ../data/khmer_wiki_corpus.txt --limit 50000 --threads 8
```
