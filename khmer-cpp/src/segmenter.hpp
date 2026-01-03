#pragma once

#include "dictionary.hpp"
#include <vector>
#include <string>
#include <string_view>

namespace khmer {

class KhmerSegmenter {
public:
    const Dictionary& dictionary;

    KhmerSegmenter(const Dictionary& dict);

    // Main entry point - returns vector of string segments
    std::vector<std::string> segment(std::string_view text) const;

private:
    // Note: For thread-safety with OpenMP, buffers are allocated per-call
    // The segment_codepoints method uses local vectors instead of member buffers

    // Core segmentation on codepoint array
    std::vector<std::string> segment_codepoints(const char32_t* cps, size_t n) const;

    // Helpers operating on codepoint arrays
    size_t get_khmer_cluster_length(const char32_t* cps, size_t start, size_t n) const;
    size_t get_number_length(const char32_t* cps, size_t start, size_t n) const;
    size_t get_acronym_length(const char32_t* cps, size_t start, size_t n) const;
    bool is_acronym_start(const char32_t* cps, size_t start, size_t n) const;

    // Post-processing
    std::vector<std::string> snap_invalid_single_consonants(std::vector<std::string>&& segments) const;
    std::vector<std::string> apply_heuristics(std::vector<std::string>&& segments) const;
    std::vector<std::string> post_process_unknowns(std::vector<std::string>&& segments) const;

    // Utility
    std::string codepoints_to_string(const char32_t* cps, size_t start, size_t end) const;
};

} // namespace khmer
