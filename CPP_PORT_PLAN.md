# C++ Port Implementation Plan: `khmer-cpp`

## 1. Executive Summary
**Goal**: Create a C++ implementation of the Khmer Segmenter that rivals or exceeds the optimized Rust version (~25k lines/sec).

**Strategy**:
1.  **Zero-Copy**: Use `std::string_view` everywhere. Only allocate memory for the final output vector.
2.  **Parallelism**: Use OpenMP (`#pragma omp parallel for`) for line-by-line processing.
3.  **Memory Layout**: Use flat structures and avoid pointer chasing.

---

## 2. Architecture

### 2.1 Core Components
1.  **`Dictionary`**:
    -   Holds the map of words to costs (`float`).
    -   **Optimization**: Use a custom `IdentityHash` if keys are pre-hashed, or a fast string hasher (FNV-1a or MurmurHash3) to beat `std::hash`.
    -   Structure: `std::unordered_map<std::string, float>`.

2.  **`KhmerSegmenter`**:
    -   Input: `std::string_view`.
    -   Output: `std::vector<std::string_view>`.
    -   Logic: Viterbi algorithm using a `std::vector<DPNode>` where `DPNode` is a simple struct `{ float cost; int parent_idx; }`.

3.  **UTF-8 Handling**:
    -   C++ `std::string` is raw bytes. We must manually handle UTF-8 boundaries using bitwise checks (checking if byte `& 0xC0 != 0x80`).

### 2.2 Tech Stack
-   **Standard**: C++17 (for `string_view`, `filesystem`).
-   **Build System**: CMake or simple Makefile.
-   **Libraries**:
    -   `nlohmann/json`: For parsing frequencies (single header).
    -   `OpenMP`: For parallelism.

---

## 3. Implementation Steps

### Phase 1: Setup & Data Structures
- [ ] Create `khmer-cpp/` directory.
- [ ] Add `json.hpp` (vendor it for ease of use).
- [ ] Implement `Dictionary` class to load `.txt` and `.json`.

### Phase 2: Core Viterbi Engine
- [ ] Implement `is_khmer_char` and UTF-8 traversal helpers.
- [ ] Implement `segment_raw` using `std::string_view`.
- [ ] Implement DP logic with `std::vector` (avoiding raw `new/delete`).

### Phase 3: Heuristics & Repair
- [ ] Implement text repair (handling `\u200b` zero-width space).
- [ ] Implement number/currency detection logic.

### Phase 4: CLI & Parallelism
- [ ] Implement `main.cpp` with argument parsing.
- [ ] Add `OpenMP` pragmas for batch processing.
- [ ] Write benchmark timer.

---

## 4. Key Challenges

| Rust Concept | C++ Equivalent | Note |
| :--- | :--- | :--- |
| `&str` | `std::string_view` | Be careful of lifetime issues (dangling pointers). |
| `Cow<'a, str>` | `std::string` / `std::string_view` hybrid | C++ doesn't have a built-in COW type anymore. We'll return `std::vector<std::string>` for the final result to own the memory, OR specialized struct. |
| `Rayon` | `OpenMP` | `#pragma omp parallel for` is simpler but less flexible. |
| `FxHash` | Custom Hasher | `std::unordered_map` is often slow due to node allocation. We might stick to it for simplicity or use a flat map if needed. |
