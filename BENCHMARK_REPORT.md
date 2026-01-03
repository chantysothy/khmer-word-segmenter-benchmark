# Khmer Segmenter: The Battle for Speed

This report documents the "Battle Royale" between the original Python implementation of the Khmer Segmenter and high-performance challengers: Node.js, C# (.NET), WebAssembly (via AssemblyScript), and a highly optimized Rust version.

## 1. The Contenders

### Python (The Incumbent)
- **Engine**: Pure Python 3
- **Algorithm**: Viterbi with dynamic programming.
- **Strengths**: Readable, easy to maintain, great for prototyping.
- **Weaknesses**: Interpreted execution speed, GIL limitations.

### Node.js (The Agile Challenger)
- **Engine**: V8 (via Node.js + TypeScript).
- **Algorithm**: Identical Viterbi logic, strictly typed.
- **Optimizations**:
  - **Typed Arrays**: `Float32Array` for cost tables to reduce GC pressure.
  - **BMP Optimization**: Direct UTF-16 code unit access (`text.charCodeAt(i)`) instead of array spreading.
  - **JIT Compilation**: V8 optimizes hot loops effectively.

### C# (.NET) (The Heavyweight)
- **Engine**: .NET 10.0 (CoreCLR).
- **Algorithm**: Identical Viterbi logic, strongly typed.
- **Optimizations**:
  - **Compiled Performance**: High-performance JIT compilation producing optimized native code.
  - **Memory Efficiency**: Low allocation overhead for core logic.
  - **Parallelism**: Uses `Parallel.For` to distribute workload across cores.

### WebAssembly (The Portable Warrior)
- **Engine**: AssemblyScript (compiled to WASM) running on V8.
- **Algorithm**: Viterbi logic using linear memory.
- **Optimizations**:
  - **Strict Types**: Uses `i32` and `f32` exclusively.
  - **Portability**: Can run in Node.js, Browsers, and other WASM runtimes.

### Rust (The Native Speedster)
- **Engine**: Native Binary (LLVM compiled).
- **Algorithm**: Viterbi logic with Rayon parallelism and zero-copy string handling.
- **Optimizations**:
  - **Zero-Copy Slicing**: Works directly on UTF-8 byte slices (`&str`) without decoding to `char` arrays.
  - **Memory Efficiency**: Minimal allocation during segmentation.
  - **Rayon**: Parallel iteration over lines.

## 2. The Battleground

- **Workload**: 1,000 lines of complex Khmer text (financial and news content).
- **Metric**: Throughput (Lines Per Second).
- **Environment**: Windows, Standard execution.

## 3. Battle Results

| Language          | Speed (Lines/sec) | Relative Performance |
|-------------------|-------------------|----------------------|
| Python            | ~618              | 1.0x (Baseline)      |
| WASM (AS)         | ~768              | 1.2x                 |
| Node.js           | ~1,031            | 1.7x                 |
| C# (Parallel)     | ~8,994            | 14.6x                |
| **Rust**          | **~25,966**       | **42.0x**            |

**WINNER**: **Rust** 🏆 🚀
**RUNNER-UP**: **C# (.NET)** 🥈

## 4. Optimization Journey

### Phase 1: Naive Port (Node.js)
The initial port to Node.js used `[...text]` to safely split the string into characters. While correct for Unicode surrogate pairs, this created a massive amount of temporary array objects.
*Result*: Node.js was only ~1.1x faster.

### Phase 2: "The BMP Realization" (Node.js)
Khmer characters reside in the Basic Multilingual Plane (BMP). This means 1 character almost always equals 1 UTF-16 code unit.
*Optimization*:
- Removed array spread.
- Accessed string indices directly (`text[i]`).
- Used `substring()` which is highly optimized in V8.
*Result*: Speed jumped to **2.0x** faster than Python.

### Phase 3: The Compiled Powerhouse (C#)
Porting to .NET 10.0 leveraged the raw power of the CLR with strong typing and direct memory access.
*Result*: A massive **5x** speedup.

### Phase 4: The WebAssembly Experiment
We compiled strict TypeScript to WebAssembly using AssemblyScript.
*Observations*:
- **Performance**: It beat Python (1.5x) but trailed Node.js.
- **The Bottleneck**: **String Crossing**. Passing strings between JavaScript (Host) and WASM (Guest) requires encoding/decoding and copying data.

### Phase 5: The Multi-Core Evolution (C# Parallel)
To fully utilize modern hardware, we updated the C# implementation to run in parallel.
*Result*: Speed jumped to **~7,900+ lines/sec**, a **15x** improvement.

### Phase 6: The Rust Redemption
The initial Rust implementation was faster than Python but lagged behind C#.
*The Fix*: **Byte-based Processing**. We rewrote the segmenter to iterate using `char_indices()`, replacing character-based lookups with direct byte-slice operations.
*Result*: Speed quadrupled to **~4,800 lines/sec**.

### Phase 7: The Zero-Copy Triumph
To take the crown, we eliminated the biggest remaining bottleneck: Memory Allocation.
*The Problem*: Returning a `Vec<String>` meant allocating a new heap string for *every single word* found.
*The Fix*: **Cow<'a, str>**.
We refactored the entire pipeline to use `Cow` (Clone-on-Write). The segmenter now returns references (`&str`) to the input string whenever possible. It only allocates when text repair is strictly necessary (removing zero-width spaces).
*Result*: **~25,966 lines/sec**. A staggering **42x** speedup over Python and **~3x** faster than the highly optimized C# version.

## 5. Conclusion

- **Rust** is the undisputed champion, leveraging zero-copy abstractions to achieve nearly raw-memory bandwidth speeds.
- **C# (.NET)** remains incredibly fast for a managed language, but the overhead of GC and string allocations prevents it from catching optimized Rust.
- **Node.js** and **WASM** serve their specific web niches well.
