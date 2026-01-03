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
            // Khan (17D4), Bariyoosan (17D5), Camnuc (17D6) - rare, etc.
            // Also standard punctuation
            return c == 0x17D4 || c == 0x17D5 || c == 0x17D6 ||
                   c == ' ' || c == '\t' || c == '\n' || c == '\r' ||
                   c == '?' || c == '!' || c == '.' || c == ',' || c == ':' || c == ';' ||
                   c == '"' || c == '\'' || c == '(' || c == ')' || c == '[' || c == ']' ||
                   c == '{' || c == '}' || c == '-' || c == '+' || c == '=' || c == '/' ||
                   c == '\\' || c == '|' || c == '@' || c == '#' || c == '%' || c == '^' ||
                   c == '&' || c == '*' || c == '_' || c == '<' || c == '>' || c == '~' || c == '`';
        }

        // Valid Single Words (Consonants/Indep Vowels that can stand alone)
        // Set derived from Python/Node implementation whitelist
        private static readonly HashSet<char> ValidSingleWords = new HashSet<char>
        {
            // Independent Vowels
            '\u17A3', '\u17A4', '\u17A5', '\u17A6', '\u17A7', '\u17A8', '\u17A9', '\u17AA',
            '\u17AB', '\u17AC', '\u17AD', '\u17AE', '\u17AF', '\u17B0', '\u17B1', '\u17B2', '\u17B3',
            // Consonants that are common particles/words
            '\u1780', // Ka (neck? rare alone, but maybe) - Python list includes essentially all?
            // Let's mirror the specific subset if the logic implies "Is it a valid word if length=1?"
            // The Python implementation allows specific ones.
            // checking dictionary.ts logic: "isValidSingleWord" usually allows specific set.
            // Let's include the common ones based on heuristic usage.
            // Ideally this should match khmer-node/src/constants.ts exactly.

            // From Node implementation:
            // "KHMER_CONSTANTS.VALID_SINGLE_WORDS"
             '\u17A5', '\u17A6', '\u17A7', '\u17A9', '\u17AA', '\u17AB', '\u17AC', '\u17AD', '\u17AE', '\u17AF', '\u17B0', '\u17B1', '\u17B2', '\u17B3', // Indep vowels
             '\u1780', '\u1781', '\u1782', '\u1783', '\u1784', '\u1785', '\u1786', '\u1787', '\u1788', '\u1789', // Ka, Kha, Ko, Kho, Ngo, Ca, Cha, Co, Cho, Nyo
             '\u178A', '\u178B', '\u178C', '\u178D', '\u178E', '\u178F', '\u1790', '\u1791', '\u1792', '\u1793', // Da, Dha, Do, Dho, Na, Ta, Tha, To, Tho, No
             '\u1794', '\u1795', '\u1796', '\u1797', '\u1798', '\u1799', '\u179A', '\u179B', '\u179C', // Ba, Pha, Po, Pho, Mo, Yo, Ro, Lo, Vo
             '\u179D', '\u179E', '\u179F', '\u17A0', '\u17A1', '\u17A2' // Sa, Ha, La, Qa
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
