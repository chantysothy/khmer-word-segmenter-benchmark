# cython: language_level=3
# cython: boundscheck=False
# cython: wraparound=False
# cython: cdivision=True

import os
import math
import json
import numpy as np
cimport numpy as np
from libc.math cimport log10, INFINITY
from cpython cimport PyUnicode_READ_CHAR, PyUnicode_GET_LENGTH

# Type definitions
ctypedef np.float32_t COST_t
ctypedef np.int32_t INT_t

# Khmer Unicode constants
DEF KHMER_START = 0x1780
DEF KHMER_END = 0x17FF
DEF KHMER_RANGE = 128  # 0x17FF - 0x1780 + 1

DEF CONSONANT_START = 0x1780
DEF CONSONANT_END = 0x17A2
DEF INDEP_VOWEL_START = 0x17A3
DEF INDEP_VOWEL_END = 0x17B3
DEF DEP_VOWEL_START = 0x17B6
DEF DEP_VOWEL_END = 0x17C5
DEF SIGN_START = 0x17C6
DEF SIGN_END = 0x17D1
DEF COENG = 0x17D2
DEF SIGN_D3 = 0x17D3
DEF SIGN_DD = 0x17DD

DEF PUNCT_START = 0x17D4
DEF PUNCT_END = 0x17DA
DEF CURRENCY_RIEL = 0x17DB

DEF DIGIT_ASCII_START = 0x30
DEF DIGIT_ASCII_END = 0x39
DEF DIGIT_KHMER_START = 0x17E0
DEF DIGIT_KHMER_END = 0x17E9

DEF ZWS = 0x200B


# Trie node for dictionary lookup
cdef class TrieNode:
    cdef:
        public object khmer_children  # StaticArray for Khmer range
        public dict other_children
        public bint is_word
        public float cost

    def __init__(self):
        self.khmer_children = None
        self.other_children = None
        self.is_word = False
        self.cost = 0.0

    cdef TrieNode get_child(self, int char_code):
        cdef int idx
        if KHMER_START <= char_code <= KHMER_END:
            if self.khmer_children is None:
                return None
            idx = char_code - KHMER_START
            return <TrieNode>self.khmer_children[idx]
        if self.other_children is None:
            return None
        return self.other_children.get(char_code)

    cdef TrieNode get_or_create_child(self, int char_code):
        cdef int idx
        cdef TrieNode child
        if KHMER_START <= char_code <= KHMER_END:
            if self.khmer_children is None:
                self.khmer_children = [None] * KHMER_RANGE
            idx = char_code - KHMER_START
            if self.khmer_children[idx] is None:
                self.khmer_children[idx] = TrieNode()
            return <TrieNode>self.khmer_children[idx]
        if self.other_children is None:
            self.other_children = {}
        if char_code not in self.other_children:
            self.other_children[char_code] = TrieNode()
        return <TrieNode>self.other_children[char_code]


# Fast inline checks
cdef inline bint is_khmer_char(int code) noexcept nogil:
    return (KHMER_START <= code <= KHMER_END) or (0x19E0 <= code <= 0x19FF)

cdef inline bint is_consonant(int code) noexcept nogil:
    return CONSONANT_START <= code <= CONSONANT_END

cdef inline bint is_dep_vowel(int code) noexcept nogil:
    return DEP_VOWEL_START <= code <= DEP_VOWEL_END

cdef inline bint is_sign(int code) noexcept nogil:
    return (SIGN_START <= code <= SIGN_END) or code == SIGN_D3 or code == SIGN_DD

cdef inline bint is_coeng(int code) noexcept nogil:
    return code == COENG

cdef inline bint is_digit(int code) noexcept nogil:
    return (DIGIT_ASCII_START <= code <= DIGIT_ASCII_END) or (DIGIT_KHMER_START <= code <= DIGIT_KHMER_END)

cdef inline bint is_separator(int code) noexcept nogil:
    if PUNCT_START <= code <= PUNCT_END:
        return True
    if code == CURRENCY_RIEL:
        return True
    # ASCII separators
    if code < 128:
        if code == ord('!') or code == ord('?') or code == ord('.') or \
           code == ord(',') or code == ord(';') or code == ord(':') or \
           code == ord('"') or code == ord("'") or code == ord('(') or \
           code == ord(')') or code == ord('[') or code == ord(']') or \
           code == ord('{') or code == ord('}') or code == ord('-') or \
           code == ord('/') or code == ord(' ') or code == ord('$') or code == ord('%'):
            return True
    return False

cdef inline bint is_currency(int code) noexcept nogil:
    return code == ord('$') or code == CURRENCY_RIEL or code == 0x20AC or code == 0xA3 or code == 0xA5


# Valid single-word character codes (pre-computed set)
cdef set VALID_SINGLE_CODES = set()
for c in ['ក', 'ខ', 'គ', 'ង', 'ច', 'ឆ', 'ញ', 'ដ', 'ត', 'ទ', 'ព', 'រ', 'ល', 'ស', 'ឡ',
          'ឬ', 'ឮ', 'ឪ', 'ឯ', 'ឱ', 'ឦ', 'ឧ', 'ឳ']:
    VALID_SINGLE_CODES.add(ord(c))


cdef class FastKhmerSegmenter:
    cdef:
        TrieNode trie
        set words
        dict word_costs
        int max_word_length
        float default_cost
        float unknown_cost
        np.ndarray dp_cost
        np.ndarray dp_parent

    def __init__(self, str dictionary_path, str frequency_path="khmer_word_frequencies.json"):
        self.trie = TrieNode()
        self.words = set()
        self.word_costs = {}
        self.max_word_length = 0
        self.default_cost = 10.0
        self.unknown_cost = 20.0

        # Pre-allocate DP buffers
        self.dp_cost = np.empty(1024, dtype=np.float32)
        self.dp_parent = np.empty(1024, dtype=np.int32)

        self._load_dictionary(dictionary_path)
        self._load_frequencies(frequency_path)
        self._build_trie()

    def _load_dictionary(self, str path):
        if not os.path.exists(path):
            raise FileNotFoundError(f"Dictionary not found at {path}")

        cdef set valid_single = set(['ក', 'ខ', 'គ', 'ង', 'ច', 'ឆ', 'ញ', 'ដ', 'ត', 'ទ', 'ព', 'រ', 'ល', 'ស', 'ឡ',
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

        # Filter compound words with ឬ, ៗ, and starting with Coeng
        cdef set to_remove = set()
        for word in self.words:
            if "ឬ" in word and len(word) > 1:
                if word.startswith("ឬ"):
                    suffix = word[1:]
                    if suffix in self.words:
                        to_remove.add(word)
                elif word.endswith("ឬ"):
                    prefix = word[:-1]
                    if prefix in self.words:
                        to_remove.add(word)
                else:
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

        if "ៗ" in self.words:
            self.words.remove("ៗ")

        self.max_word_length = max(len(w) for w in self.words) if self.words else 0
        print(f"Loaded {len(self.words)} words. Max length: {self.max_word_length}")

    def _load_frequencies(self, str path):
        if not os.path.exists(path):
            print(f"Frequency file not found. Using defaults.")
            return

        cdef dict data
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        cdef float min_freq_floor = 5.0
        cdef float total_tokens = 0.0
        cdef dict effective_counts = {}

        for word, count in data.items():
            eff = max(float(count), min_freq_floor)
            effective_counts[word] = eff
            total_tokens += eff

        if total_tokens > 0:
            min_prob = min_freq_floor / total_tokens
            self.default_cost = -log10(min_prob)
            self.unknown_cost = self.default_cost + 5.0

            for word in self.words:
                if word in effective_counts:
                    count = effective_counts[word]
                    prob = count / total_tokens
                    if prob > 0:
                        self.word_costs[word] = -log10(prob)
                    else:
                        self.word_costs[word] = self.default_cost
                else:
                    self.word_costs[word] = self.default_cost

        print(f"Loaded frequencies for {len(self.word_costs)} words.")
        print(f"Default cost: {self.default_cost:.2f}, Unknown cost: {self.unknown_cost:.2f}")

    def _build_trie(self):
        cdef str word
        cdef float cost
        cdef int i, code
        cdef TrieNode node

        for word in self.words:
            cost = self.word_costs.get(word, self.default_cost)
            node = self.trie
            for i in range(len(word)):
                code = ord(word[i])
                node = node.get_or_create_child(code)
            node.is_word = True
            node.cost = cost

    cdef float lookup_range(self, str text, int start, int end):
        cdef TrieNode node = self.trie
        cdef int i, code
        for i in range(start, end):
            code = ord(text[i])
            node = node.get_child(code)
            if node is None:
                return -1.0
        return node.cost if node.is_word else -1.0

    cdef int get_cluster_length(self, str text, int start):
        cdef int n = len(text)
        if start >= n:
            return 0

        cdef int i = start
        cdef int code = ord(text[i])

        # Must start with Consonant or Independent Vowel
        if not (CONSONANT_START <= code <= INDEP_VOWEL_END):
            return 1

        i += 1
        while i < n:
            code = ord(text[i])
            if is_coeng(code):
                if i + 1 < n and is_consonant(ord(text[i + 1])):
                    i += 2
                    continue
                break
            if is_dep_vowel(code) or is_sign(code):
                i += 1
                continue
            break

        return i - start

    cdef int get_number_length(self, str text, int start):
        cdef int n = len(text)
        cdef int i = start
        cdef int code

        if not is_digit(ord(text[i])):
            return 0
        i += 1

        while i < n:
            code = ord(text[i])
            if is_digit(code):
                i += 1
                continue
            if code == ord(',') or code == ord('.') or code == ord(' '):
                if i + 1 < n and is_digit(ord(text[i + 1])):
                    i += 2
                    continue
            break

        return i - start

    cpdef list segment(self, str text):
        # Strip ZWS
        if '\u200b' in text:
            text = text.replace('\u200b', '')

        cdef int n = len(text)
        if n == 0:
            return []

        # Ensure buffers are large enough
        if self.dp_cost.shape[0] < n + 1:
            self.dp_cost = np.empty(n + 128, dtype=np.float32)
            self.dp_parent = np.empty(n + 128, dtype=np.int32)

        cdef COST_t[:] dp_cost = self.dp_cost
        cdef INT_t[:] dp_parent = self.dp_parent

        cdef int i, j
        for i in range(n + 1):
            dp_cost[i] = INFINITY
            dp_parent[i] = -1
        dp_cost[0] = 0.0

        cdef float current_cost, new_cost, word_cost, step_cost
        cdef int code, prev_code, next_idx, cluster_len, num_len, max_len
        cdef bint force_repair

        max_len = self.max_word_length

        for i in range(n):
            if dp_cost[i] == INFINITY:
                continue

            current_cost = dp_cost[i]
            code = ord(text[i])

            # Repair mode checks
            force_repair = False

            if i > 0 and ord(text[i - 1]) == COENG:
                force_repair = True
            if is_dep_vowel(code):
                force_repair = True

            if force_repair:
                next_idx = i + 1
                new_cost = current_cost + self.unknown_cost + 50.0
                if next_idx <= n and new_cost < dp_cost[next_idx]:
                    dp_cost[next_idx] = new_cost
                    dp_parent[next_idx] = i
                continue

            # 1. Number/Digit
            if is_digit(code) or (is_currency(code) and i + 1 < n and is_digit(ord(text[i + 1]))):
                num_len = self.get_number_length(text, i)
                next_idx = i + num_len
                step_cost = 1.0
                if next_idx <= n and current_cost + step_cost < dp_cost[next_idx]:
                    dp_cost[next_idx] = current_cost + step_cost
                    dp_parent[next_idx] = i

            # 2. Separators
            elif is_separator(code):
                next_idx = i + 1
                step_cost = 0.1
                if next_idx <= n and current_cost + step_cost < dp_cost[next_idx]:
                    dp_cost[next_idx] = current_cost + step_cost
                    dp_parent[next_idx] = i

            # 3. Dictionary lookup with Trie
            for j in range(i + 1, min(n + 1, i + max_len + 1)):
                word_cost = self.lookup_range(text, i, j)
                if word_cost >= 0:
                    new_cost = current_cost + word_cost
                    if new_cost < dp_cost[j]:
                        dp_cost[j] = new_cost
                        dp_parent[j] = i

            # 4. Unknown cluster fallback
            if is_khmer_char(code):
                cluster_len = self.get_cluster_length(text, i)
                step_cost = self.unknown_cost
                if cluster_len == 1 and code not in VALID_SINGLE_CODES:
                    step_cost += 10.0
                next_idx = i + cluster_len
                if next_idx <= n and current_cost + step_cost < dp_cost[next_idx]:
                    dp_cost[next_idx] = current_cost + step_cost
                    dp_parent[next_idx] = i
            else:
                next_idx = i + 1
                step_cost = self.unknown_cost
                if next_idx <= n and current_cost + step_cost < dp_cost[next_idx]:
                    dp_cost[next_idx] = current_cost + step_cost
                    dp_parent[next_idx] = i

        # Backtrack
        cdef list segments = []
        cdef int curr = n
        cdef int prev

        while curr > 0:
            prev = dp_parent[curr]
            if prev == -1:
                break
            segments.append(text[prev:curr])
            curr = prev

        segments.reverse()
        return segments
