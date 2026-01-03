
// Khmer Unicode Ranges
pub const KHMER_START: char = '\u{1780}';
pub const KHMER_END: char = '\u{17FF}';
pub const KHMER_SYMBOLS_START: char = '\u{19E0}';
pub const KHMER_SYMBOLS_END: char = '\u{19FF}';

pub fn is_khmer_char(c: char) -> bool {
    let code = c as u32;
    (code >= 0x1780 && code <= 0x17FF) || (code >= 0x19E0 && code <= 0x19FF)
}

pub fn is_consonant(c: char) -> bool {
    let code = c as u32;
    code >= 0x1780 && code <= 0x17A2
}

pub fn is_independent_vowel(c: char) -> bool {
    let code = c as u32;
    code >= 0x17A3 && code <= 0x17B3
}

pub fn is_dependent_vowel(c: char) -> bool {
    let code = c as u32;
    code >= 0x17B6 && code <= 0x17C5
}

pub fn is_sign(c: char) -> bool {
    let code = c as u32;
    (code >= 0x17C6 && code <= 0x17D1) || c == '\u{17D3}' || c == '\u{17DD}'
}

pub fn is_coeng(c: char) -> bool {
    c == '\u{17D2}'
}

pub fn is_digit(c: char) -> bool {
    let code = c as u32;
    // ASCII 0-9 or Khmer 0-9
    (code >= 0x30 && code <= 0x39) || (code >= 0x17E0 && code <= 0x17E9)
}

pub fn is_currency_symbol(c: char) -> bool {
    matches!(c, '$' | '\u{17DB}' | '€' | '£' | '¥')
}

pub fn is_separator(c: char) -> bool {
    let code = c as u32;
    // Khmer Punctuation 0x17D4 - 0x17DA
    if code >= 0x17D4 && code <= 0x17DA {
        return true;
    }
    // Currency Reil (U+17DB) is NOT a separator for splitting purposes in our logic (it's currency)
    // But verify viterbi.py logic: _is_separator includes 17DB?
    // viterbi.py line 339: "if code == 0x17DB: return True" -> WAIT.
    // viterbi.py line 334 says "NO, U+17DB is Currency Reil" but line 339 explicitly returns True?
    // Let's re-read the python code carefully.
    // Line 339: if code == 0x17DB: return True.
    // So it IS considered a separator in the python code.
    if c == '\u{17DB}' {
        return true;
    }

    // Common punctuation
    matches!(c, '!' | '?' | '.' | ',' | ';' | ':' | '"' | '\'' | '(' | ')' | '[' | ']' | '{' | '}' | '-' | '/' | '«' | '»' | '“' | '”' | '˝' | '$' | '%' | ' ')
}

// Valid single-character words (Consonants + Independent Vowels)
pub fn is_valid_single_word(c: char) -> bool {
    // Consonants
    if matches!(c, 'ក' | 'ខ' | 'គ' | 'ង' | 'ច' | 'ឆ' | 'ញ' | 'ដ' | 'ត' | 'ទ' | 'ព' | 'រ' | 'ល' | 'ស' | 'ឡ') {
        return true;
    }
    // Independent Vowels
    matches!(c, 'ឬ' | 'ឮ' | 'ឪ' | 'ឯ' | 'ឱ' | 'ឦ' | 'ឧ' | 'ឳ')
}
