using System;
using System.Runtime.CompilerServices;

namespace KhmerSegmenter
{
    /// <summary>
    /// High-performance character classification using lookup tables.
    /// Inspired by 1 Billion Row Challenge optimizations.
    /// </summary>
    public static class Constants
    {
        // Lookup tables for O(1) character classification
        // Table covers 0x0000 to 0x17FF (Khmer range + ASCII)
        private const int TABLE_SIZE = 0x1800;

        // Bit flags for character types
        private const byte FLAG_DIGIT = 1;
        private const byte FLAG_CONSONANT = 2;
        private const byte FLAG_DEP_VOWEL = 4;
        private const byte FLAG_SIGN = 8;
        private const byte FLAG_SEPARATOR = 16;
        private const byte FLAG_VALID_SINGLE = 32;
        private const byte FLAG_KHMER = 64;
        private const byte FLAG_CURRENCY = 128;

        // Single lookup table with bit flags
        private static readonly byte[] CharFlags;

        static Constants()
        {
            CharFlags = new byte[TABLE_SIZE];
            InitializeTable();
        }

        private static void InitializeTable()
        {
            // ASCII Digits (0-9)
            for (int c = '0'; c <= '9'; c++)
                CharFlags[c] |= FLAG_DIGIT;

            // Khmer Digits (0x17E0-0x17E9)
            for (int c = 0x17E0; c <= 0x17E9; c++)
                CharFlags[c] |= FLAG_DIGIT;

            // Khmer Consonants (0x1780-0x17A2)
            for (int c = 0x1780; c <= 0x17A2; c++)
                CharFlags[c] |= FLAG_CONSONANT;

            // Dependent Vowels (0x17B6-0x17C5)
            for (int c = 0x17B6; c <= 0x17C5; c++)
                CharFlags[c] |= FLAG_DEP_VOWEL;

            // Signs (0x17C6-0x17D1, 0x17D3, 0x17DD)
            for (int c = 0x17C6; c <= 0x17D1; c++)
                CharFlags[c] |= FLAG_SIGN;
            CharFlags[0x17D3] |= FLAG_SIGN;
            CharFlags[0x17DD] |= FLAG_SIGN;

            // Khmer range (0x1780-0x17FF)
            for (int c = 0x1780; c <= 0x17FF; c++)
                CharFlags[c] |= FLAG_KHMER;

            // Currency symbols
            CharFlags['$'] |= FLAG_CURRENCY;
            CharFlags[0x17DB] |= FLAG_CURRENCY; // Khmer Riel

            // Separators - ASCII
            CharFlags[' '] |= FLAG_SEPARATOR;
            CharFlags['\t'] |= FLAG_SEPARATOR;
            CharFlags['\n'] |= FLAG_SEPARATOR;
            CharFlags['\r'] |= FLAG_SEPARATOR;
            CharFlags['?'] |= FLAG_SEPARATOR;
            CharFlags['!'] |= FLAG_SEPARATOR;
            CharFlags['.'] |= FLAG_SEPARATOR;
            CharFlags[','] |= FLAG_SEPARATOR;
            CharFlags[':'] |= FLAG_SEPARATOR;
            CharFlags[';'] |= FLAG_SEPARATOR;
            CharFlags['"'] |= FLAG_SEPARATOR;
            CharFlags['\''] |= FLAG_SEPARATOR;
            CharFlags['('] |= FLAG_SEPARATOR;
            CharFlags[')'] |= FLAG_SEPARATOR;
            CharFlags['['] |= FLAG_SEPARATOR;
            CharFlags[']'] |= FLAG_SEPARATOR;
            CharFlags['{'] |= FLAG_SEPARATOR;
            CharFlags['}'] |= FLAG_SEPARATOR;
            CharFlags['-'] |= FLAG_SEPARATOR;
            CharFlags['/'] |= FLAG_SEPARATOR;
            CharFlags['$'] |= FLAG_SEPARATOR;
            CharFlags['%'] |= FLAG_SEPARATOR;
            CharFlags[0x00AB] |= FLAG_SEPARATOR; // «
            CharFlags[0x00BB] |= FLAG_SEPARATOR; // »
            CharFlags[0x02DD] |= FLAG_SEPARATOR; // ˝

            // Khmer punctuation range (0x17D4-0x17DB)
            for (int c = 0x17D4; c <= 0x17DB; c++)
                CharFlags[c] |= FLAG_SEPARATOR;

            // Valid single words - Consonants
            CharFlags[0x1780] |= FLAG_VALID_SINGLE; // ក
            CharFlags[0x1781] |= FLAG_VALID_SINGLE; // ខ
            CharFlags[0x1782] |= FLAG_VALID_SINGLE; // គ
            CharFlags[0x1784] |= FLAG_VALID_SINGLE; // ង
            CharFlags[0x1785] |= FLAG_VALID_SINGLE; // ច
            CharFlags[0x1786] |= FLAG_VALID_SINGLE; // ឆ
            CharFlags[0x1789] |= FLAG_VALID_SINGLE; // ញ
            CharFlags[0x178A] |= FLAG_VALID_SINGLE; // ដ
            CharFlags[0x178F] |= FLAG_VALID_SINGLE; // ត
            CharFlags[0x1791] |= FLAG_VALID_SINGLE; // ទ
            CharFlags[0x1796] |= FLAG_VALID_SINGLE; // ព
            CharFlags[0x179A] |= FLAG_VALID_SINGLE; // រ
            CharFlags[0x179B] |= FLAG_VALID_SINGLE; // ល
            CharFlags[0x179F] |= FLAG_VALID_SINGLE; // ស
            CharFlags[0x17A1] |= FLAG_VALID_SINGLE; // ឡ

            // Valid single words - Independent Vowels
            CharFlags[0x17A6] |= FLAG_VALID_SINGLE; // ឦ
            CharFlags[0x17A7] |= FLAG_VALID_SINGLE; // ឧ
            CharFlags[0x17AA] |= FLAG_VALID_SINGLE; // ឪ
            CharFlags[0x17AC] |= FLAG_VALID_SINGLE; // ឬ
            CharFlags[0x17AE] |= FLAG_VALID_SINGLE; // ឮ
            CharFlags[0x17AF] |= FLAG_VALID_SINGLE; // ឯ
            CharFlags[0x17B1] |= FLAG_VALID_SINGLE; // ឱ
            CharFlags[0x17B3] |= FLAG_VALID_SINGLE; // ឳ
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsDigit(char c)
        {
            int code = c;
            return code < TABLE_SIZE && (CharFlags[code] & FLAG_DIGIT) != 0;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsConsonant(char c)
        {
            int code = c;
            return code < TABLE_SIZE && (CharFlags[code] & FLAG_CONSONANT) != 0;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsDependentVowel(char c)
        {
            int code = c;
            return code < TABLE_SIZE && (CharFlags[code] & FLAG_DEP_VOWEL) != 0;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsSign(char c)
        {
            int code = c;
            return code < TABLE_SIZE && (CharFlags[code] & FLAG_SIGN) != 0;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsCoeng(char c)
        {
            return c == '\u17D2';
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsKhmerChar(char c)
        {
            int code = c;
            // Include extended Khmer range (0x19E0-0x19FF) with direct check
            return (code < TABLE_SIZE && (CharFlags[code] & FLAG_KHMER) != 0)
                   || (code >= 0x19E0 && code <= 0x19FF);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsCurrencySymbol(char c)
        {
            int code = c;
            return code < TABLE_SIZE && (CharFlags[code] & FLAG_CURRENCY) != 0;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsSeparator(char c)
        {
            int code = c;
            if (code < TABLE_SIZE)
                return (CharFlags[code] & FLAG_SEPARATOR) != 0;
            // Unicode curly quotes (outside table range)
            return c == '\u201C' || c == '\u201D';
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsValidSingleWord(char c)
        {
            int code = c;
            return code < TABLE_SIZE && (CharFlags[code] & FLAG_VALID_SINGLE) != 0;
        }
    }
}
