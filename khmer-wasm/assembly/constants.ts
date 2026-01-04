
// Character codes
export const ZERO_WIDTH_SPACE: i32 = 0x200B;
export const KHMER_VOWEL_A: i32 = 0x17B6;
export const KHMER_VOWEL_YA: i32 = 0x17C5;
export const KHMER_SIGN_BANTOC: i32 = 0x17CB;
export const KHMER_SIGN_YUUKALEAPINTU: i32 = 0x17D3;

// ============================================================================
// High-performance character classification using lookup tables with bit flags
// Inspired by 1 Billion Row Challenge optimizations
// ============================================================================

// Bit flags for character types - combined into single table
const FLAG_DIGIT: u8 = 1;
const FLAG_CONSONANT: u8 = 2;
const FLAG_DEP_VOWEL: u8 = 4;
const FLAG_SIGN: u8 = 8;
const FLAG_SEPARATOR: u8 = 16;
const FLAG_VALID_SINGLE: u8 = 32;
const FLAG_KHMER: u8 = 64;
const FLAG_CURRENCY: u8 = 128;

// Table covers 0x0000 to 0x17FF (Khmer range + ASCII)
const TABLE_SIZE: i32 = 0x1800;
const CHAR_FLAGS: StaticArray<u8> = new StaticArray<u8>(TABLE_SIZE);

// Initialize the unified lookup table
function initCharFlags(): void {
  // ASCII Digits (0-9)
  for (let c: i32 = 0x30; c <= 0x39; c++) {
    CHAR_FLAGS[c] = CHAR_FLAGS[c] | FLAG_DIGIT;
  }

  // Khmer Digits (0x17E0-0x17E9)
  for (let c: i32 = 0x17E0; c <= 0x17E9; c++) {
    CHAR_FLAGS[c] = CHAR_FLAGS[c] | FLAG_DIGIT;
  }

  // Khmer Consonants (0x1780-0x17A2)
  for (let c: i32 = 0x1780; c <= 0x17A2; c++) {
    CHAR_FLAGS[c] = CHAR_FLAGS[c] | FLAG_CONSONANT;
  }

  // Dependent Vowels (0x17B6-0x17C5)
  for (let c: i32 = 0x17B6; c <= 0x17C5; c++) {
    CHAR_FLAGS[c] = CHAR_FLAGS[c] | FLAG_DEP_VOWEL;
  }

  // Signs (0x17C6-0x17D1, 0x17D3, 0x17DD)
  for (let c: i32 = 0x17C6; c <= 0x17D1; c++) {
    CHAR_FLAGS[c] = CHAR_FLAGS[c] | FLAG_SIGN;
  }
  CHAR_FLAGS[0x17D3] = CHAR_FLAGS[0x17D3] | FLAG_SIGN;
  CHAR_FLAGS[0x17DD] = CHAR_FLAGS[0x17DD] | FLAG_SIGN;

  // Khmer range (0x1780-0x17FF)
  for (let c: i32 = 0x1780; c <= 0x17FF; c++) {
    CHAR_FLAGS[c] = CHAR_FLAGS[c] | FLAG_KHMER;
  }

  // Currency symbols
  CHAR_FLAGS[0x24] = CHAR_FLAGS[0x24] | FLAG_CURRENCY; // $
  CHAR_FLAGS[0x17DB] = CHAR_FLAGS[0x17DB] | FLAG_CURRENCY; // Khmer Riel

  // Separators - ASCII
  CHAR_FLAGS[0x20] = CHAR_FLAGS[0x20] | FLAG_SEPARATOR; // Space
  CHAR_FLAGS[0x09] = CHAR_FLAGS[0x09] | FLAG_SEPARATOR; // Tab
  CHAR_FLAGS[0x0A] = CHAR_FLAGS[0x0A] | FLAG_SEPARATOR; // LF
  CHAR_FLAGS[0x0D] = CHAR_FLAGS[0x0D] | FLAG_SEPARATOR; // CR
  CHAR_FLAGS[0x3F] = CHAR_FLAGS[0x3F] | FLAG_SEPARATOR; // ?
  CHAR_FLAGS[0x21] = CHAR_FLAGS[0x21] | FLAG_SEPARATOR; // !
  CHAR_FLAGS[0x2E] = CHAR_FLAGS[0x2E] | FLAG_SEPARATOR; // .
  CHAR_FLAGS[0x2C] = CHAR_FLAGS[0x2C] | FLAG_SEPARATOR; // ,
  CHAR_FLAGS[0x3A] = CHAR_FLAGS[0x3A] | FLAG_SEPARATOR; // :
  CHAR_FLAGS[0x3B] = CHAR_FLAGS[0x3B] | FLAG_SEPARATOR; // ;
  CHAR_FLAGS[0x22] = CHAR_FLAGS[0x22] | FLAG_SEPARATOR; // "
  CHAR_FLAGS[0x27] = CHAR_FLAGS[0x27] | FLAG_SEPARATOR; // '
  CHAR_FLAGS[0x28] = CHAR_FLAGS[0x28] | FLAG_SEPARATOR; // (
  CHAR_FLAGS[0x29] = CHAR_FLAGS[0x29] | FLAG_SEPARATOR; // )
  CHAR_FLAGS[0x5B] = CHAR_FLAGS[0x5B] | FLAG_SEPARATOR; // [
  CHAR_FLAGS[0x5D] = CHAR_FLAGS[0x5D] | FLAG_SEPARATOR; // ]
  CHAR_FLAGS[0x7B] = CHAR_FLAGS[0x7B] | FLAG_SEPARATOR; // {
  CHAR_FLAGS[0x7D] = CHAR_FLAGS[0x7D] | FLAG_SEPARATOR; // }
  CHAR_FLAGS[0x2D] = CHAR_FLAGS[0x2D] | FLAG_SEPARATOR; // -
  CHAR_FLAGS[0x2F] = CHAR_FLAGS[0x2F] | FLAG_SEPARATOR; // /
  CHAR_FLAGS[0x24] = CHAR_FLAGS[0x24] | FLAG_SEPARATOR; // $
  CHAR_FLAGS[0x25] = CHAR_FLAGS[0x25] | FLAG_SEPARATOR; // %
  CHAR_FLAGS[0xAB] = CHAR_FLAGS[0xAB] | FLAG_SEPARATOR; // «
  CHAR_FLAGS[0xBB] = CHAR_FLAGS[0xBB] | FLAG_SEPARATOR; // »
  CHAR_FLAGS[0x2DD] = CHAR_FLAGS[0x2DD] | FLAG_SEPARATOR; // ˝

  // Khmer punctuation range (0x17D4-0x17DB)
  for (let c: i32 = 0x17D4; c <= 0x17DB; c++) {
    CHAR_FLAGS[c] = CHAR_FLAGS[c] | FLAG_SEPARATOR;
  }

  // Valid single words - Consonants
  CHAR_FLAGS[0x1780] = CHAR_FLAGS[0x1780] | FLAG_VALID_SINGLE; // ក
  CHAR_FLAGS[0x1781] = CHAR_FLAGS[0x1781] | FLAG_VALID_SINGLE; // ខ
  CHAR_FLAGS[0x1782] = CHAR_FLAGS[0x1782] | FLAG_VALID_SINGLE; // គ
  CHAR_FLAGS[0x1784] = CHAR_FLAGS[0x1784] | FLAG_VALID_SINGLE; // ង
  CHAR_FLAGS[0x1785] = CHAR_FLAGS[0x1785] | FLAG_VALID_SINGLE; // ច
  CHAR_FLAGS[0x1786] = CHAR_FLAGS[0x1786] | FLAG_VALID_SINGLE; // ឆ
  CHAR_FLAGS[0x1789] = CHAR_FLAGS[0x1789] | FLAG_VALID_SINGLE; // ញ
  CHAR_FLAGS[0x178A] = CHAR_FLAGS[0x178A] | FLAG_VALID_SINGLE; // ដ
  CHAR_FLAGS[0x178F] = CHAR_FLAGS[0x178F] | FLAG_VALID_SINGLE; // ត
  CHAR_FLAGS[0x1791] = CHAR_FLAGS[0x1791] | FLAG_VALID_SINGLE; // ទ
  CHAR_FLAGS[0x1796] = CHAR_FLAGS[0x1796] | FLAG_VALID_SINGLE; // ព
  CHAR_FLAGS[0x179A] = CHAR_FLAGS[0x179A] | FLAG_VALID_SINGLE; // រ
  CHAR_FLAGS[0x179B] = CHAR_FLAGS[0x179B] | FLAG_VALID_SINGLE; // ល
  CHAR_FLAGS[0x179F] = CHAR_FLAGS[0x179F] | FLAG_VALID_SINGLE; // ស
  CHAR_FLAGS[0x17A1] = CHAR_FLAGS[0x17A1] | FLAG_VALID_SINGLE; // ឡ

  // Valid single words - Independent Vowels
  CHAR_FLAGS[0x17A6] = CHAR_FLAGS[0x17A6] | FLAG_VALID_SINGLE; // ឦ
  CHAR_FLAGS[0x17A7] = CHAR_FLAGS[0x17A7] | FLAG_VALID_SINGLE; // ឧ
  CHAR_FLAGS[0x17AA] = CHAR_FLAGS[0x17AA] | FLAG_VALID_SINGLE; // ឪ
  CHAR_FLAGS[0x17AC] = CHAR_FLAGS[0x17AC] | FLAG_VALID_SINGLE; // ឬ
  CHAR_FLAGS[0x17AE] = CHAR_FLAGS[0x17AE] | FLAG_VALID_SINGLE; // ឮ
  CHAR_FLAGS[0x17AF] = CHAR_FLAGS[0x17AF] | FLAG_VALID_SINGLE; // ឯ
  CHAR_FLAGS[0x17B1] = CHAR_FLAGS[0x17B1] | FLAG_VALID_SINGLE; // ឱ
  CHAR_FLAGS[0x17B3] = CHAR_FLAGS[0x17B3] | FLAG_VALID_SINGLE; // ឳ
}

// Initialize table at module load
initCharFlags();

// ============================================================================
// Inline lookup functions using the unified table
// ============================================================================

@inline
export function isDigit(c: i32): boolean {
  return c < TABLE_SIZE && (CHAR_FLAGS[c] & FLAG_DIGIT) != 0;
}

@inline
export function isConsonant(c: i32): boolean {
  return c < TABLE_SIZE && (CHAR_FLAGS[c] & FLAG_CONSONANT) != 0;
}

@inline
export function isDependentVowel(c: i32): boolean {
  return c < TABLE_SIZE && (CHAR_FLAGS[c] & FLAG_DEP_VOWEL) != 0;
}

@inline
export function isSign(c: i32): boolean {
  return c < TABLE_SIZE && (CHAR_FLAGS[c] & FLAG_SIGN) != 0;
}

@inline
export function isCoeng(c: i32): boolean {
  return c == 0x17D2;
}

@inline
export function isKhmerChar(c: i32): boolean {
  // Include extended Khmer range (0x19E0-0x19FF) with direct check
  return (c < TABLE_SIZE && (CHAR_FLAGS[c] & FLAG_KHMER) != 0)
         || (c >= 0x19E0 && c <= 0x19FF);
}

@inline
export function isCurrencySymbol(c: i32): boolean {
  return c < TABLE_SIZE && (CHAR_FLAGS[c] & FLAG_CURRENCY) != 0;
}

@inline
export function isSeparator(c: i32): boolean {
  if (c < TABLE_SIZE) {
    return (CHAR_FLAGS[c] & FLAG_SEPARATOR) != 0;
  }
  // Unicode curly quotes (outside table range)
  return c == 0x201C || c == 0x201D;
}

@inline
export function isIndependentVowel(c: i32): boolean {
  return c >= 0x17A3 && c <= 0x17B3;
}

@inline
export function isValidSingleWord(c: i32): boolean {
  return c < TABLE_SIZE && (CHAR_FLAGS[c] & FLAG_VALID_SINGLE) != 0;
}
