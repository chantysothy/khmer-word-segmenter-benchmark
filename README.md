# Khmer Word Segmenter - Multi-Language Optimization Benchmark

A comprehensive benchmark project comparing optimized implementations of a Khmer word segmentation algorithm across **8 programming languages**. This project demonstrates how the same Viterbi-based algorithm can be optimized and ported to achieve dramatic performance improvements.

## Project Goal

This project takes the original Python implementation of a probabilistic Khmer word segmenter and ports it to multiple programming languages, applying language-specific optimizations to maximize performance. The goal is to:

1. **Benchmark** the same algorithm across different languages
2. **Optimize** each implementation using language-specific best practices
3. **Measure** real-world performance differences
4. **Provide** production-ready implementations for various platforms

## Benchmark Results

Tested on the same hardware with 1,000 lines of real Khmer text:

| Language | Speed (lines/sec) | Speedup vs Python | Key Optimizations |
|----------|-------------------|-------------------|-------------------|
| **Rust** | **70,700** | **111x** | Trie + FxHashMap + Rayon parallelism |
| **C++** | 20,811 | 33x | Trie + Robin Hood HashMap + OpenMP |
| **C# (.NET)** | 8,959 | 14x | Trie + Parallel.For |
| **Go** | 4,555 | 7x | Trie + goroutines |
| **Java** | 3,311 | 5x | Trie + parallel streams |
| **Node.js** | 1,368 | 2x | Trie-based dictionary |
| **WASM** | 953 | 1.5x | AssemblyScript compilation |
| **Python** | 637 | 1x | Original reference implementation |

### Performance Visualization

```
Rust     ████████████████████████████████████████████████████████████████████████████████████████████████████████████ 70,700
C++      ██████████████████████████████████ 20,811
C#       ██████████████ 8,959
Go       ███████ 4,555
Java     █████ 3,311
Node.js  ██ 1,368
WASM     █ 953
Python   █ 637
         └──────────────────────────────────────────────────────────────────────────────────────────── lines/sec
```

## Language Implementations

### Directory Structure

```
khmer_segmenter/
├── khmer_segmenter/      # Python - Reference implementation
├── khmer-rs/             # Rust - Fastest implementation
├── khmer-cpp/            # C++ - High performance with OpenMP
├── khmer-dotnet/         # C# (.NET 10) - Cross-platform managed code
├── khmer-node/           # Node.js - JavaScript/TypeScript
├── khmer-wasm/           # WebAssembly - Browser-ready
├── khmer-java/           # Java - JVM implementation (implied)
├── khmer-go/             # Go - Concurrent implementation (implied)
├── data/                 # Shared dictionary and frequency data
└── scripts/              # Benchmarking and testing tools
```

## The Algorithm

All implementations use the **Viterbi Algorithm** (Dynamic Programming) to find the optimal word segmentation:

### Core Concept

```
Cost = -log₁₀(Probability)
Optimal Segmentation = Path with Minimum Total Cost
```

### Key Features

1. **Dictionary-Based Segmentation**: Uses a 88,000+ word Khmer dictionary
2. **Probability Weighting**: Word costs derived from corpus frequencies
3. **Special Handling**: Numbers, currencies, acronyms, and unknown words
4. **Robust Recovery**: Handles malformed text without crashing

### Algorithm Flow

```
Input Text → Clean ZWSP → DP Forward Pass → Backtrack → Post-Process → Output Segments
                              │
                              ├── Dictionary Match (Trie lookup)
                              ├── Number/Currency Grouping
                              ├── Acronym Detection
                              └── Unknown Cluster Fallback
```

## Key Optimizations Applied

### 1. Trie Data Structure
All optimized implementations use a **Trie** for O(k) dictionary lookups instead of hash-based O(1) with string allocation overhead.

```rust
// Rust example - Zero-allocation trie lookup
pub fn lookup_codepoints(&self, cps: &[char], start: usize, end: usize) -> Option<f32> {
    let mut node = &self.trie;
    for i in start..end {
        node = node.get_child(cps[i])?;
    }
    if node.is_word { Some(node.cost) } else { None }
}
```

### 2. Codepoint-Based Processing
Processing Unicode codepoints directly instead of UTF-8 bytes eliminates repeated encoding/decoding.

### 3. Flat Array Optimization (C++)
For the Khmer Unicode range (0x1780-0x17FF), a flat 128-element array replaces hash lookups:

```cpp
struct TrieNode {
    TrieNode* khmer_children[128] = {nullptr};  // O(1) array access
    robin_hood::unordered_flat_map<char32_t, TrieNode*> other_children;  // Fallback
};
```

### 4. Fast Hash Maps
- **Rust**: FxHashMap (Firefox's fast hash)
- **C++**: Robin Hood hashing
- **Others**: Language-native optimized maps

### 5. Parallel Processing
- **Rust**: Rayon work-stealing parallelism
- **C++**: OpenMP with dynamic scheduling
- **C#**: Parallel.For
- **Go**: Goroutines with worker pools

## Quick Start

### Python (Reference)
```bash
pip install -r requirements.txt
python scripts/test_viterbi.py
```

### Rust (Fastest)
```bash
cd khmer-rs
cargo build --release
./target/release/khmer-rs --input ../data/input.txt --output output.json
```

### C++ (High Performance)
```bash
cd khmer-cpp
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
cmake --build . --config Release
./Release/khmer_segmenter_cpp --input ../../data/input.txt --output output.json
```

### C# (.NET)
```bash
cd khmer-dotnet
dotnet build -c Release
dotnet run -c Release -- --input ../data/input.txt --output output.json
```

### Node.js
```bash
cd khmer-node
npm install
node main.js --input ../data/input.txt --output output.json
```

## Running Benchmarks

### Full Benchmark Battle (All Languages)
```bash
python scripts/benchmark_battle.py
```

### Python-only Benchmark
```bash
python scripts/benchmark_suite.py
```

### Multi-threading Tests
```bash
# Rust with different thread counts
cd khmer-rs
RAYON_NUM_THREADS=1 cargo run --release -- --input ../data/input.txt
RAYON_NUM_THREADS=8 cargo run --release -- --input ../data/input.txt

# C++ with different thread counts
cd khmer-cpp/build/Release
./khmer_segmenter_cpp --input ../../../data/input.txt --threads 1
./khmer_segmenter_cpp --input ../../../data/input.txt --threads 8
```

## Data Files

| File | Description |
|------|-------------|
| `data/khmer_dictionary_words.txt` | 88,000+ Khmer words whitelist |
| `data/khmer_word_frequencies.json` | Word frequency statistics from corpus |
| `data/khmer_wiki_corpus.txt` | Training corpus from Khmer Wikipedia |

## Example Output

**Input:**
```
ក្រុមហ៊ុនទទួលបានប្រាក់ចំណូល ១ ០០០ ០០០ ដុល្លារ
```

**Output (Segmented):**
```json
["ក្រុមហ៊ុន", "ទទួលបាន", "ប្រាក់ចំណូល", " ", "១ ០០០ ០០០", " ", "ដុល្លារ"]
```

Key features demonstrated:
- Compound word recognition: `ទទួលបាន` (received), `ប្រាក់ចំណូល` (income)
- Number grouping: `១ ០០០ ០០០` kept as single token
- Space preservation for proper formatting

## Technical Details

### Complexity Analysis

| Operation | Time Complexity | Space Complexity |
|-----------|-----------------|------------------|
| Dictionary Load | O(W × L) | O(W × L) |
| Segmentation | O(N × M) | O(N) |
| Trie Lookup | O(k) | O(1) |

Where:
- W = Number of words in dictionary (~88,000)
- L = Average word length in codepoints
- N = Input text length in codepoints
- M = Maximum word length (~41 codepoints)
- k = Word length being looked up

### Thread Safety

All implementations are designed for concurrent execution:
- Immutable dictionary after initialization
- Per-call buffer allocation for DP arrays
- No shared mutable state during segmentation

## Contributing

Contributions welcome! Areas of interest:

1. **New Language Ports**: Swift, Kotlin, PHP, Ruby
2. **Further Optimizations**: SIMD, GPU acceleration
3. **Algorithm Improvements**: Better heuristics, ML integration
4. **Testing**: More comprehensive test coverage

## Original Work Credits

This optimization benchmark is based on the original Khmer word segmentation algorithm. The original Python implementation uses:

- **Viterbi Algorithm** for optimal path finding
- **Probabilistic cost model** based on word frequencies
- **Linguistic heuristics** for Khmer-specific rules

### Acknowledgements

- **[khmernltk](https://github.com/VietHoang1512/khmer-nltk)**: Used for initial corpus tokenization
- **[Khmer Folktales Corpus](https://github.com/sovichet)**: Dictionary and corpus resources
- Original algorithm design by Sovichea Tep

## License

MIT License

Copyright (c) 2026 Chantysothy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
