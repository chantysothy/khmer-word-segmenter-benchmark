// Khmer Unicode Ranges
export const KHMER_START = 0x1780;
export const KHMER_END = 0x17FF;
export const KHMER_SYMBOLS_START = 0x19E0;
export const KHMER_SYMBOLS_END = 0x19FF;

export function isKhmerChar(c: string): boolean {
    const code = c.codePointAt(0) || 0;
    return (code >= 0x1780 && code <= 0x17FF) || (code >= 0x19E0 && code <= 0x19FF);
}

export function isConsonant(c: string): boolean {
    const code = c.codePointAt(0) || 0;
    return code >= 0x1780 && code <= 0x17A2;
}

export function isIndependentVowel(c: string): boolean {
    const code = c.codePointAt(0) || 0;
    return code >= 0x17A3 && code <= 0x17B3;
}

export function isDependentVowel(c: string): boolean {
    const code = c.codePointAt(0) || 0;
    return code >= 0x17B6 && code <= 0x17C5;
}

export function isSign(c: string): boolean {
    const code = c.codePointAt(0) || 0;
    return (code >= 0x17C6 && code <= 0x17D1) || c === '\u17D3' || c === '\u17DD';
}

export function isCoeng(c: string): boolean {
    return c === '\u17D2';
}

export function isDigit(c: string): boolean {
    const code = c.codePointAt(0) || 0;
    // ASCII 0-9 or Khmer 0-9
    return (code >= 0x30 && code <= 0x39) || (code >= 0x17E0 && code <= 0x17E9);
}

export function isCurrencySymbol(c: string): boolean {
    return c === '$' || c === '\u17DB' || c === '€' || c === '£' || c === '¥';
}

export function isSeparator(c: string): boolean {
    const code = c.codePointAt(0) || 0;
    // Khmer Punctuation 0x17D4 - 0x17DA
    if (code >= 0x17D4 && code <= 0x17DA) {
        return true;
    }

    if (c === '\u17DB') {
        return true;
    }

    const separators = new Set(['!', '?', '.', ',', ';', ':', '"', "'", '(', ')', '[', ']', '{', '}', '-', '/', '«', '»', '“', '”', '˝', '$', '%', ' ']);
    return separators.has(c);
}

// Valid single-character words (Consonants + Independent Vowels)
const VALID_SINGLE_WORDS = new Set(['ក', 'ខ', 'គ', 'ង', 'ច', 'ឆ', 'ញ', 'ដ', 'ត', 'ទ', 'ព', 'រ', 'ល', 'ស', 'ឡ', 'ឬ', 'ឮ', 'ឪ', 'ឯ', 'ឱ', 'ឦ', 'ឧ', 'ឳ']);

export function isValidSingleWord(c: string): boolean {
    return VALID_SINGLE_WORDS.has(c);
}
