# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This project implements a probabilistic word segmentation algorithm for the Khmer language using the Viterbi algorithm. It is a pure Python implementation designed for performance and portability, using a cost-based model derived from corpus word frequencies.

## Build and Run Commands

### Installation
- **Install dependencies**: `pip install -r requirements.txt`

### Testing & Execution
- **Run standard tests**: `python scripts/test_viterbi.py`
- **Batch process a corpus**: `python scripts/test_viterbi.py --source data/khmer_folktales_extracted.txt --limit 500`
- **Find unknown words**: `python scripts/find_unknown_words.py --input segmentation_results.txt`
- **Run benchmarks**: `python scripts/benchmark_suite.py`
- **Run multi-language benchmark battle**: `python scripts/benchmark_battle.py`

### C# Port (.NET)
- **Build**: `cd khmer-dotnet && dotnet build -c Release`
- **Run**: `cd khmer-dotnet && dotnet run -c Release -- --input ../data/input.txt --output ../data/output.json`

### Rust Port
- **Build**: `cd khmer-rs && cargo build --release`
- **Run**: `cd khmer-rs && ./target/release/khmer-rs --dict ../data/khmer_dictionary_words.txt --freq ../data/khmer_word_frequencies.json --input ../data/input.txt --output ../data/output.json`

### Data Preparation
- **Generate baseline frequencies (bootstrap)**:
  `python scripts/generate_frequencies.py --engine khmernltk --corpus data/khmer_wiki_corpus.txt --dict data/khmer_dictionary_words.txt --output data/khmer_word_frequencies.json`
- **Regenerate frequencies (self-improvement)**:
  `python scripts/generate_frequencies.py --engine internal --corpus data/khmer_wiki_corpus.txt --dict data/khmer_dictionary_words.txt --output data/khmer_word_frequencies.json`

## Architecture and Structure

### Core Components (`khmer_segmenter/`)
- **`viterbi.py`**: The main engine containing the `KhmerSegmenter` class. It implements:
  - **Viterbi Algorithm**: Finds the lowest-cost path for segmentation.
  - **Cost Calculation**: `Cost = -log10(Probability)` based on corpus frequency.
  - **Heuristics**: Special handling for numbers, currencies, acronyms, and unknown clusters.
  - **Repair Mode**: Fallback mechanism for malformed text to prevent crashes.

### Data (`data/`)
- **`khmer_dictionary_words.txt`**: The whitelist of valid Khmer words.
- **`khmer_word_frequencies.json`**: The statistical model (word counts) generated from corpora.
- **Corpora**: Raw text files (e.g., `khmer_wiki_corpus.txt`) used for training.

### Logic Flow
1.  **Input Cleaning**: Removes zero-width spaces.
2.  **Grouping**: High-priority grouping for numbers, currencies, and known acronyms.
3.  **Pathfinding**: Uses Viterbi to find the optimal sequence of dictionary words.
4.  **Fallback**: Falls back to structural clusters for unknown segments.
5.  **Post-processing**: Merges isolated consonants and applies linguistic rules to refine output.

### Design Principles
- **No Heavy Dependencies**: Pure Python standard library usage (external libs only for data prep tools).
- **Thread Safety**: Designed to be thread-safe for concurrent execution (limited by GIL in Python).
- **Portability**: Logic is mathematical/algorithmic, suitable for porting to other languages.
