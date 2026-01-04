#include "segmenter.hpp"
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <chrono>
#include <omp.h>
#include <iomanip>
#include <cstring>
#include <sstream>

// ============================================================================
// High-performance JSON builder using thread_local buffers
// Inspired by 1 Billion Row Challenge optimizations
// ============================================================================

// Cross-platform force inline macro
#if defined(_MSC_VER)
    #define FORCE_INLINE __forceinline
#elif defined(__GNUC__) || defined(__clang__)
    #define FORCE_INLINE __attribute__((always_inline)) inline
#else
    #define FORCE_INLINE inline
#endif

// Pre-computed hex digits table (avoids snprintf overhead)
static constexpr char HEX_DIGITS[] = "0123456789abcdef";

// Fast integer to string - appends directly to buffer (avoids std::to_string allocation)
FORCE_INLINE void append_int(std::string& out, int64_t val) {
    if (val == 0) {
        out += '0';
        return;
    }
    if (val < 0) {
        out += '-';
        val = -val;
    }
    char buf[20];
    char* p = buf + 20;
    while (val > 0) {
        *--p = '0' + (val % 10);
        val /= 10;
    }
    out.append(p, buf + 20 - p);
}

// Fast inline JSON string escaper - appends directly to buffer
FORCE_INLINE void escape_json_to(std::string& out, const std::string& s) {
    for (unsigned char c : s) {
        switch (c) {
            case '\"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    // Fast hex encoding using lookup table instead of snprintf
                    out += "\\u00";
                    out += HEX_DIGITS[(c >> 4) & 0xF];
                    out += HEX_DIGITS[c & 0xF];
                } else {
                    out += c;
                }
        }
    }
}

// Fast JSON record builder with thread_local pre-allocated buffer
FORCE_INLINE std::string build_json_record(
    int64_t id,
    const std::string& input,
    const std::vector<std::string>& segments
) {
    // Thread-local buffer to avoid allocation overhead
    thread_local std::string buffer;
    buffer.clear();
    buffer.reserve(512);

    // Build: {"id":N,"input":"...","segments":["...", ...]}
    buffer += "{\"id\":";
    append_int(buffer, id);
    buffer += ",\"input\":\"";
    escape_json_to(buffer, input);
    buffer += "\",\"segments\":[";

    for (size_t i = 0; i < segments.size(); ++i) {
        if (i > 0) buffer += ',';
        buffer += '"';
        escape_json_to(buffer, segments[i]);
        buffer += '"';
    }

    buffer += "]}";
    return buffer;
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
        // Use fast JSON builder with thread_local buffer
        results[i] = build_json_record(i, lines[i], segments);
    }

    auto end_proc = std::chrono::high_resolution_clock::now();
    double duration = std::chrono::duration<double>(end_proc - start_proc).count();

    std::cout << "Processed " << lines.size() << " lines in " << duration << "s" << std::endl;
    std::cout << "Speed: " << (lines.size() / duration) << " lines/sec" << std::endl;

    // 5. Output with buffered I/O
    if (!args.output_path.empty()) {
        std::ofstream outfile(args.output_path);
        // Use larger buffer for better I/O performance
        char buffer[65536];
        outfile.rdbuf()->pubsetbuf(buffer, sizeof(buffer));
        for (const auto& res : results) {
            outfile << res << "\n";
        }
        std::cout << "Done. Saved to " << args.output_path << std::endl;
    }

    return 0;
}
