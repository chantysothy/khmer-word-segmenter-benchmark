# Khmer Word Segmenter - Multi-Language Optimization Benchmark

A comprehensive benchmark project comparing optimized implementations of a Khmer word segmentation algorithm across **9 programming languages**. This project demonstrates how the same Viterbi-based algorithm can be optimized and ported to achieve dramatic performance improvements.

> **Built with AI**: All code implementations across 9 languages were written by [Claude Code CLI](https://claude.ai/code) using **Claude Opus 4** (claude-opus-4-5-20250514). The AI translated the original Python algorithm to Go, C++, Rust, C#, Java, Node.js, Bun, and WebAssembly, applying language-specific optimizations including 1BRC (One Billion Row Challenge) techniques.

## Project Goal

This project takes the original Python implementation of a probabilistic Khmer word segmenter and ports it to multiple programming languages, applying language-specific optimizations to maximize performance. The goal is to:

1. **Benchmark** the same algorithm across different languages
2. **Optimize** each implementation using language-specific best practices
3. **Measure** real-world performance differences
4. **Provide** production-ready implementations for various platforms

## Benchmark Results

Tested on the same hardware with 10,000 lines of Khmer text (synthetic workload):

| Language | Speed (lines/sec) | Speedup vs Python | Output Match | Key Optimizations |
|----------|-------------------|-------------------|--------------|-------------------|
| **Go** | **210,172** | **334x** | ✅ 100% | Trie + 32 goroutines + sync.Pool + 1BRC |
| **C++** | 184,063 | 293x | ✅ 100% | Trie + 1BRC lookup tables + fast JSON |
| **Rust** | 115,307 | 183x | ✅ 100% | Trie + FxHashMap + Rayon + 1BRC thread-local |
| **C# (.NET)** | 110,708 | 176x | ✅ 100% | Trie + Span<char> + SkipLocalsInit + 1BRC |
| **Java** | 16,287 | 26x | ✅ 100% | Trie + parallel streams + char[] buffers + 1BRC |
| **Node.js** | 9,590 | 15x | ✅ 100% | Trie + worker threads + charCode optimization |
| **Bun** | 9,318 | 15x | ✅ 100% | Trie + Web Workers + TypedArray buffers |
| **WASM** | 8,989 | 14x | ✅ 100% | AssemblyScript + worker threads + bit flags |
| **Python** | 629 | 1x | Baseline | Reference implementation |

> **Note**: "Output Match" indicates segmentation accuracy compared to Python baseline.
> All optimized implementations achieve **100% identical output** to the Python reference implementation.

### Performance Visualization

```
Go       ██████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████ 210,172
C++      ████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████ 184,063
Rust     ██████████████████████████████████████████████████████████████████████████████████████████████████████████████ 115,307
C#       █████████████████████████████████████████████████████████████████████████████████████████████████████████████ 110,708
Java     ████████████████ 16,287
Node.js  █████████ 9,590
Bun      █████████ 9,318
WASM     █████████ 8,989
Python   █ 629
         └────────────────────────────────────────────────────────────────────────────────────────────────────── lines/sec
```

## Language Implementations

### Directory Structure

```
khmer_segmenter/
├── khmer_segmenter/      # Python - Reference implementation
├── khmer-go/             # Go - Fastest implementation
├── khmer-rs/             # Rust - High performance
├── khmer-java/           # Java - JVM with parallel streams
├── khmer-dotnet/         # C# (.NET 10) - Cross-platform managed code
├── khmer-cpp/            # C++ - High performance with OpenMP
├── khmer-node/           # Node.js - JavaScript/TypeScript
├── khmer-bun/            # Bun - Fast JavaScript runtime
├── khmer-wasm/           # WebAssembly - Browser-ready
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
- **Go**: Goroutines with worker pools (32 workers)
- **Rust**: Rayon work-stealing parallelism
- **Java**: Parallel streams with thread pools
- **C#**: Parallel.For
- **C++**: OpenMP with dynamic scheduling
- **Node.js**: Worker threads (8 workers)
- **Bun**: Web Workers with TypedArray buffers (8 workers)

## Quick Start

### Python (Reference)
```bash
pip install -r requirements.txt
python scripts/test_viterbi.py
```

### Go (Fastest)
```bash
cd khmer-go
go build -o khmer.exe ./cmd/khmer
./khmer.exe --input ../data/input.txt --output output.json
```

### C++ (High Performance)
```bash
cd khmer-cpp
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
cmake --build . --config Release
./Release/khmer_segmenter_cpp --input ../../data/input.txt --output output.json
```

### Rust
```bash
cd khmer-rs
cargo build --release
./target/release/khmer-rs --input ../data/input.txt --output output.json
```

### C# (.NET)
```bash
cd khmer-dotnet
dotnet build -c Release
dotnet run -c Release -- --input ../data/input.txt --output output.json
```

### Java
```bash
cd khmer-java
javac -encoding UTF-8 -d target/classes src/main/java/khmer/*.java
java -cp target/classes khmer.Main --input ../data/input.txt --output output.json
```

### Node.js
```bash
cd khmer-node
npm install && npm run build
node dist/index.js --input ../data/input.txt --output output.json
```

### Bun
```bash
cd khmer-bun
bun install
bun run src/index.ts --dict ../data/khmer_dictionary_words.txt --freq ../data/khmer_word_frequencies.json --input ../data/input.txt --output output.json
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

This optimization benchmark is a fork of the original **[Khmer Segmenter](https://github.com/Sovichea/khmer_segmenter)** by **[Sovichea Tep](https://github.com/Sovichea)**.

### About the Original Project

The original implementation is a zero-dependency, high-performance Khmer word segmenter that focuses on **dictionary-accurate segmentation** rather than ML-based contextual inference. It was designed for portability across platforms from embedded systems to web applications.

Key features of the original algorithm:

- **Viterbi Algorithm**: A mathematical pathfinding approach that determines optimal word boundaries by computing the shortest path through possible text segments
- **Probabilistic Cost Model**: Word costs derived from corpus frequencies using `-log10(probability)`
- **Linguistic Heuristics**: Khmer-specific rules for handling numbers, currencies, acronyms, and unknown character clusters
- **Normalization Logic**: Handles variant spellings (Coeng Ta/Da swap, Coeng Ro ordering) for robust matching

### Acknowledgements

- **[Sovichea Tep](https://github.com/Sovichea)**: Original algorithm design and Python implementation
- **[Original khmer_segmenter Repository](https://github.com/Sovichea/khmer_segmenter)**: The source project this benchmark is based on
- **[khmernltk](https://github.com/VietHoang1512/khmer-nltk)**: Used for initial corpus tokenization and baseline frequency generation
- **[Khmer Folktales Corpus](https://github.com/sovichet)**: Dictionary and corpus resources

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
