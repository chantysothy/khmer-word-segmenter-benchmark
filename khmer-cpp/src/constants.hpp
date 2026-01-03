#pragma once

#include <cstdint>
#include <string>
#include <string_view>

namespace khmer {

// Khmer Unicode Ranges
constexpr char32_t KHMER_START = 0x1780;
constexpr char32_t KHMER_END = 0x17FF;
constexpr char32_t KHMER_SYMBOLS_START = 0x19E0;
constexpr char32_t KHMER_SYMBOLS_END = 0x19FF;

inline bool is_khmer_char(char32_t c) {
    return (c >= 0x1780 && c <= 0x17FF) || (c >= 0x19E0 && c <= 0x19FF);
}

inline bool is_consonant(char32_t c) {
    return c >= 0x1780 && c <= 0x17A2;
}

inline bool is_independent_vowel(char32_t c) {
    return c >= 0x17A3 && c <= 0x17B3;
}

inline bool is_dependent_vowel(char32_t c) {
    return c >= 0x17B6 && c <= 0x17C5;
}

inline bool is_sign(char32_t c) {
    return (c >= 0x17C6 && c <= 0x17D1) || c == 0x17D3 || c == 0x17DD;
}

inline bool is_coeng(char32_t c) {
    return c == 0x17D2;
}

inline bool is_digit(char32_t c) {
    // ASCII 0-9 or Khmer 0-9
    return (c >= 0x30 && c <= 0x39) || (c >= 0x17E0 && c <= 0x17E9);
}

inline bool is_currency_symbol(char32_t c) {
    // $, ុ (17DB), €, £, ¥
    return c == '$' || c == 0x17DB || c == 0x20AC || c == 0x00A3 || c == 0x00A5;
}

inline bool is_separator(char32_t c) {
    // Khmer Punctuation 0x17D4 - 0x17DA
    if (c >= 0x17D4 && c <= 0x17DA) {
        return true;
    }
    // Currency Reil (U+17DB) considered separator in original logic?
    // Rust port says: "if c == '\u{17DB}' { return true; }" matching Python line 339
    if (c == 0x17DB) {
        return true;
    }

    // Common punctuation
    // ! ? . , ; : " ' ( ) [ ] { } - / « » “ ” ˝ $ % space
    switch (c) {
        case '!': case '?': case '.': case ',': case ';': case ':':
        case '"': case '\'': case '(': case ')': case '[': case ']':
        case '{': case '}': case '-': case '/':
        case 0x00AB: // «
        case 0x00BB: // »
        case 0x201C: // “
        case 0x201D: // ”
        case 0x02DD: // ˝
        case '$': case '%': case ' ':
            return true;
        default:
            return false;
    }
}

inline bool is_valid_single_word(char32_t c) {
    // Consonants whitelist
    // 'ក' (1780) | 'ខ' (1781) ...
    // Hardcoding specific checks to match Rust/Python exactly
    switch (c) {
        case 0x1780: // ក
        case 0x1781: // ខ
        case 0x1782: // គ
        case 0x1784: // ង
        case 0x1785: // ច
        case 0x1786: // ឆ
        case 0x1789: // ញ
        case 0x178A: // ដ
        case 0x178F: // ត
        case 0x1791: // ទ
        case 0x1796: // ព
        case 0x179A: // រ
        case 0x179B: // ល
        case 0x179F: // ស
        case 0x17A1: // ឡ
        // Independent Vowels
        case 0x17AC: // ឬ
        case 0x17AD: // ឮ
        case 0x17AA: // ឪ
        case 0x17A6: // ឯ
        case 0x17A3: // ឱ
        case 0x17A7: // ឦ
        case 0x17A4: // ឧ
        case 0x17A9: // ឳ
            return true;
        default:
            return false;
    }
}

// UTF-8 Helper: Get code point and length from string at index
inline std::pair<char32_t, int> get_char_at(std::string_view text, size_t index) {
    if (index >= text.length()) return {0, 0};

    unsigned char c = static_cast<unsigned char>(text[index]);
    if (c < 0x80) return {c, 1};

    if ((c & 0xE0) == 0xC0) {
        if (index + 1 >= text.length()) return {0, 0};
        return {
            ((c & 0x1F) << 6) | (static_cast<unsigned char>(text[index + 1]) & 0x3F),
            2
        };
    }

    if ((c & 0xF0) == 0xE0) {
        if (index + 2 >= text.length()) return {0, 0};
        return {
            ((c & 0x0F) << 12) |
            ((static_cast<unsigned char>(text[index + 1]) & 0x3F) << 6) |
            (static_cast<unsigned char>(text[index + 2]) & 0x3F),
            3
        };
    }

    if ((c & 0xF8) == 0xF0) {
        if (index + 3 >= text.length()) return {0, 0};
        return {
            ((c & 0x07) << 18) |
            ((static_cast<unsigned char>(text[index + 1]) & 0x3F) << 12) |
            ((static_cast<unsigned char>(text[index + 2]) & 0x3F) << 6) |
            (static_cast<unsigned char>(text[index + 3]) & 0x3F),
            4
        };
    }

    return {0, 0}; // Invalid or unsupported
}

// Helper: UTF-8 to UTF-32
inline std::u32string to_u32(std::string_view utf8) {
    std::u32string utf32;
    utf32.reserve(utf8.size()); // Optimistic reserve
    size_t i = 0;
    while (i < utf8.length()) {
        auto [c, len] = get_char_at(utf8, i);
        if (len == 0) { i++; continue; } // Skip invalid
        utf32.push_back(c);
        i += len;
    }
    return utf32;
}

// Helper: UTF-32 to UTF-8
inline std::string to_utf8(const std::u32string& utf32) {
    std::string utf8;
    utf8.reserve(utf32.size() * 3); // Average for Khmer
    for (char32_t c : utf32) {
        if (c <= 0x7F) {
            utf8.push_back(static_cast<char>(c));
        } else if (c <= 0x7FF) {
            utf8.push_back(static_cast<char>(0xC0 | ((c >> 6) & 0x1F)));
            utf8.push_back(static_cast<char>(0x80 | (c & 0x3F)));
        } else if (c <= 0xFFFF) {
            utf8.push_back(static_cast<char>(0xE0 | ((c >> 12) & 0x0F)));
            utf8.push_back(static_cast<char>(0x80 | ((c >> 6) & 0x3F)));
            utf8.push_back(static_cast<char>(0x80 | (c & 0x3F)));
        } else if (c <= 0x10FFFF) {
            utf8.push_back(static_cast<char>(0xF0 | ((c >> 18) & 0x07)));
            utf8.push_back(static_cast<char>(0x80 | ((c >> 12) & 0x3F)));
            utf8.push_back(static_cast<char>(0x80 | ((c >> 6) & 0x3F)));
            utf8.push_back(static_cast<char>(0x80 | (c & 0x3F)));
        }
    }
    return utf8;
}

} // namespace khmer
