#include "segmenter.hpp"
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <chrono>
#include <omp.h>
#include <iomanip>
#include <cstring>

// Simple JSON string escaper
std::string escape_json(const std::string& s) {
    std::string out;
    out.reserve(s.length() + 8);
    for (unsigned char c : s) {
        switch (c) {
            case '\"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    char buf[7];
                    snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += c;
                }
        }
    }
    return out;
}

struct Args {
    std::string dict_path = "../data/khmer_dictionary_words.txt";
    std::string freq_path = "../data/khmer_word_frequencies.json";
    std::string input_path;
    std::string output_path;
    int limit = -1;
    bool threads_set = false;
    int threads = 4;
};

Args parse_args(int argc, char* argv[]) {
    Args args;
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--dict" && i + 1 < argc) {
            args.dict_path = argv[++i];
        } else if (arg == "--freq" && i + 1 < argc) {
            args.freq_path = argv[++i];
        } else if (arg == "--input" && i + 1 < argc) {
            args.input_path = argv[++i];
        } else if (arg == "--output" && i + 1 < argc) {
            args.output_path = argv[++i];
        } else if (arg == "--limit" && i + 1 < argc) {
            args.limit = std::stoi(argv[++i]);
        } else if (arg == "--threads" && i + 1 < argc) {
            args.threads = std::stoi(argv[++i]);
            args.threads_set = true;
        }
    }
    return args;
}

int main(int argc, char* argv[]) {
    // Fast I/O
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(NULL);

    Args args = parse_args(argc, argv);

    if (args.input_path.empty()) {
        std::cerr << "Usage: " << argv[0] << " --input <file> [--output <file>] [--dict <file>] [--freq <file>] [--limit <n>] [--threads <n>]" << std::endl;
        return 1;
    }

    if (args.threads_set) {
        omp_set_num_threads(args.threads);
    }

    // 1. Load Dictionary
    auto start_load = std::chrono::high_resolution_clock::now();
    khmer::Dictionary dict;
    dict.load(args.dict_path, args.freq_path);
    auto end_load = std::chrono::high_resolution_clock::now();

    std::cout << "Dictionary loaded in "
              << std::chrono::duration<double>(end_load - start_load).count()
              << "s" << std::endl;

    // 2. Initialize Segmenter
    khmer::KhmerSegmenter segmenter(dict);

    // 3. Read Input
    std::vector<std::string> lines;
    {
        std::ifstream infile(args.input_path);
        if (!infile.is_open()) {
            std::cerr << "Error opening input file: " << args.input_path << std::endl;
            return 1;
        }
        std::string line;
        while (std::getline(infile, line)) {
            if (!line.empty()) {
                // remove potential carriage return
                if (line.back() == '\r') line.pop_back();
                lines.push_back(line);
                if (args.limit > 0 && lines.size() >= static_cast<size_t>(args.limit)) break;
            }
        }
    }
    std::cout << "Loaded " << lines.size() << " lines." << std::endl;

    // 4. Process
    std::vector<std::string> results(lines.size());

    auto start_proc = std::chrono::high_resolution_clock::now();

    #pragma omp parallel for schedule(dynamic, 100)
    for (int64_t i = 0; i < static_cast<int64_t>(lines.size()); ++i) {
        auto segments = segmenter.segment(lines[i]);

        // Build JSON output: ["seg1", "seg2", ...]
        std::string json;
        json.reserve(lines[i].size() * 2); // heuristic
        json += "[";
        for (size_t j = 0; j < segments.size(); ++j) {
            if (j > 0) json += ", ";
            json += "\"";
            json += escape_json(segments[j]);
            json += "\"";
        }
        json += "]";
        results[i] = std::move(json);
    }

    auto end_proc = std::chrono::high_resolution_clock::now();
    double duration = std::chrono::duration<double>(end_proc - start_proc).count();

    std::cout << "Processed " << lines.size() << " lines in " << duration << "s" << std::endl;
    std::cout << "Speed: " << (lines.size() / duration) << " lines/sec" << std::endl;

    // 5. Output
    if (!args.output_path.empty()) {
        std::ofstream outfile(args.output_path);
        for (const auto& res : results) {
            outfile << res << "\n";
        }
    }

    return 0;
}
