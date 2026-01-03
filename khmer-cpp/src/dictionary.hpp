#pragma once

#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>
#include <fstream>
#include <cmath>
#include <iostream>
#include <algorithm>
#include <optional>
#include "robin_hood.h"

namespace khmer {

// Optimized Trie node using flat array for Khmer codepoints
// Khmer Unicode ranges:
// - Main Khmer: 0x1780-0x17FF (128 values)
// - Khmer Symbols: 0x19E0-0x19FF (32 values)
struct TrieNode {
    // Flat array for main Khmer range (0x1780-0x17FF) = 128 slots
    TrieNode* khmer_children[128] = {nullptr};
    // Fallback map for non-Khmer characters (ASCII, symbols, etc.) - using robin_hood for speed
    robin_hood::unordered_flat_map<char32_t, TrieNode*> other_children;
    bool is_word = false;
    float cost = 0.0f;

    ~TrieNode() {
        for (int i = 0; i < 128; ++i) {
            delete khmer_children[i];
        }
        for (auto& [_, child] : other_children) {
            delete child;
        }
    }

    inline TrieNode* get_child(char32_t cp) const {
        // Fast path: Khmer main range
        if (cp >= 0x1780 && cp <= 0x17FF) {
            return khmer_children[cp - 0x1780];
        }
        // Fallback for other characters
        auto it = other_children.find(cp);
        return it != other_children.end() ? it->second : nullptr;
    }

    inline TrieNode* get_or_create_child(char32_t cp) {
        // Fast path: Khmer main range
        if (cp >= 0x1780 && cp <= 0x17FF) {
            size_t idx = cp - 0x1780;
            if (!khmer_children[idx]) {
                khmer_children[idx] = new TrieNode();
            }
            return khmer_children[idx];
        }
        // Fallback for other characters
        auto it = other_children.find(cp);
        if (it != other_children.end()) return it->second;
        TrieNode* node = new TrieNode();
        other_children[cp] = node;
        return node;
    }
};

class Dictionary {
public:
    size_t max_word_length;  // in codepoints
    float default_cost;
    float unknown_cost;

    Dictionary();
    ~Dictionary();

    // Non-copyable due to trie ownership
    Dictionary(const Dictionary&) = delete;
    Dictionary& operator=(const Dictionary&) = delete;

    // Load dictionary and frequencies
    void load(const std::string& dict_path, const std::string& freq_path);

    // Trie-based lookup: returns cost if found, nullopt otherwise
    // Uses codepoint array for zero-allocation lookup
    // Marked as hot path for aggressive optimization
    #if defined(__GNUC__) || defined(__clang__)
    __attribute__((hot))
    #endif
    inline std::optional<float> lookup_codepoints(const char32_t* cps, size_t start, size_t end) const {
        TrieNode* node = trie_;
        for (size_t i = start; i < end; ++i) {
            node = node->get_child(cps[i]);
            if (!node) return std::nullopt;
        }
        return node->is_word ? std::optional<float>(node->cost) : std::nullopt;
    }

    // String-based lookup (for non-hot paths)
    bool contains(std::string_view word) const {
        return word_set_.count(std::string(word)) > 0;
    }

    float get_word_cost(std::string_view word) const {
        auto it = word_costs_.find(std::string(word));
        if (it != word_costs_.end()) return it->second;
        if (word_set_.count(std::string(word))) return default_cost;
        return unknown_cost;
    }

private:
    TrieNode* trie_;
    robin_hood::unordered_flat_set<std::string> word_set_;
    robin_hood::unordered_flat_map<std::string, float> word_costs_;

    void load_words(const std::string& path);
    void calculate_costs(const std::string& path);
    void build_trie();
    void insert_into_trie(const std::string& word, float cost);
    robin_hood::unordered_flat_set<std::string> generate_variants(const std::string& word);
};

} // namespace khmer
