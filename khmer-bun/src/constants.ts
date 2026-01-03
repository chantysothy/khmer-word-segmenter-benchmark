// Character codes
export const ZERO_WIDTH_SPACE = 0x200B;
export const KHMER_VOWEL_A = 0x17B6;
export const KHMER_VOWEL_YA = 0x17C5;
export const KHMER_SIGN_BANTOC = 0x17CB;
export const KHMER_SIGN_YUUKALEAPINTU = 0x17D3;

// Pre-computed lookup tables for O(1) character classification
// Using Uint8Array for fastest lookup (cache-friendly)
const SEPARATOR_TABLE = new Uint8Array(0x17DC + 1);
const VALID_SINGLE_TABLE = new Uint8Array(0x17B4);

// Initialize separator table
const SEPARATORS = [
  0x0020, 0x000A, 0x000D, 0x0009, 0x200B, // Whitespace
  0x0021, 0x003F, 0x002E, 0x002C, 0x003B, 0x003A, // Punctuation
  0x0022, 0x0027, 0x0028, 0x0029, 0x005B, 0x005D, 0x007B, 0x007D, // Brackets/quotes
  0x002D, 0x002F, 0x0024, 0x0025, // Others
  0x00AB, 0x00BB, 0x02DD, // Extended quotes (includes ˝ double acute)
  0x17D4, 0x17D5, 0x17D6, 0x17D7, 0x17D8, 0x17D9, 0x17DA, 0x17DB, // Khmer punctuation
];
for (const c of SEPARATORS) {
  if (c < SEPARATOR_TABLE.length) SEPARATOR_TABLE[c] = 1;
}
// Add Unicode quotes that exceed our table size - check inline
const UNICODE_QUOTES = [0x201C, 0x201D];

// Initialize valid single word table
const VALID_SINGLE_CONSONANTS = [
  0x1780, 0x1781, 0x1782, 0x1784, 0x1785, 0x1786, 0x1789,
  0x178A, 0x178F, 0x1791, 0x1796, 0x179A, 0x179B, 0x179F, 0x17A1,
];
const VALID_SINGLE_INDEPENDENT_VOWELS = [
  0x17A6, 0x17A7, 0x17AA, 0x17AC, 0x17AE, 0x17AF, 0x17B1, 0x17B3,
];
for (const c of VALID_SINGLE_CONSONANTS) VALID_SINGLE_TABLE[c] = 1;
for (const c of VALID_SINGLE_INDEPENDENT_VOWELS) VALID_SINGLE_TABLE[c] = 1;

// Inline functions for hot paths (no function call overhead)
export function isDigit(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x17E0 && c <= 0x17E9);
}

export function isConsonant(c: number): boolean {
  return c >= 0x1780 && c <= 0x17A2;
}

export function isDependentVowel(c: number): boolean {
  return c >= 0x17B6 && c <= 0x17C5;
}

export function isSign(c: number): boolean {
  return (c >= 0x17C6 && c <= 0x17D1) || c === 0x17D3 || c === 0x17DD;
}

export function isCoeng(c: number): boolean {
  return c === 0x17D2;
}

export function isKhmerChar(c: number): boolean {
  return c >= 0x1780 && c <= 0x17FF;
}

export function isCurrencySymbol(c: number): boolean {
  return c === 0x17DB;
}

export function isSeparator(c: number): boolean {
  if (c < SEPARATOR_TABLE.length) return SEPARATOR_TABLE[c] === 1;
  return c === 0x201C || c === 0x201D;
}

export function isIndependentVowel(c: number): boolean {
  return c >= 0x17A5 && c <= 0x17B3;
}

export function isValidSingleWord(c: number): boolean {
  return c < VALID_SINGLE_TABLE.length && VALID_SINGLE_TABLE[c] === 1;
}
