// Khmer Unicode Ranges
export const KHMER_START = 0x1780;
export const KHMER_END = 0x17FF;
export const KHMER_SYMBOLS_START = 0x19E0;
export const KHMER_SYMBOLS_END = 0x19FF;

// === CharCode-based functions (faster - no string object creation) ===

export function isKhmerCharCode(code: number): boolean {
    return (code >= 0x1780 && code <= 0x17FF) || (code >= 0x19E0 && code <= 0x19FF);
}

export function isConsonantCode(code: number): boolean {
    return code >= 0x1780 && code <= 0x17A2;
}

export function isDependentVowelCode(code: number): boolean {
    return code >= 0x17B6 && code <= 0x17C5;
}

export function isSignCode(code: number): boolean {
    return (code >= 0x17C6 && code <= 0x17D1) || code === 0x17D3 || code === 0x17DD;
}

export function isCoengCode(code: number): boolean {
    return code === 0x17D2;
}

export function isDigitCode(code: number): boolean {
    return (code >= 0x30 && code <= 0x39) || (code >= 0x17E0 && code <= 0x17E9);
}

export function isCurrencyCode(code: number): boolean {
    return code === 0x24 || code === 0x17DB || code === 0x20AC || code === 0xA3 || code === 0xA5;
}

// Pre-built lookup table for ASCII separator check (much faster than Set.has)
const SEPARATOR_ASCII_LOOKUP = new Uint8Array(128);
const ASCII_SEPARATORS = '!?.,;:\'"()[]{}$-/%  ';
for (let i = 0; i < ASCII_SEPARATORS.length; i++) {
    const code = ASCII_SEPARATORS.charCodeAt(i);
    if (code < 128) SEPARATOR_ASCII_LOOKUP[code] = 1;
}
// Special Unicode separators as a Set (created once, not per call)
const UNICODE_SEPARATORS = new Set([0x00AB, 0x00BB, 0x201C, 0x201D, 0x02DD]); // «»""˝

export function isSeparatorCode(code: number): boolean {
    if (code >= 0x17D4 && code <= 0x17DA) return true;
    if (code === 0x17DB) return true;
    if (code < 128) return SEPARATOR_ASCII_LOOKUP[code] === 1;
    return UNICODE_SEPARATORS.has(code);
}

// Valid single-character words - pre-compute codes for O(1) lookup
const VALID_SINGLE_CODES = new Set<number>();
const VALID_SINGLE_CHARS = ['ក', 'ខ', 'គ', 'ង', 'ច', 'ឆ', 'ញ', 'ដ', 'ត', 'ទ', 'ព', 'រ', 'ល', 'ស', 'ឡ', 'ឬ', 'ឮ', 'ឪ', 'ឯ', 'ឱ', 'ឦ', 'ឧ', 'ឳ'];
for (const c of VALID_SINGLE_CHARS) {
    VALID_SINGLE_CODES.add(c.charCodeAt(0));
}

export function isValidSingleWordCode(code: number): boolean {
    return VALID_SINGLE_CODES.has(code);
}

// === String-based functions (for compatibility) ===

// Use charCodeAt (faster than codePointAt) - safe for Khmer which is in BMP
export function isKhmerChar(c: string): boolean {
    const code = c.charCodeAt(0);
    return (code >= 0x1780 && code <= 0x17FF) || (code >= 0x19E0 && code <= 0x19FF);
}

export function isConsonant(c: string): boolean {
    const code = c.charCodeAt(0);
    return code >= 0x1780 && code <= 0x17A2;
}

export function isIndependentVowel(c: string): boolean {
    const code = c.charCodeAt(0);
    return code >= 0x17A3 && code <= 0x17B3;
}

export function isDependentVowel(c: string): boolean {
    const code = c.charCodeAt(0);
    return code >= 0x17B6 && code <= 0x17C5;
}

export function isSign(c: string): boolean {
    const code = c.charCodeAt(0);
    return (code >= 0x17C6 && code <= 0x17D1) || code === 0x17D3 || code === 0x17DD;
}

export function isCoeng(c: string): boolean {
    return c.charCodeAt(0) === 0x17D2;
}

export function isDigit(c: string): boolean {
    const code = c.charCodeAt(0);
    // ASCII 0-9 or Khmer 0-9
    return (code >= 0x30 && code <= 0x39) || (code >= 0x17E0 && code <= 0x17E9);
}

export function isCurrencySymbol(c: string): boolean {
    return c === '$' || c === '\u17DB' || c === '€' || c === '£' || c === '¥';
}

export function isSeparator(c: string): boolean {
    const code = c.charCodeAt(0);
    // Khmer Punctuation 0x17D4 - 0x17DA
    if (code >= 0x17D4 && code <= 0x17DA) {
        return true;
    }
    // Khmer currency
    if (code === 0x17DB) {
        return true;
    }
    // ASCII range - use fast lookup table
    if (code < 128) {
        return SEPARATOR_ASCII_LOOKUP[code] === 1;
    }
    // Unicode separators
    return UNICODE_SEPARATORS.has(code);
}

const VALID_SINGLE_WORDS = new Set(VALID_SINGLE_CHARS);

export function isValidSingleWord(c: string): boolean {
    return VALID_SINGLE_CODES.has(c.charCodeAt(0));
}
