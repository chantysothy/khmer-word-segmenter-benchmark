
// Character codes
export const ZERO_WIDTH_SPACE: i32 = 0x200B;
export const KHMER_VOWEL_A: i32 = 0x17B6;
export const KHMER_VOWEL_YA: i32 = 0x17C5;
export const KHMER_SIGN_BANTOC: i32 = 0x17CB;
export const KHMER_SIGN_YUUKALEAPINTU: i32 = 0x17D3;

export function isDigit(c: i32): boolean {
  return c >= 0x17E0 && c <= 0x17E9;
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

// Separators (simplified list from Python/Node)
export function isSeparator(c: i32): boolean {
  // Common separators: space, newline, pipe, etc.
  if (c == 0x0020) return true; // Space
  if (c == 0x000A) return true; // LF
  if (c == 0x000D) return true; // CR
  if (c == 0x0009) return true; // Tab
  if (c == 0x200B) return true; // ZWS
  if (c == 0x17D4) return true; // Khan
  if (c == 0x17D5) return true; // Bariyoosan
  // Add simplified set for benchmark
  return false;
}

export function isIndependentVowel(c: i32): boolean {
  return c >= 0x17A5 && c <= 0x17B3;
}

export function isValidSingleWord(c: i32): boolean {
  // Simple heuristic matching Python's usage for standard text
  if (isIndependentVowel(c)) return true;
  return false;
}
