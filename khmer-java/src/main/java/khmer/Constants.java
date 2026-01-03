package khmer;

import java.util.Set;

/**
 * Unicode character classification utilities for Khmer script.
 * Khmer Unicode Block: U+1780 - U+17FF (main), U+19E0 - U+19FF (symbols)
 *
 * Optimized to work with both char and int (codepoint) parameters.
 */
public final class Constants {

    private Constants() {} // Utility class

    // Valid single-character words (Consonants and Independent Vowels that can stand alone)
    public static final Set<Character> VALID_SINGLE_WORDS = Set.of(
        '\u1780', '\u1781', '\u1782', '\u1784', '\u1785', '\u1786', '\u1789',
        '\u178A', '\u178F', '\u1791', '\u1796', '\u179A', '\u179B', '\u179F', '\u17A1', // Consonants
        '\u17AC', '\u17AE', '\u17AA', '\u17AF', '\u17B1', '\u17A6', '\u17A7', '\u17B3'  // Independent Vowels
    );

    // Valid single word codepoints (for fast int lookup)
    private static final int[] VALID_SINGLE_CPS = {
        0x1780, 0x1781, 0x1782, 0x1784, 0x1785, 0x1786, 0x1789,
        0x178A, 0x178F, 0x1791, 0x1796, 0x179A, 0x179B, 0x179F, 0x17A1,
        0x17AC, 0x17AE, 0x17AA, 0x17AF, 0x17B1, 0x17A6, 0x17A7, 0x17B3
    };

    // Currency symbol codepoints
    private static final int[] CURRENCY_CPS = {
        '$', 0x17DB, 0x20AC, 0x00A3, 0x00A5 // $, ៛, €, £, ¥
    };

    // Separator characters
    public static final String SEPARATOR_CHARS = "!?.,;:\"'()[]{}-/ \u00AB\u00BB\u201C\u201D\u02DD$%";

    /**
     * Check if codepoint is in Khmer Unicode range.
     */
    public static boolean isKhmerChar(int cp) {
        return (cp >= 0x1780 && cp <= 0x17FF) || (cp >= 0x19E0 && cp <= 0x19FF);
    }

    /**
     * Check if codepoint is a Khmer consonant (U+1780 - U+17A2).
     */
    public static boolean isConsonant(int cp) {
        return cp >= 0x1780 && cp <= 0x17A2;
    }

    /**
     * Check if codepoint is a Coeng (subscript marker) U+17D2.
     */
    public static boolean isCoeng(int cp) {
        return cp == 0x17D2;
    }

    /**
     * Check if codepoint is a dependent vowel (U+17B6 - U+17C5).
     */
    public static boolean isDependentVowel(int cp) {
        return cp >= 0x17B6 && cp <= 0x17C5;
    }

    /**
     * Check if codepoint is a sign/diacritic (U+17C6 - U+17D1, U+17D3, U+17DD).
     */
    public static boolean isSign(int cp) {
        return (cp >= 0x17C6 && cp <= 0x17D1) || cp == 0x17D3 || cp == 0x17DD;
    }

    /**
     * Check if codepoint is a digit (ASCII 0-9 or Khmer 0-9).
     */
    public static boolean isDigit(int cp) {
        return (cp >= '0' && cp <= '9') || (cp >= 0x17E0 && cp <= 0x17E9);
    }

    /**
     * Check if string is all digits.
     */
    public static boolean isAllDigits(String s) {
        if (s == null || s.isEmpty()) return false;
        return s.codePoints().allMatch(Constants::isDigit);
    }

    /**
     * Check if codepoint is a currency symbol.
     */
    public static boolean isCurrencySymbol(int cp) {
        for (int c : CURRENCY_CPS) {
            if (cp == c) return true;
        }
        return false;
    }

    /**
     * Check if codepoint is a separator/punctuation.
     */
    public static boolean isSeparator(int cp) {
        // Khmer punctuation range
        if (cp >= 0x17D4 && cp <= 0x17DA) return true;
        // Currency Riel
        if (cp == 0x17DB) return true;
        // ASCII/General punctuation (only check if in BMP range)
        if (cp <= 0xFFFF) {
            return SEPARATOR_CHARS.indexOf((char) cp) >= 0;
        }
        return false;
    }

    /**
     * Check if codepoint is a valid single-character word.
     */
    public static boolean isValidSingleWord(int cp) {
        for (int c : VALID_SINGLE_CPS) {
            if (cp == c) return true;
        }
        return false;
    }

    // Overloads for char compatibility
    public static boolean isKhmerChar(char c) { return isKhmerChar((int) c); }
    public static boolean isConsonant(char c) { return isConsonant((int) c); }
    public static boolean isCoeng(char c) { return isCoeng((int) c); }
    public static boolean isDependentVowel(char c) { return isDependentVowel((int) c); }
    public static boolean isSign(char c) { return isSign((int) c); }
    public static boolean isDigit(char c) { return isDigit((int) c); }
    public static boolean isCurrencySymbol(char c) { return isCurrencySymbol((int) c); }
    public static boolean isSeparator(char c) { return isSeparator((int) c); }
    public static boolean isValidSingleWord(char c) { return isValidSingleWord((int) c); }
}
