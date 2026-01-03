#pragma once

#include <cstdint>
#include <string>
#include <string_view>
#include <array>

namespace khmer {

// ============================================================================
// High-performance character classification using lookup tables with bit flags
// Inspired by 1 Billion Row Challenge optimizations
// ============================================================================

// Bit flags for character types
constexpr uint8_t FLAG_DIGIT = 1;
constexpr uint8_t FLAG_CONSONANT = 2;
constexpr uint8_t FLAG_DEP_VOWEL = 4;
constexpr uint8_t FLAG_SIGN = 8;
constexpr uint8_t FLAG_SEPARATOR = 16;
constexpr uint8_t FLAG_VALID_SINGLE = 32;
constexpr uint8_t FLAG_KHMER = 64;
constexpr uint8_t FLAG_CURRENCY = 128;

// Table covers 0x0000 to 0x17FF (Khmer range + ASCII)
constexpr size_t TABLE_SIZE = 0x1800;

// Initialize lookup table at compile time using constexpr
constexpr std::array<uint8_t, TABLE_SIZE> init_char_flags() {
    std::array<uint8_t, TABLE_SIZE> flags{};

    // ASCII Digits (0-9)
    for (int c = '0'; c <= '9'; ++c)
        flags[c] |= FLAG_DIGIT;

    // Khmer Digits (0x17E0-0x17E9)
    for (int c = 0x17E0; c <= 0x17E9; ++c)
        flags[c] |= FLAG_DIGIT;

    // Khmer Consonants (0x1780-0x17A2)
    for (int c = 0x1780; c <= 0x17A2; ++c)
        flags[c] |= FLAG_CONSONANT;

    // Dependent Vowels (0x17B6-0x17C5)
    for (int c = 0x17B6; c <= 0x17C5; ++c)
        flags[c] |= FLAG_DEP_VOWEL;

    // Signs (0x17C6-0x17D1, 0x17D3, 0x17DD)
    for (int c = 0x17C6; c <= 0x17D1; ++c)
        flags[c] |= FLAG_SIGN;
    flags[0x17D3] |= FLAG_SIGN;
    flags[0x17DD] |= FLAG_SIGN;

    // Khmer range (0x1780-0x17FF)
    for (int c = 0x1780; c <= 0x17FF; ++c)
        flags[c] |= FLAG_KHMER;

    // Currency symbols
    flags['$'] |= FLAG_CURRENCY;
    flags[0x17DB] |= FLAG_CURRENCY; // Khmer Riel

    // Separators - ASCII
    flags[' '] |= FLAG_SEPARATOR;
    flags['\t'] |= FLAG_SEPARATOR;
    flags['\n'] |= FLAG_SEPARATOR;
    flags['\r'] |= FLAG_SEPARATOR;
    flags['?'] |= FLAG_SEPARATOR;
    flags['!'] |= FLAG_SEPARATOR;
    flags['.'] |= FLAG_SEPARATOR;
    flags[','] |= FLAG_SEPARATOR;
    flags[':'] |= FLAG_SEPARATOR;
    flags[';'] |= FLAG_SEPARATOR;
    flags['"'] |= FLAG_SEPARATOR;
    flags['\''] |= FLAG_SEPARATOR;
    flags['('] |= FLAG_SEPARATOR;
    flags[')'] |= FLAG_SEPARATOR;
    flags['['] |= FLAG_SEPARATOR;
    flags[']'] |= FLAG_SEPARATOR;
    flags['{'] |= FLAG_SEPARATOR;
    flags['}'] |= FLAG_SEPARATOR;
    flags['-'] |= FLAG_SEPARATOR;
    flags['/'] |= FLAG_SEPARATOR;
    flags['$'] |= FLAG_SEPARATOR;
    flags['%'] |= FLAG_SEPARATOR;
    flags[0x00AB] |= FLAG_SEPARATOR; // «
    flags[0x00BB] |= FLAG_SEPARATOR; // »
    flags[0x02DD] |= FLAG_SEPARATOR; // ˝

    // Khmer punctuation range (0x17D4-0x17DB)
    for (int c = 0x17D4; c <= 0x17DB; ++c)
        flags[c] |= FLAG_SEPARATOR;

    // Valid single words - Consonants
    flags[0x1780] |= FLAG_VALID_SINGLE; // ក
    flags[0x1781] |= FLAG_VALID_SINGLE; // ខ
    flags[0x1782] |= FLAG_VALID_SINGLE; // គ
    flags[0x1784] |= FLAG_VALID_SINGLE; // ង
    flags[0x1785] |= FLAG_VALID_SINGLE; // ច
    flags[0x1786] |= FLAG_VALID_SINGLE; // ឆ
    flags[0x1789] |= FLAG_VALID_SINGLE; // ញ
    flags[0x178A] |= FLAG_VALID_SINGLE; // ដ
    flags[0x178F] |= FLAG_VALID_SINGLE; // ត
    flags[0x1791] |= FLAG_VALID_SINGLE; // ទ
    flags[0x1796] |= FLAG_VALID_SINGLE; // ព
    flags[0x179A] |= FLAG_VALID_SINGLE; // រ
    flags[0x179B] |= FLAG_VALID_SINGLE; // ល
    flags[0x179F] |= FLAG_VALID_SINGLE; // ស
    flags[0x17A1] |= FLAG_VALID_SINGLE; // ឡ

    // Valid single words - Independent Vowels
    flags[0x17A6] |= FLAG_VALID_SINGLE; // ឦ
    flags[0x17A7] |= FLAG_VALID_SINGLE; // ឧ
    flags[0x17AA] |= FLAG_VALID_SINGLE; // ឪ
    flags[0x17AC] |= FLAG_VALID_SINGLE; // ឬ
    flags[0x17AE] |= FLAG_VALID_SINGLE; // ឮ
    flags[0x17AF] |= FLAG_VALID_SINGLE; // ឯ
    flags[0x17B1] |= FLAG_VALID_SINGLE; // ឱ
    flags[0x17B3] |= FLAG_VALID_SINGLE; // ឳ

    return flags;
}

// Compile-time initialized lookup table
inline constexpr std::array<uint8_t, TABLE_SIZE> CHAR_FLAGS = init_char_flags();

// ============================================================================
// Inline lookup functions using the table
// ============================================================================

// Cross-platform force inline macro
#if defined(_MSC_VER)
    #define FORCE_INLINE __forceinline
#elif defined(__GNUC__) || defined(__clang__)
    #define FORCE_INLINE __attribute__((always_inline)) inline
#else
    #define FORCE_INLINE inline
#endif

FORCE_INLINE bool is_digit(char32_t c) {
    return c < TABLE_SIZE && (CHAR_FLAGS[c] & FLAG_DIGIT) != 0;
}

FORCE_INLINE bool is_consonant(char32_t c) {
    return c < TABLE_SIZE && (CHAR_FLAGS[c] & FLAG_CONSONANT) != 0;
}

FORCE_INLINE bool is_dependent_vowel(char32_t c) {
    return c < TABLE_SIZE && (CHAR_FLAGS[c] & FLAG_DEP_VOWEL) != 0;
}

FORCE_INLINE bool is_sign(char32_t c) {
    return c < TABLE_SIZE && (CHAR_FLAGS[c] & FLAG_SIGN) != 0;
}

FORCE_INLINE bool is_coeng(char32_t c) {
    return c == 0x17D2;
}

FORCE_INLINE bool is_khmer_char(char32_t c) {
    // Include extended Khmer range (0x19E0-0x19FF) with direct check
    return (c < TABLE_SIZE && (CHAR_FLAGS[c] & FLAG_KHMER) != 0)
           || (c >= 0x19E0 && c <= 0x19FF);
}

FORCE_INLINE bool is_currency_symbol(char32_t c) {
    return c < TABLE_SIZE && (CHAR_FLAGS[c] & FLAG_CURRENCY) != 0;
}

FORCE_INLINE bool is_separator(char32_t c) {
    if (c < TABLE_SIZE)
        return (CHAR_FLAGS[c] & FLAG_SEPARATOR) != 0;
    // Unicode curly quotes (outside table range)
    return c == 0x201C || c == 0x201D;
}

FORCE_INLINE bool is_valid_single_word(char32_t c) {
    return c < TABLE_SIZE && (CHAR_FLAGS[c] & FLAG_VALID_SINGLE) != 0;
}

FORCE_INLINE bool is_independent_vowel(char32_t c) {
    return c >= 0x17A3 && c <= 0x17B3;
}

// ============================================================================
// UTF-8 Helper Functions
// ============================================================================

// UTF-8 Helper: Get code point and length from string at index
FORCE_INLINE std::pair<char32_t, int> get_char_at(std::string_view text, size_t index) {
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
