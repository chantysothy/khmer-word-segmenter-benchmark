// Character codes
export const ZERO_WIDTH_SPACE = 0x200B;
export const KHMER_VOWEL_A = 0x17B6;
export const KHMER_VOWEL_YA = 0x17C5;
export const KHMER_SIGN_BANTOC = 0x17CB;
export const KHMER_SIGN_YUUKALEAPINTU = 0x17D3;

// Pre-computed lookup tables for O(1) character classification
const SEPARATOR_SET = new Set([
  0x0020, 0x000A, 0x000D, 0x0009, 0x200B, // Whitespace
  0x0021, 0x003F, 0x002E, 0x002C, 0x003B, 0x003A, // Punctuation
  0x0022, 0x0027, 0x0028, 0x0029, 0x005B, 0x005D, 0x007B, 0x007D, // Brackets/quotes
  0x002D, 0x002F, 0x0024, 0x0025, // Others
  0x00AB, 0x00BB, 0x201C, 0x201D, 0x02DD, // Extended quotes (includes ˝ double acute)
  0x17D4, 0x17D5, 0x17D6, 0x17D7, 0x17D8, 0x17D9, 0x17DA, 0x17DB, // Khmer punctuation
]);

const VALID_SINGLE_CONSONANTS = new Set([
  0x1780, 0x1781, 0x1782, 0x1784, 0x1785, 0x1786, 0x1789,
  0x178A, 0x178F, 0x1791, 0x1796, 0x179A, 0x179B, 0x179F, 0x17A1,
]);

const VALID_SINGLE_INDEPENDENT_VOWELS = new Set([
  0x17A6, 0x17A7, 0x17AA, 0x17AC, 0x17AE, 0x17AF, 0x17B1, 0x17B3,
]);

export function isDigit(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x17E0 && c <= 0x17E9);
}

export function isConsonant(c: number): boolean {
  return c >= 0x1780 && c <= 0x17B3;
}

export function isDependentVowel(c: number): boolean {
  return c >= 0x17B6 && c <= 0x17C5;
}

export function isSign(c: number): boolean {
  // Khmer signs: 0x17C6 - 0x17D1, 0x17D3, 0x17DD
  // This includes Nikahit (ំ), Reahmuk (ះ), Yuukaleapintu (ៈ), and other diacritics
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
  return SEPARATOR_SET.has(c);
}

export function isIndependentVowel(c: number): boolean {
  return c >= 0x17A5 && c <= 0x17B3;
}

export function isValidSingleWord(c: number): boolean {
  return VALID_SINGLE_CONSONANTS.has(c) || VALID_SINGLE_INDEPENDENT_VOWELS.has(c);
}
