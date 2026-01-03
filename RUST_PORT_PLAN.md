# Rust Port Implementation Plan: `khmer-rs`

## 1. Executive Summary
**Goal**: Recreate the `khmer_segmenter` Python project in Rust to achieve >50x performance improvement and <10% memory usage while maintaining 100% output accuracy.

**Strategy**:
1.  **Direct Port First**: Implement the exact logic of `viterbi.py` using idiomatic Rust.
2.  **Optimize Later**: Switch from HashMaps to DAWG/Trie data structures once correctness is verified.
3.  **Streaming Architecture**: Use Iterators to handle text processing pipeline (Segmentation -> Heuristics -> Output) to minimize allocation.

---

## 2. Architecture

### 2.1 Core Components
1.  **`Dictionary` & `CostModel`**:
    -   Responsible for loading `khmer_dictionary_words.txt` and `khmer_word_frequencies.json`.
    -   **Optimization**: Instead of `Set<String>`, use a **Finite State Transducer (FST)** or **Double-Array Trie** for compact storage and fast prefix lookups.
    -   **Cost Storage**: Store pre-calculated `-log10(probability)` as `f32`.

2.  **`ViterbiEngine`**:
    -   Input: `&str` (Zero-copy).
    -   Logic: Dynamic Programming array `Vec<(cost: f32, parent_idx: usize)>`.
    -   **Key Diff**: Operate on byte indices (`usize`) rather than slicing strings.

3.  **`HeuristicPipeline`**:
    -   Instead of multiple list passes, implement a `Iterator` adapter chain.
    -   `ViterbiIterator` yields `Segment` -> `ClusterMerger` -> `FinalFilter`.

### 2.2 Tech Stack
-   **Language**: Rust (2021 Edition)
-   **Crates**:
    -   `serde`, `serde_json`: For loading frequency maps.
    -   `fst` or `trie-rs`: For memory-efficient dictionary storage (Optional Phase 2).
    -   `clap`: For the CLI interface (matching `scripts/benchmark_suite.py`).
    -   `thiserror`: For error handling.
    -   `criterion`: For precise micro-benchmarking.

---

## 3. Implementation Phases

### Phase 1: The "Golden Master" & Setup
*Goal: Establish the ground truth.*
-   [x] Create `scripts/generate_golden.py`: Runs the existing Python code on `data/khmer_folktales_extracted.txt` and dumps a standard `input|output` CSV.
-   [x] Initialize `khmer-rs` Cargo project.
-   [x] Implement `ModelLoader` to parse the existing `.json` and `.txt` files.

### Phase 2: Core Viterbi (The "Naive" Port)
*Goal: Get it working with standard HashMaps.*
-   [x] Implement `KhmerSegmenter` struct.
-   [x] Port `_is_khmer_char`, `_get_khmer_cluster_length`, etc., using strict char checks (no regex for core loops).
-   [x] Implement the DP loop.
-   [x] **Verification**: Run against "Golden Master" for simple sentences.

### Phase 3: Heuristics (The "Hard" Part)
*Goal: Match the Python "repair mode" and specific merging rules.*
-   [x] Port `_apply_heuristics` logic.
-   [x] Implement "Number" and "Currency" detection logic.
-   [x] **Verification**: Run full regression test against the Golden Master.

### Phase 4: Optimization (The "Party Mode" Goal)
*Goal: Speed and Memory.*
-   [x] Replace `HashMap<String, f32>` with `FxHashMap` (Chosen over FST for pure speed).
-   [x] Parallelize processing using `rayon` (equivalent to the Python concurrent test but strictly better).
-   [x] Zero-Copy String Processing (`Cow<'a, str>`) - **Critical Optimization**.
-   [x] Final Benchmark comparison.

---

## 4. Key Challenges & Solutions

| Python Logic | Rust Solution |
| :--- | :--- |
| `text[i:j]` (String Slicing) | `&text[i..j]` (String Slice - Zero Copy) |
| `words = set()` (Memory Heavy) | `FxHashSet` (Fast Hashing) |
| Garbage Collection | Zero-Copy `Cow<'a, str>` & Stack Allocation |
| Regex for Heuristics | Manual `char` Iterators (Faster) |

## 5. Directory Structure
```
khmer-rs/
├── Cargo.toml
├── src/
│   ├── main.rs           # CLI Entry point
│   ├── lib.rs            # Lib export
│   ├── dictionary.rs     # Loading logic
│   ├── constants.rs      # Khmer Unicode ranges
│   ├── segmenter.rs      # Viterbi Implementation
│   └── heuristics.rs     # Post-processing rules
├── tests/
│   └── integration_test.rs # Compares against golden_master.txt
└── benches/
    └── segmentation_benchmark.rs # Criterion benchmarks
```
