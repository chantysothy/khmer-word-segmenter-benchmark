using System;
using System.Collections.Generic;

namespace KhmerSegmenter
{
    public static class Constants
    {
        // Khmer Unicode Ranges
        // Consonants: 1780-17A2
        // Indep Vowels: 17A3-17B3
        // Dep Vowels: 17B6-17C5
        // Signs: 17C6-17D1, 17D3, 17DD
        // Coeng (Subscript): 17D2
        // Khmer Digits: 17E0-17E9
        // Currency: 17DB (Riel)

        public static bool IsDigit(char c)
        {
            return (c >= '0' && c <= '9') || (c >= 0x17E0 && c <= 0x17E9);
        }

        public static bool IsConsonant(char c)
        {
            return c >= 0x1780 && c <= 0x17A2;
        }

        public static bool IsDependentVowel(char c)
        {
            return c >= 0x17B6 && c <= 0x17C5;
        }

        public static bool IsSign(char c)
        {
            return (c >= 0x17C6 && c <= 0x17D1) || c == 0x17D3 || c == 0x17DD;
        }

        public static bool IsCoeng(char c)
        {
            return c == 0x17D2;
        }

        public static bool IsKhmerChar(char c)
        {
            return (c >= 0x1780 && c <= 0x17FF) || (c >= 0x19E0 && c <= 0x19FF);
        }

        public static bool IsCurrencySymbol(char c)
        {
            // $, ៛ (17DB)
            return c == '$' || c == 0x17DB;
        }

        public static bool IsSeparator(char c)
        {
            // Khmer Punctuation range (17D4-17DA) including ។ ៕ ៖ ៗ etc.
            if (c >= 0x17D4 && c <= 0x17DA)
                return true;
            // Khmer Currency Symbol ៛ (17DB)
            if (c == 0x17DB)
                return true;
            // Standard ASCII punctuation and whitespace
            // Match Python: '!?.,;:"\\'()[]{}-/ «»""˝$%'
            return c == ' ' || c == '\t' || c == '\n' || c == '\r' ||
                   c == '?' || c == '!' || c == '.' || c == ',' || c == ':' || c == ';' ||
                   c == '"' || c == '\'' || c == '(' || c == ')' || c == '[' || c == ']' ||
                   c == '{' || c == '}' || c == '-' || c == '/' || c == ' ' ||
                   c == '«' || c == '»' ||    // U+00AB, U+00BB - Angle quotes
                   c == '\u201C' || c == '\u201D' ||    // U+201C, U+201D - Curly double quotes
                   c == '˝' ||                // U+02DD - Double acute accent
                   c == '$' || c == '%';      // Currency and percent
        }

        // Valid Single Words (Consonants/Indep Vowels that can stand alone)
        // Must match Python exactly: viterbi.py line 13-16
        private static readonly HashSet<char> ValidSingleWords = new HashSet<char>
        {
            // Consonants (specific subset from Python)
            '\u1780', // ក Ka
            '\u1781', // ខ Kha
            '\u1782', // គ Ko
            '\u1784', // ង Ngo
            '\u1785', // ច Ca
            '\u1786', // ឆ Cha
            '\u1789', // ញ Nyo
            '\u178A', // ដ Da
            '\u178F', // ត Ta
            '\u1791', // ទ Tho
            '\u1796', // ព Po
            '\u179A', // រ Ro
            '\u179B', // ល Lo
            '\u179F', // ស Sa
            '\u17A1', // ឡ La
            // Independent Vowels
            '\u17AC', // ឬ
            '\u17AE', // ឮ
            '\u17AA', // ឪ
            '\u17AF', // ឯ
            '\u17B1', // ឱ
            '\u17A6', // ឦ
            '\u17A7', // ឧ
            '\u17B3'  // ឳ
        };

        public static bool IsValidSingleWord(char c)
        {
             // Simply check if it's in the set.
             // Note: in Python implementation, IsValidSingleWord usually checks dictionary or whitelist.
             // We'll trust the set.
             return ValidSingleWords.Contains(c);
        }
    }
}
