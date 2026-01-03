#include "dictionary.hpp"
#include "constants.hpp"
#include <iostream>
#include <fstream>
#include <sstream>
#include <cmath>
#include <algorithm>
#include <vector>

namespace khmer {

// Helper: Simple JSON parser for flat string->number map
robin_hood::unordered_flat_map<std::string, float> parse_frequency_json(const std::string& path) {
    robin_hood::unordered_flat_map<std::string, float> data;
    std::ifstream file(path);
    if (!file.is_open()) return data;

    std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());

    size_t pos = 0;
    while (pos < content.length()) {
        size_t quote_start = content.find('"', pos);
        if (quote_start == std::string::npos) break;

        size_t quote_end = content.find('"', quote_start + 1);
        if (quote_end == std::string::npos) break;

        std::string key = content.substr(quote_start + 1, quote_end - quote_start - 1);

        size_t colon = content.find(':', quote_end);
        if (colon == std::string::npos) break;

        size_t value_end = content.find_first_of(",}", colon);
        if (value_end == std::string::npos) break;

        std::string val_str = content.substr(colon + 1, value_end - colon - 1);
        try {
            float val = std::stof(val_str);
            data[key] = val;
        } catch (...) {}

        pos = value_end + 1;
    }
    return data;
}

Dictionary::Dictionary() : max_word_length(0), default_cost(10.0f), unknown_cost(20.0f) {
    trie_ = new TrieNode();
}

Dictionary::~Dictionary() {
    delete trie_;
}

void Dictionary::load(const std::string& dict_path, const std::string& freq_path) {
    load_words(dict_path);
    calculate_costs(freq_path);
    build_trie();
}

void Dictionary::load_words(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        std::cerr << "Error: Could not open dictionary file: " << path << std::endl;
        return;
    }

    std::string line;
    std::vector<std::string> words_to_remove;

    while (std::getline(file, line)) {
        // Trim
        line.erase(0, line.find_first_not_of(" \t\r\n"));
        line.erase(line.find_last_not_of(" \t\r\n") + 1);

        if (line.empty()) continue;

        // Filter single chars
        std::u32string u32 = to_u32(line);
        if (u32.length() == 1) {
            if (!is_valid_single_word(u32[0])) continue;
        }

        word_set_.insert(line);
        if (u32.length() > max_word_length) max_word_length = u32.length();

        // Variants
        auto variants = generate_variants(line);
        for (const auto& v : variants) {
            std::u32string v32 = to_u32(v);
            word_set_.insert(v);
            if (v32.length() > max_word_length) max_word_length = v32.length();
        }
    }

    // Filter Logic
    for (const auto& word : word_set_) {
        std::u32string w32 = to_u32(word);

        bool contains_or = false;
        for (char32_t c : w32) {
            if (c == 0x17AC) { contains_or = true; break; }
        }

        if (contains_or && w32.length() > 1) {
            if (w32[0] == 0x17AC) {
                std::u32string suffix = w32.substr(1);
                if (word_set_.count(to_utf8(suffix))) words_to_remove.push_back(word);
            }
            else if (w32.back() == 0x17AC) {
                std::u32string prefix = w32.substr(0, w32.length() - 1);
                if (word_set_.count(to_utf8(prefix))) words_to_remove.push_back(word);
            }
            else {
                bool all_parts_exist = true;
                size_t start = 0;
                for (size_t i = 0; i < w32.length(); ++i) {
                    if (w32[i] == 0x17AC) {
                        if (i > start) {
                            std::u32string part = w32.substr(start, i - start);
                            if (!word_set_.count(to_utf8(part))) {
                                all_parts_exist = false;
                                break;
                            }
                        }
                        start = i + 1;
                    }
                }
                if (start < w32.length()) {
                    std::u32string part = w32.substr(start);
                    if (!word_set_.count(to_utf8(part))) all_parts_exist = false;
                }
                if (all_parts_exist) words_to_remove.push_back(word);
            }
        }

        // Contains repetition mark
        for (char32_t c : w32) {
            if (c == 0x17D7) { words_to_remove.push_back(word); break; }
        }

        // Starts with Coeng
        if (w32.length() > 0 && w32[0] == 0x17D2) {
            words_to_remove.push_back(word);
        }
    }

    for (const auto& w : words_to_remove) {
        word_set_.erase(w);
    }
    word_set_.erase("ៗ");

    // Recalculate max length in codepoints
    max_word_length = 0;
    for (const auto& w : word_set_) {
        size_t len = to_u32(w).length();
        if (len > max_word_length) max_word_length = len;
    }

    std::cout << "Loaded " << word_set_.size() << " words. Max length: " << max_word_length << std::endl;
}

void Dictionary::calculate_costs(const std::string& path) {
    auto data = parse_frequency_json(path);
    if (data.empty()) {
        std::cout << "Frequency file empty or not found. Using defaults." << std::endl;
        return;
    }

    const float min_freq_floor = 5.0f;
    robin_hood::unordered_flat_map<std::string, float> effective_counts;
    double total_tokens = 0.0;

    for (const auto& [word, count] : data) {
        float eff = std::max(count, min_freq_floor);
        effective_counts[word] = eff;

        auto variants = generate_variants(word);
        for (const auto& v : variants) {
            if (effective_counts.find(v) == effective_counts.end()) {
                effective_counts[v] = eff;
            }
        }
        total_tokens += eff;
    }

    if (total_tokens > 0.0) {
        double min_prob = min_freq_floor / total_tokens;
        default_cost = static_cast<float>(-std::log10(min_prob));
        unknown_cost = default_cost + 5.0f;

        for (const auto& [word, count] : effective_counts) {
            if (word_set_.count(word)) {
                double prob = count / total_tokens;
                if (prob > 0.0) {
                    word_costs_[word] = static_cast<float>(-std::log10(prob));
                }
            }
        }
    }

    std::cout << "Loaded frequencies for " << word_costs_.size() << " words." << std::endl;
    std::cout << "Default cost: " << default_cost << ", Unknown cost: " << unknown_cost << std::endl;
}

void Dictionary::build_trie() {
    for (const auto& word : word_set_) {
        float cost = default_cost;
        auto it = word_costs_.find(word);
        if (it != word_costs_.end()) {
            cost = it->second;
        }
        insert_into_trie(word, cost);
    }
}

void Dictionary::insert_into_trie(const std::string& word, float cost) {
    std::u32string cps = to_u32(word);
    TrieNode* node = trie_;
    for (char32_t cp : cps) {
        node = node->get_or_create_child(cp);
    }
    node->is_word = true;
    node->cost = cost;
}

robin_hood::unordered_flat_set<std::string> Dictionary::generate_variants(const std::string& word) {
    robin_hood::unordered_flat_set<std::string> variants;

    std::u32string w32 = to_u32(word);

    // 1. Ta/Da Swapping (0x17D2 0x178F <-> 0x17D2 0x178D)
    std::u32string ta_sub = {0x17D2, 0x178F};
    std::u32string da_sub = {0x17D2, 0x178D};

    bool has_ta = false;
    for (size_t i = 0; i + 1 < w32.length(); ++i) {
        if (w32[i] == ta_sub[0] && w32[i+1] == ta_sub[1]) { has_ta = true; break; }
    }
    if (has_ta) {
        std::u32string copy = w32;
        for (size_t i = 0; i + 1 < copy.length(); ++i) {
            if (copy[i] == ta_sub[0] && copy[i+1] == ta_sub[1]) {
                copy[i+1] = da_sub[1];
            }
        }
        variants.insert(to_utf8(copy));
    }

    bool has_da = false;
    for (size_t i = 0; i + 1 < w32.length(); ++i) {
        if (w32[i] == da_sub[0] && w32[i+1] == da_sub[1]) { has_da = true; break; }
    }
    if (has_da) {
        std::u32string copy = w32;
        for (size_t i = 0; i + 1 < copy.length(); ++i) {
            if (copy[i] == da_sub[0] && copy[i+1] == da_sub[1]) {
                copy[i+1] = ta_sub[1];
            }
        }
        variants.insert(to_utf8(copy));
    }

    // 2. Coeng Ro Ordering
    std::vector<std::u32string> base_set;
    base_set.push_back(w32);
    for (const auto& v : variants) base_set.push_back(to_u32(v));

    char32_t coeng = 0x17D2;
    char32_t ro = 0x179A;

    for (const auto& current_w : base_set) {
        if (current_w.length() < 4) continue;

        // Pass 1: Ro+Other -> Other+Ro
        std::u32string new_w = current_w;
        bool modified = false;
        size_t i = 0;
        while (i + 3 < new_w.length()) {
            if (new_w[i] == coeng && new_w[i+1] == ro &&
                new_w[i+2] == coeng && new_w[i+3] != ro) {
                std::swap(new_w[i], new_w[i+2]);
                std::swap(new_w[i+1], new_w[i+3]);
                modified = true;
                i += 4;
            } else {
                i++;
            }
        }
        if (modified) variants.insert(to_utf8(new_w));

        // Pass 2: Other+Ro -> Ro+Other
        std::u32string new_w2 = current_w;
        bool modified2 = false;
        i = 0;
        while (i + 3 < new_w2.length()) {
            if (new_w2[i] == coeng && new_w2[i+1] != ro &&
                new_w2[i+2] == coeng && new_w2[i+3] == ro) {
                std::swap(new_w2[i], new_w2[i+2]);
                std::swap(new_w2[i+1], new_w2[i+3]);
                modified2 = true;
                i += 4;
            } else {
                i++;
            }
        }
        if (modified2) variants.insert(to_utf8(new_w2));
    }

    return variants;
}

} // namespace khmer
