#include "segmenter.hpp"
#include "constants.hpp"
#include <limits>
#include <algorithm>
#include <iostream>

namespace khmer {

// UTF-8 to codepoint conversion
static void utf8_to_codepoints(std::string_view text, std::vector<char32_t>& out) {
    out.clear();
    out.reserve(text.size());
    size_t i = 0;
    while (i < text.length()) {
        auto [cp, len] = get_char_at(text, i);
        if (len == 0) { i++; continue; }
        out.push_back(cp);
        i += len;
    }
}

// Remove Zero-Width Space from string
static std::string remove_zwsp(std::string_view text) {
    std::string out;
    out.reserve(text.size());
    size_t start = 0;
    while (true) {
        size_t pos = text.find("\xE2\x80\x8B", start);
        if (pos == std::string_view::npos) {
            out.append(text.substr(start));
            break;
        }
        out.append(text.substr(start, pos - start));
        start = pos + 3;
    }
    return out;
}

static bool contains_zwsp(std::string_view text) {
    return text.find("\xE2\x80\x8B") != std::string_view::npos;
}

KhmerSegmenter::KhmerSegmenter(const Dictionary& dict)
    : dictionary(dict)
{
}

std::vector<std::string> KhmerSegmenter::segment(std::string_view text) const {
    std::string cleaned;
    std::string_view text_to_process = text;

    if (contains_zwsp(text)) {
        cleaned = remove_zwsp(text);
        text_to_process = cleaned;
    }

    if (text_to_process.empty()) {
        return {};
    }

    // Convert to codepoints (thread-local allocation)
    std::vector<char32_t> cps_buffer;
    cps_buffer.reserve(text_to_process.size());
    utf8_to_codepoints(text_to_process, cps_buffer);

    if (cps_buffer.empty()) {
        return {};
    }

    // Run segmentation
    auto segments = segment_codepoints(cps_buffer.data(), cps_buffer.size());

    // Post-processing
    segments = snap_invalid_single_consonants(std::move(segments));
    segments = apply_heuristics(std::move(segments));
    segments = post_process_unknowns(std::move(segments));

    return segments;
}

std::vector<std::string> KhmerSegmenter::segment_codepoints(const char32_t* cps, size_t n) const {
    // Thread-local DP buffers for thread-safety
    std::vector<float> dp_cost(n + 1, std::numeric_limits<float>::infinity());
    std::vector<int32_t> dp_parent(n + 1, -1);
    dp_cost[0] = 0.0f;

    // Cache frequently used values
    size_t max_word_len = dictionary.max_word_length;
    float unknown_cost = dictionary.unknown_cost;

    for (size_t i = 0; i < n; ++i) {
        if (std::isinf(dp_cost[i])) continue;

        float current_cost = dp_cost[i];
        char32_t char_i = cps[i];

        // --- Constraint Checks & Fallback (Repair Mode) ---
        bool force_repair = false;

        // 1. Previous char was Coeng (U+17D2)
        if (i > 0 && cps[i - 1] == 0x17D2) {
            force_repair = true;
        }

        // 2. Current char is Dependent Vowel
        if (is_dependent_vowel(char_i)) {
            force_repair = true;
        }

        if (force_repair) {
            size_t next_idx = i + 1;
            float new_cost = current_cost + unknown_cost + 50.0f;
            if (next_idx <= n && new_cost < dp_cost[next_idx]) {
                dp_cost[next_idx] = new_cost;
                dp_parent[next_idx] = static_cast<int32_t>(i);
            }
            continue;
        }

        // --- Normal Processing ---

        // 1. Number / Digit Grouping (and Currency)
        bool is_digit_char = is_digit(char_i);
        bool is_currency_start = false;
        if (is_currency_symbol(char_i)) {
            if (i + 1 < n && is_digit(cps[i + 1])) {
                is_currency_start = true;
            }
        }

        if (is_digit_char || is_currency_start) {
            size_t num_len = get_number_length(cps, i, n);
            size_t next_idx = i + num_len;
            float step_cost = 1.0f;
            float new_cost = current_cost + step_cost;
            if (next_idx <= n && new_cost < dp_cost[next_idx]) {
                dp_cost[next_idx] = new_cost;
                dp_parent[next_idx] = static_cast<int32_t>(i);
            }
        }
        // 2. Separators
        else if (is_separator(char_i)) {
            size_t next_idx = i + 1;
            float step_cost = 0.1f;
            float new_cost = current_cost + step_cost;
            if (next_idx <= n && new_cost < dp_cost[next_idx]) {
                dp_cost[next_idx] = new_cost;
                dp_parent[next_idx] = static_cast<int32_t>(i);
            }
        }

        // 3. Acronyms
        if (is_acronym_start(cps, i, n)) {
            size_t acr_len = get_acronym_length(cps, i, n);
            size_t next_idx = i + acr_len;
            float step_cost = 1.0f;
            float new_cost = current_cost + step_cost;
            if (next_idx <= n && new_cost < dp_cost[next_idx]) {
                dp_cost[next_idx] = new_cost;
                dp_parent[next_idx] = static_cast<int32_t>(i);
            }
        }

        // 4. Dictionary Match - OPTIMIZED: Trie lookup on codepoints
        size_t end_limit = std::min(n, i + max_word_len);
        for (size_t j = i + 1; j <= end_limit; ++j) {
            auto word_cost = dictionary.lookup_codepoints(cps, i, j);
            if (word_cost) {
                float new_cost = current_cost + *word_cost;
                if (new_cost < dp_cost[j]) {
                    dp_cost[j] = new_cost;
                    dp_parent[j] = static_cast<int32_t>(i);
                }
            }
        }

        // 5. Unknown Cluster Fallback
        if (is_khmer_char(char_i)) {
            size_t cluster_len = get_khmer_cluster_length(cps, i, n);
            float step_cost = unknown_cost;

            if (cluster_len == 1 && !is_valid_single_word(char_i)) {
                step_cost += 10.0f;
            }

            size_t next_idx = i + cluster_len;
            float new_cost = current_cost + step_cost;
            if (next_idx <= n && new_cost < dp_cost[next_idx]) {
                dp_cost[next_idx] = new_cost;
                dp_parent[next_idx] = static_cast<int32_t>(i);
            }
        } else {
            // Non-Khmer
            size_t next_idx = i + 1;
            float new_cost = current_cost + unknown_cost;
            if (next_idx <= n && new_cost < dp_cost[next_idx]) {
                dp_cost[next_idx] = new_cost;
                dp_parent[next_idx] = static_cast<int32_t>(i);
            }
        }
    }

    // Backtrack - build segments in reverse
    std::vector<std::string> segments;
    segments.reserve(n / 4);
    int32_t curr = static_cast<int32_t>(n);
    while (curr > 0) {
        int32_t prev = dp_parent[curr];
        if (prev == -1) {
            std::cerr << "Error: Could not segment text. Stuck at index " << curr << std::endl;
            break;
        }
        segments.push_back(codepoints_to_string(cps, prev, curr));
        curr = prev;
    }

    // Reverse in-place
    std::reverse(segments.begin(), segments.end());

    return segments;
}

std::string KhmerSegmenter::codepoints_to_string(const char32_t* cps, size_t start, size_t end) const {
    std::u32string u32(cps + start, cps + end);
    return to_utf8(u32);
}

std::vector<std::string> KhmerSegmenter::snap_invalid_single_consonants(std::vector<std::string>&& segments) const {
    std::vector<std::string> result;
    result.reserve(segments.size());

    for (size_t j = 0; j < segments.size(); ++j) {
        const std::string& seg = segments[j];
        std::u32string u32 = to_u32(seg);

        if (u32.empty()) continue;

        char32_t first_cp = u32[0];
        size_t seg_len = u32.length();

        bool is_invalid_single = seg_len == 1
            && !is_valid_single_word(first_cp)
            && !dictionary.contains(seg)
            && !is_digit(first_cp)
            && !is_separator(first_cp);

        if (is_invalid_single) {
            bool prev_is_sep = false;
            if (!result.empty()) {
                std::u32string prev_u32 = to_u32(result.back());
                if (!prev_u32.empty() && (is_separator(prev_u32[0]) || result.back() == " ")) {
                    prev_is_sep = true;
                }
            } else if (j == 0) {
                prev_is_sep = true;
            }

            bool next_is_sep = false;
            if (j + 1 < segments.size()) {
                std::u32string next_u32 = to_u32(segments[j + 1]);
                if (!next_u32.empty() && (is_separator(next_u32[0]) || segments[j + 1] == " ")) {
                    next_is_sep = true;
                }
            } else {
                next_is_sep = true;
            }

            if (prev_is_sep && next_is_sep) {
                result.push_back(std::move(segments[j]));
                continue;
            }

            if (!result.empty()) {
                std::u32string prev_u32 = to_u32(result.back());
                if (!prev_u32.empty() && !is_separator(prev_u32[0])) {
                    result.back() += seg;
                } else {
                    result.push_back(std::move(segments[j]));
                }
            } else {
                result.push_back(std::move(segments[j]));
            }
        } else {
            result.push_back(std::move(segments[j]));
        }
    }

    return result;
}

std::vector<std::string> KhmerSegmenter::apply_heuristics(std::vector<std::string>&& segments) const {
    std::vector<std::string> merged;
    merged.reserve(segments.size());

    size_t n = segments.size();
    size_t i = 0;

    while (i < n) {
        const std::string& curr = segments[i];

        // If known word, don't merge
        if (dictionary.contains(curr)) {
            merged.push_back(std::move(segments[i]));
            i++;
            continue;
        }

        std::u32string chars = to_u32(curr);

        // Rule 1: Consonant + [់/ិ៍/៍/៌] -> Merge with PREVIOUS
        bool merged_rule1 = false;
        if (!merged.empty()) {
            if (chars.size() == 2) {
                if (is_consonant(chars[0]) &&
                    (chars[1] == 0x17CB || chars[1] == 0x17CE || chars[1] == 0x17CF)) {
                    merged.back() += curr;
                    i++;
                    merged_rule1 = true;
                }
            } else if (chars.size() == 3) {
                if (is_consonant(chars[0]) && chars[1] == 0x17B7 && chars[2] == 0x17CD) {
                    merged.back() += curr;
                    i++;
                    merged_rule1 = true;
                }
            }
        }
        if (merged_rule1) continue;

        // Rule 2: Consonant + ័ (\u17D0) -> Merge with NEXT
        if (i + 1 < n) {
            if (chars.size() == 2) {
                if (is_consonant(chars[0]) && chars[1] == 0x17D0) {
                    std::string new_word = curr + segments[i + 1];
                    merged.push_back(std::move(new_word));
                    i += 2;
                    continue;
                }
            }
        }

        merged.push_back(std::move(segments[i]));
        i++;
    }

    return merged;
}

std::vector<std::string> KhmerSegmenter::post_process_unknowns(std::vector<std::string>&& segments) const {
    std::vector<std::string> final_segments;
    final_segments.reserve(segments.size());
    std::string unknown_buffer;

    for (auto& seg : segments) {
        std::u32string u32 = to_u32(seg);
        if (u32.empty()) continue;

        char32_t first_char = u32[0];
        size_t char_count = u32.length();

        bool is_known = false;
        if (is_digit(first_char)) {
            is_known = true;
        } else if (dictionary.contains(seg)) {
            is_known = true;
        } else if (char_count == 1 && is_valid_single_word(first_char)) {
            is_known = true;
        } else if (char_count == 1 && is_separator(first_char)) {
            is_known = true;
        } else if (seg.find('.') != std::string::npos && char_count >= 2) {
            is_known = true;
        }

        if (is_known) {
            if (!unknown_buffer.empty()) {
                final_segments.push_back(std::move(unknown_buffer));
                unknown_buffer.clear();
            }
            final_segments.push_back(std::move(seg));
        } else {
            unknown_buffer += seg;
        }
    }

    if (!unknown_buffer.empty()) {
        final_segments.push_back(std::move(unknown_buffer));
    }

    return final_segments;
}

// --- Helper Methods ---

size_t KhmerSegmenter::get_khmer_cluster_length(const char32_t* cps, size_t start, size_t n) const {
    if (start >= n) return 0;

    char32_t c = cps[start];

    // Must start with Base Consonant or Independent Vowel (0x1780-0x17B3)
    if (!(c >= 0x1780 && c <= 0x17B3)) {
        return 1;
    }

    size_t i = start + 1;

    while (i < n) {
        char32_t current = cps[i];

        if (is_coeng(current)) {
            if (i + 1 < n && is_consonant(cps[i + 1])) {
                i += 2;
                continue;
            }
            break;
        }

        if (is_dependent_vowel(current) || is_sign(current)) {
            i++;
            continue;
        }

        break;
    }

    return i - start;
}

size_t KhmerSegmenter::get_number_length(const char32_t* cps, size_t start, size_t n) const {
    if (start >= n) return 0;
    if (!is_digit(cps[start])) return 0;

    size_t i = start + 1;

    while (i < n) {
        char32_t c = cps[i];
        if (is_digit(c)) {
            i++;
            continue;
        }
        if (c == ',' || c == '.' || c == ' ') {
            if (i + 1 < n && is_digit(cps[i + 1])) {
                i += 2;
                continue;
            }
        }
        break;
    }

    return i - start;
}

size_t KhmerSegmenter::get_acronym_length(const char32_t* cps, size_t start, size_t n) const {
    size_t i = start;

    while (true) {
        size_t cluster_len = get_khmer_cluster_length(cps, i, n);
        if (cluster_len > 0) {
            size_t dot_index = i + cluster_len;
            if (dot_index < n && cps[dot_index] == '.') {
                i = dot_index + 1;
                if (i >= n) break;
                continue;
            }
        }
        break;
    }

    return i - start;
}

bool KhmerSegmenter::is_acronym_start(const char32_t* cps, size_t start, size_t n) const {
    if (start >= n) return false;

    size_t cluster_len = get_khmer_cluster_length(cps, start, n);
    if (cluster_len == 0) return false;

    size_t dot_index = start + cluster_len;
    return dot_index < n && cps[dot_index] == '.';
}

} // namespace khmer
