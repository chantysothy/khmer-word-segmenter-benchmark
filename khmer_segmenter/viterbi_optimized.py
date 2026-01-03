"""
Optimized Khmer Word Segmenter using NumPy arrays and Trie lookup.
This is a pure Python version with significant optimizations.
For maximum performance, use viterbi_fast.pyx (Cython version).
"""

import os
import math
import json
import numpy as np
from multiprocessing import Pool, cpu_count
from functools import partial

# Character code constants
KHMER_START = 0x1780
KHMER_END = 0x17FF
KHMER_RANGE = KHMER_END - KHMER_START + 1

CONSONANT_START = 0x1780
CONSONANT_END = 0x17A2
INDEP_VOWEL_END = 0x17B3
DEP_VOWEL_START = 0x17B6
DEP_VOWEL_END = 0x17C5
SIGN_START = 0x17C6
SIGN_END = 0x17D1
COENG = 0x17D2
SIGN_D3 = 0x17D3
SIGN_DD = 0x17DD

PUNCT_START = 0x17D4
PUNCT_END = 0x17DA
CURRENCY_RIEL = 0x17DB

DIGIT_ASCII_START = 0x30
DIGIT_ASCII_END = 0x39
DIGIT_KHMER_START = 0x17E0
DIGIT_KHMER_END = 0x17E9

# Pre-computed valid single codes
VALID_SINGLE_CODES = set(ord(c) for c in
    ['ក', 'ខ', 'គ', 'ង', 'ច', 'ឆ', 'ញ', 'ដ', 'ត', 'ទ', 'ព', 'រ', 'ល', 'ស', 'ឡ',
     'ឬ', 'ឮ', 'ឪ', 'ឯ', 'ឱ', 'ឦ', 'ឧ', 'ឳ'])

# Pre-computed separator codes
SEPARATOR_CODES = set(ord(c) for c in '!?.,;:"\'()[]{}-/ $%')

# Currency codes
CURRENCY_CODES = {ord('$'), CURRENCY_RIEL, 0x20AC, 0xA3, 0xA5}


class TrieNode:
    __slots__ = ['khmer_children', 'other_children', 'is_word', 'cost']

    def __init__(self):
        self.khmer_children = None
        self.other_children = None
        self.is_word = False
        self.cost = 0.0

    def get_child(self, code):
        if KHMER_START <= code <= KHMER_END:
            if self.khmer_children is None:
                return None
            return self.khmer_children[code - KHMER_START]
        if self.other_children is None:
            return None
        return self.other_children.get(code)

    def get_or_create_child(self, code):
        if KHMER_START <= code <= KHMER_END:
            if self.khmer_children is None:
                self.khmer_children = [None] * KHMER_RANGE
            idx = code - KHMER_START
            if self.khmer_children[idx] is None:
                self.khmer_children[idx] = TrieNode()
            return self.khmer_children[idx]
        if self.other_children is None:
            self.other_children = {}
        if code not in self.other_children:
            self.other_children[code] = TrieNode()
        return self.other_children[code]


class OptimizedKhmerSegmenter:
    """
    High-performance Khmer word segmenter using:
    - Trie with flat array for O(1) Khmer character lookup
    - NumPy arrays for DP
    - Pre-computed character code lookups
    """

    def __init__(self, dictionary_path, frequency_path="khmer_word_frequencies.json"):
        self.trie = TrieNode()
        self.words = set()
        self.word_costs = {}
        self.max_word_length = 0
        self.default_cost = 10.0
        self.unknown_cost = 20.0

        # Pre-allocated DP buffers
        self._dp_cost = np.empty(1024, dtype=np.float32)
        self._dp_parent = np.empty(1024, dtype=np.int32)

        self._load_dictionary(dictionary_path)
        self._load_frequencies(frequency_path)
        self._build_trie()

    def _load_dictionary(self, path):
        if not os.path.exists(path):
            raise FileNotFoundError(f"Dictionary not found at {path}")

        valid_single = set(['ក', 'ខ', 'គ', 'ង', 'ច', 'ឆ', 'ញ', 'ដ', 'ត', 'ទ', 'ព', 'រ', 'ល', 'ស', 'ឡ',
                           'ឬ', 'ឮ', 'ឪ', 'ឯ', 'ឱ', 'ឦ', 'ឧ', 'ឳ'])

        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                word = line.strip()
                if not word:
                    continue
                if len(word) == 1 and word not in valid_single:
                    continue
                self.words.add(word)
                if len(word) > self.max_word_length:
                    self.max_word_length = len(word)

        # Filter compound words
        to_remove = set()
        for word in self.words:
            if "ឬ" in word and len(word) > 1:
                if word.startswith("ឬ") and word[1:] in self.words:
                    to_remove.add(word)
                elif word.endswith("ឬ") and word[:-1] in self.words:
                    to_remove.add(word)
                elif "ឬ" in word[1:-1]:
                    parts = word.split("ឬ")
                    if all((p in self.words or p == "") for p in parts):
                        to_remove.add(word)
            if 'ៗ' in word:
                to_remove.add(word)
            if word.startswith('\u17D2'):
                to_remove.add(word)

        if to_remove:
            print(f"Removing {len(to_remove)} invalid words.")
            self.words -= to_remove

        self.words.discard("ៗ")
        self.max_word_length = max((len(w) for w in self.words), default=0)
        print(f"Loaded {len(self.words)} words. Max length: {self.max_word_length}")

    def _load_frequencies(self, path):
        if not os.path.exists(path):
            print("Frequency file not found. Using defaults.")
            return

        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        min_freq_floor = 5.0
        total_tokens = 0.0
        effective_counts = {}

        for word, count in data.items():
            eff = max(float(count), min_freq_floor)
            effective_counts[word] = eff
            total_tokens += eff

        if total_tokens > 0:
            min_prob = min_freq_floor / total_tokens
            self.default_cost = -math.log10(min_prob)
            self.unknown_cost = self.default_cost + 5.0

            for word in self.words:
                if word in effective_counts:
                    prob = effective_counts[word] / total_tokens
                    self.word_costs[word] = -math.log10(prob) if prob > 0 else self.default_cost
                else:
                    self.word_costs[word] = self.default_cost

        print(f"Loaded frequencies for {len(self.word_costs)} words.")
        print(f"Default cost: {self.default_cost:.2f}, Unknown cost: {self.unknown_cost:.2f}")

    def _build_trie(self):
        for word in self.words:
            cost = self.word_costs.get(word, self.default_cost)
            node = self.trie
            for ch in word:
                code = ord(ch)
                node = node.get_or_create_child(code)
            node.is_word = True
            node.cost = cost

    def _lookup_range(self, text, start, end):
        """Lookup text[start:end] in trie - zero allocation."""
        node = self.trie
        for i in range(start, end):
            code = ord(text[i])
            node = node.get_child(code)
            if node is None:
                return -1.0
        return node.cost if node.is_word else -1.0

    def _get_cluster_length(self, text, start):
        n = len(text)
        if start >= n:
            return 0

        i = start
        code = ord(text[i])

        # Must start with Consonant or Independent Vowel
        if not (CONSONANT_START <= code <= INDEP_VOWEL_END):
            return 1

        i += 1
        while i < n:
            code = ord(text[i])
            if code == COENG:
                if i + 1 < n and CONSONANT_START <= ord(text[i + 1]) <= CONSONANT_END:
                    i += 2
                    continue
                break
            if (DEP_VOWEL_START <= code <= DEP_VOWEL_END) or \
               (SIGN_START <= code <= SIGN_END) or code == SIGN_D3 or code == SIGN_DD:
                i += 1
                continue
            break

        return i - start

    def _get_number_length(self, text, start):
        n = len(text)
        i = start
        code = ord(text[i])

        if not ((DIGIT_ASCII_START <= code <= DIGIT_ASCII_END) or
                (DIGIT_KHMER_START <= code <= DIGIT_KHMER_END)):
            return 0
        i += 1

        while i < n:
            code = ord(text[i])
            if (DIGIT_ASCII_START <= code <= DIGIT_ASCII_END) or \
               (DIGIT_KHMER_START <= code <= DIGIT_KHMER_END):
                i += 1
                continue
            if code in (ord(','), ord('.'), ord(' ')):
                if i + 1 < n:
                    next_code = ord(text[i + 1])
                    if (DIGIT_ASCII_START <= next_code <= DIGIT_ASCII_END) or \
                       (DIGIT_KHMER_START <= next_code <= DIGIT_KHMER_END):
                        i += 2
                        continue
            break

        return i - start

    def segment(self, text):
        """Segment text using optimized Viterbi algorithm."""
        # Strip ZWS
        if '\u200b' in text:
            text = text.replace('\u200b', '')

        n = len(text)
        if n == 0:
            return []

        # Ensure buffers are large enough
        if len(self._dp_cost) < n + 1:
            self._dp_cost = np.empty(n + 128, dtype=np.float32)
            self._dp_parent = np.empty(n + 128, dtype=np.int32)

        dp_cost = self._dp_cost
        dp_parent = self._dp_parent

        dp_cost[:n + 1] = np.inf
        dp_parent[:n + 1] = -1
        dp_cost[0] = 0.0

        max_len = self.max_word_length
        unknown_cost = self.unknown_cost

        for i in range(n):
            if dp_cost[i] == np.inf:
                continue

            current_cost = dp_cost[i]
            code = ord(text[i])

            # Repair mode checks
            force_repair = False
            if i > 0 and ord(text[i - 1]) == COENG:
                force_repair = True
            if DEP_VOWEL_START <= code <= DEP_VOWEL_END:
                force_repair = True

            if force_repair:
                next_idx = i + 1
                new_cost = current_cost + unknown_cost + 50.0
                if next_idx <= n and new_cost < dp_cost[next_idx]:
                    dp_cost[next_idx] = new_cost
                    dp_parent[next_idx] = i
                continue

            # 1. Number/Digit
            is_digit_char = (DIGIT_ASCII_START <= code <= DIGIT_ASCII_END) or \
                           (DIGIT_KHMER_START <= code <= DIGIT_KHMER_END)
            is_currency_start = code in CURRENCY_CODES and i + 1 < n and \
                              ((DIGIT_ASCII_START <= ord(text[i + 1]) <= DIGIT_ASCII_END) or
                               (DIGIT_KHMER_START <= ord(text[i + 1]) <= DIGIT_KHMER_END))

            if is_digit_char or is_currency_start:
                num_len = self._get_number_length(text, i)
                next_idx = i + num_len
                if next_idx <= n and current_cost + 1.0 < dp_cost[next_idx]:
                    dp_cost[next_idx] = current_cost + 1.0
                    dp_parent[next_idx] = i

            # 2. Separators
            elif (PUNCT_START <= code <= PUNCT_END) or code == CURRENCY_RIEL or \
                 (code < 128 and code in SEPARATOR_CODES):
                next_idx = i + 1
                if next_idx <= n and current_cost + 0.1 < dp_cost[next_idx]:
                    dp_cost[next_idx] = current_cost + 0.1
                    dp_parent[next_idx] = i

            # 3. Dictionary lookup with Trie
            end_limit = min(n + 1, i + max_len + 1)
            for j in range(i + 1, end_limit):
                word_cost = self._lookup_range(text, i, j)
                if word_cost >= 0:
                    new_cost = current_cost + word_cost
                    if new_cost < dp_cost[j]:
                        dp_cost[j] = new_cost
                        dp_parent[j] = i

            # 4. Unknown cluster fallback
            is_khmer = (KHMER_START <= code <= KHMER_END) or (0x19E0 <= code <= 0x19FF)
            if is_khmer:
                cluster_len = self._get_cluster_length(text, i)
                step_cost = unknown_cost
                if cluster_len == 1 and code not in VALID_SINGLE_CODES:
                    step_cost += 10.0
                next_idx = i + cluster_len
                if next_idx <= n and current_cost + step_cost < dp_cost[next_idx]:
                    dp_cost[next_idx] = current_cost + step_cost
                    dp_parent[next_idx] = i
            else:
                next_idx = i + 1
                if next_idx <= n and current_cost + unknown_cost < dp_cost[next_idx]:
                    dp_cost[next_idx] = current_cost + unknown_cost
                    dp_parent[next_idx] = i

        # Backtrack
        segments = []
        curr = n
        while curr > 0:
            prev = dp_parent[curr]
            if prev == -1:
                break
            segments.append(text[prev:curr])
            curr = prev

        segments.reverse()
        return segments


# Global segmenter for multiprocessing
_global_segmenter = None


def _init_worker(dict_path, freq_path):
    global _global_segmenter
    _global_segmenter = OptimizedKhmerSegmenter(dict_path, freq_path)


def _segment_line(line):
    return _global_segmenter.segment(line)


def segment_parallel(lines, dict_path, freq_path, num_workers=None):
    """
    Segment multiple lines in parallel using multiprocessing.

    Args:
        lines: List of text lines to segment
        dict_path: Path to dictionary file
        freq_path: Path to frequency file
        num_workers: Number of worker processes (default: CPU count)

    Returns:
        List of segmented results (each is a list of segments)
    """
    if num_workers is None:
        num_workers = min(cpu_count(), 8)  # Cap at 8 workers

    with Pool(num_workers, initializer=_init_worker,
              initargs=(dict_path, freq_path)) as pool:
        results = pool.map(_segment_line, lines, chunksize=max(1, len(lines) // (num_workers * 4)))

    return results


if __name__ == "__main__":
    import sys
    import time

    dict_file = "data/khmer_dictionary_words.txt"
    freq_file = "data/khmer_word_frequencies.json"

    if len(sys.argv) > 1:
        dict_file = sys.argv[1]
    if len(sys.argv) > 2:
        freq_file = sys.argv[2]

    print("Loading optimized segmenter...")
    start = time.time()
    seg = OptimizedKhmerSegmenter(dict_file, freq_file)
    print(f"Load time: {time.time() - start:.2f}s")

    # Test
    texts = [
        "កងកម្លាំងរក្សាសន្តិសុខ",
        "ខ្ញុំទៅសាលារៀន",
        "ការអភិវឌ្ឍ"
    ]

    for text in texts:
        result = seg.segment(text)
        print(f"Input: {text}")
        print(f"Output: {' | '.join(result)}")
        print()
