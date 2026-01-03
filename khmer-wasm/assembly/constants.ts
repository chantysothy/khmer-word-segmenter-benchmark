
// Character codes
export const ZERO_WIDTH_SPACE: i32 = 0x200B;
export const KHMER_VOWEL_A: i32 = 0x17B6;
export const KHMER_VOWEL_YA: i32 = 0x17C5;
export const KHMER_SIGN_BANTOC: i32 = 0x17CB;
export const KHMER_SIGN_YUUKALEAPINTU: i32 = 0x17D3;

// Pre-computed lookup tables for O(1) character classification
// Separator table covers up to 0x17DC (Khmer Riel)
const SEPARATOR_TABLE_SIZE: i32 = 0x17DC + 1;
const SEPARATOR_TABLE: StaticArray<u8> = new StaticArray<u8>(SEPARATOR_TABLE_SIZE);

// Valid single word table covers Khmer consonants and vowels
const VALID_SINGLE_TABLE_SIZE: i32 = 0x17B4;
const VALID_SINGLE_TABLE: StaticArray<u8> = new StaticArray<u8>(VALID_SINGLE_TABLE_SIZE);

// Initialize separator table
function initSeparatorTable(): void {
  // ASCII separators
  SEPARATOR_TABLE[0x0020] = 1; // Space
  SEPARATOR_TABLE[0x000A] = 1; // LF
  SEPARATOR_TABLE[0x000D] = 1; // CR
  SEPARATOR_TABLE[0x0009] = 1; // Tab
  // Common ASCII punctuation
  SEPARATOR_TABLE[0x0021] = 1; // !
  SEPARATOR_TABLE[0x003F] = 1; // ?
  SEPARATOR_TABLE[0x002E] = 1; // .
  SEPARATOR_TABLE[0x002C] = 1; // ,
  SEPARATOR_TABLE[0x003B] = 1; // ;
  SEPARATOR_TABLE[0x003A] = 1; // :
  SEPARATOR_TABLE[0x0022] = 1; // "
  SEPARATOR_TABLE[0x0027] = 1; // '
  SEPARATOR_TABLE[0x0028] = 1; // (
  SEPARATOR_TABLE[0x0029] = 1; // )
  SEPARATOR_TABLE[0x005B] = 1; // [
  SEPARATOR_TABLE[0x005D] = 1; // ]
  SEPARATOR_TABLE[0x007B] = 1; // {
  SEPARATOR_TABLE[0x007D] = 1; // }
  SEPARATOR_TABLE[0x002D] = 1; // -
  SEPARATOR_TABLE[0x002F] = 1; // /
  SEPARATOR_TABLE[0x0024] = 1; // $
  SEPARATOR_TABLE[0x0025] = 1; // %
  // Extended quotation marks (Latin-1)
  SEPARATOR_TABLE[0x00AB] = 1; // «
  SEPARATOR_TABLE[0x00BB] = 1; // »
  SEPARATOR_TABLE[0x02DD] = 1; // ˝ Double acute accent
  // Khmer punctuation range (0x17D4-0x17DB)
  for (let i: i32 = 0x17D4; i <= 0x17DB; i++) {
    SEPARATOR_TABLE[i] = 1;
  }
}

// Initialize valid single word table
function initValidSingleTable(): void {
  // Consonants: ក ខ គ ង ច ឆ ញ ដ ត ទ ព រ ល ស ឡ
  VALID_SINGLE_TABLE[0x1780] = 1; // ក
  VALID_SINGLE_TABLE[0x1781] = 1; // ខ
  VALID_SINGLE_TABLE[0x1782] = 1; // គ
  VALID_SINGLE_TABLE[0x1784] = 1; // ង
  VALID_SINGLE_TABLE[0x1785] = 1; // ច
  VALID_SINGLE_TABLE[0x1786] = 1; // ឆ
  VALID_SINGLE_TABLE[0x1789] = 1; // ញ
  VALID_SINGLE_TABLE[0x178A] = 1; // ដ
  VALID_SINGLE_TABLE[0x178F] = 1; // ត
  VALID_SINGLE_TABLE[0x1791] = 1; // ទ
  VALID_SINGLE_TABLE[0x1796] = 1; // ព
  VALID_SINGLE_TABLE[0x179A] = 1; // រ
  VALID_SINGLE_TABLE[0x179B] = 1; // ល
  VALID_SINGLE_TABLE[0x179F] = 1; // ស
  VALID_SINGLE_TABLE[0x17A1] = 1; // ឡ
  // Independent Vowels
  VALID_SINGLE_TABLE[0x17A6] = 1; // ឦ
  VALID_SINGLE_TABLE[0x17A7] = 1; // ឧ
  VALID_SINGLE_TABLE[0x17AA] = 1; // ឪ
  VALID_SINGLE_TABLE[0x17AC] = 1; // ឬ
  VALID_SINGLE_TABLE[0x17AE] = 1; // ឮ
  VALID_SINGLE_TABLE[0x17AF] = 1; // ឯ
  VALID_SINGLE_TABLE[0x17B1] = 1; // ឱ
  VALID_SINGLE_TABLE[0x17B3] = 1; // ឳ
}

// Initialize tables at module load
initSeparatorTable();
initValidSingleTable();

// Inline functions for hot paths
@inline
export function isDigit(c: i32): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x17E0 && c <= 0x17E9);
}

@inline
export function isConsonant(c: i32): boolean {
  return c >= 0x1780 && c <= 0x17A2;
}

@inline
export function isDependentVowel(c: i32): boolean {
  return c >= 0x17B6 && c <= 0x17C5;
}

@inline
export function isSign(c: i32): boolean {
  return (c >= 0x17C6 && c <= 0x17D1) || c == 0x17D3 || c == 0x17DD;
}

@inline
export function isCoeng(c: i32): boolean {
  return c == 0x17D2;
}

@inline
export function isKhmerChar(c: i32): boolean {
  return c >= 0x1780 && c <= 0x17FF;
}

@inline
export function isCurrencySymbol(c: i32): boolean {
  return c == 0x17DB;
}

@inline
export function isSeparator(c: i32): boolean {
  if (c < SEPARATOR_TABLE_SIZE) {
    return SEPARATOR_TABLE[c] == 1;
  }
  // Unicode quotation marks (outside table range)
  return c == 0x201C || c == 0x201D;
}

@inline
export function isIndependentVowel(c: i32): boolean {
  return c >= 0x17A5 && c <= 0x17B3;
}

@inline
export function isValidSingleWord(c: i32): boolean {
  if (c < VALID_SINGLE_TABLE_SIZE) {
    return VALID_SINGLE_TABLE[c] == 1;
  }
  return false;
}
