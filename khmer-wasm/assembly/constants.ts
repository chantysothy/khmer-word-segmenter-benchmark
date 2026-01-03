
// Character codes
export const ZERO_WIDTH_SPACE: i32 = 0x200B;
export const KHMER_VOWEL_A: i32 = 0x17B6;
export const KHMER_VOWEL_YA: i32 = 0x17C5;
export const KHMER_SIGN_BANTOC: i32 = 0x17CB;
export const KHMER_SIGN_YUUKALEAPINTU: i32 = 0x17D3;

export function isDigit(c: i32): boolean {
  // ASCII 0-9 (0x30-0x39) or Khmer 0-9 (0x17E0-0x17E9)
  return (c >= 0x30 && c <= 0x39) || (c >= 0x17E0 && c <= 0x17E9);
}

export function isConsonant(c: i32): boolean {
  return c >= 0x1780 && c <= 0x17B3;
}

export function isDependentVowel(c: i32): boolean {
  return c >= 0x17B6 && c <= 0x17C5;
}

export function isSign(c: i32): boolean {
  return c >= 0x17C9 && c <= 0x17D3;
}

// COENG (u17D2)
export function isCoeng(c: i32): boolean {
  return c == 0x17D2;
}

export function isKhmerChar(c: i32): boolean {
  return c >= 0x1780 && c <= 0x17FF;
}

export function isCurrencySymbol(c: i32): boolean {
  return c == 0x17DB; // Riel
}

// Separators (comprehensive list matching Python/Node/Java implementations)
export function isSeparator(c: i32): boolean {
  // ASCII separators
  if (c == 0x0020) return true; // Space
  if (c == 0x000A) return true; // LF
  if (c == 0x000D) return true; // CR
  if (c == 0x0009) return true; // Tab
  if (c == 0x200B) return true; // ZWS
  // Common ASCII punctuation
  if (c == 0x0021) return true; // !
  if (c == 0x003F) return true; // ?
  if (c == 0x002E) return true; // .
  if (c == 0x002C) return true; // ,
  if (c == 0x003B) return true; // ;
  if (c == 0x003A) return true; // :
  if (c == 0x0022) return true; // "
  if (c == 0x0027) return true; // '
  if (c == 0x0028) return true; // (
  if (c == 0x0029) return true; // )
  if (c == 0x005B) return true; // [
  if (c == 0x005D) return true; // ]
  if (c == 0x007B) return true; // {
  if (c == 0x007D) return true; // }
  if (c == 0x002D) return true; // -
  if (c == 0x002F) return true; // /
  if (c == 0x0024) return true; // $
  if (c == 0x0025) return true; // %
  // Extended quotation marks (Latin-1)
  if (c == 0x00AB) return true; // « Left-Pointing Double Angle Quotation Mark
  if (c == 0x00BB) return true; // » Right-Pointing Double Angle Quotation Mark
  // Unicode quotation marks
  if (c == 0x201C) return true; // " Left Double Quotation Mark
  if (c == 0x201D) return true; // " Right Double Quotation Mark
  // Khmer punctuation range
  if (c >= 0x17D4 && c <= 0x17DA) return true;
  // Currency Riel
  if (c == 0x17DB) return true;
  return false;
}

export function isIndependentVowel(c: i32): boolean {
  return c >= 0x17A5 && c <= 0x17B3;
}

export function isValidSingleWord(c: i32): boolean {
  // Valid single-character words (Consonants and Independent Vowels that can stand alone)
  // Matching Java/Node.js implementation
  // Consonants: ក ខ គ ង ច ឆ ញ ដ ត ទ ព រ ល ស ឡ
  if (c == 0x1780) return true; // ក
  if (c == 0x1781) return true; // ខ
  if (c == 0x1782) return true; // គ
  if (c == 0x1784) return true; // ង
  if (c == 0x1785) return true; // ច
  if (c == 0x1786) return true; // ឆ
  if (c == 0x1789) return true; // ញ
  if (c == 0x178A) return true; // ដ
  if (c == 0x178F) return true; // ត
  if (c == 0x1791) return true; // ទ
  if (c == 0x1796) return true; // ព
  if (c == 0x179A) return true; // រ
  if (c == 0x179B) return true; // ល
  if (c == 0x179F) return true; // ស
  if (c == 0x17A1) return true; // ឡ
  // Independent Vowels
  if (c == 0x17A6) return true; // ឦ
  if (c == 0x17A7) return true; // ឧ
  if (c == 0x17AA) return true; // ឪ
  if (c == 0x17AC) return true; // ឬ
  if (c == 0x17AE) return true; // ឮ
  if (c == 0x17AF) return true; // ឯ
  if (c == 0x17B1) return true; // ឱ
  if (c == 0x17B3) return true; // ឳ
  return false;
}
