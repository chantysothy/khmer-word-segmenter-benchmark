import * as Constants from './constants';
import { Dictionary } from './dictionary';
import { snapInvalidSingleConsonants, applyHeuristics, postProcessUnknowns } from './heuristics';

/**
 * Get the length of a number sequence starting at startIndex
 */
function getNumberLength(text: string, startIndex: number): number {
  const n = text.length;
  let i = startIndex;

  // Check if starts with currency symbol followed by digit
  if (Constants.isCurrencySymbol(text.charCodeAt(i))) {
    if (i + 1 < n && Constants.isDigit(text.charCodeAt(i + 1))) {
      i++; // Skip currency symbol
    } else {
      return 0;
    }
  }

  if (!Constants.isDigit(text.charCodeAt(i))) return 0;
  i++;

  while (i < n) {
    const c = text.charCodeAt(i);
    if (Constants.isDigit(c)) {
      i++;
      continue;
    }
    // Allow separators in numbers: , . space
    if (c === 0x002C || c === 0x002E || c === 0x0020) {
      if (i + 1 < n && Constants.isDigit(text.charCodeAt(i + 1))) {
        i += 2;
        continue;
      }
    }
    break;
  }

  return i - startIndex;
}

/**
 * Get the length of a Khmer syllable cluster starting at startIndex
 */
function getKhmerClusterLength(text: string, startIndex: number): number {
  const n = text.length;
  if (startIndex >= n) return 0;

  let i = startIndex;
  const c = text.charCodeAt(i);

  // Base consonant or independent vowel (0x1780-0x17B3)
  if (!(c >= 0x1780 && c <= 0x17B3)) {
    return 1;
  }
  i++;

  while (i < n) {
    const current = text.charCodeAt(i);

    // Coeng + Consonant (only base consonants 0x1780-0x17A2 can be subscripts, not independent vowels)
    if (Constants.isCoeng(current)) {
      if (i + 1 < n) {
        const next = text.charCodeAt(i + 1);
        if (next >= 0x1780 && next <= 0x17A2) {
          i += 2;
          continue;
        }
      }
      break;
    }

    // Dependent vowel or sign
    if (Constants.isDependentVowel(current) || Constants.isSign(current)) {
      i++;
      continue;
    }

    break;
  }

  return i - startIndex;
}

/**
 * Check if position starts an acronym sequence (Cluster + .)
 */
function isAcronymStart(text: string, index: number): boolean {
  const n = text.length;
  if (index + 1 >= n) return false;

  const clusterLen = getKhmerClusterLength(text, index);
  if (clusterLen === 0) return false;

  const dotIndex = index + clusterLen;
  return dotIndex < n && text.charCodeAt(dotIndex) === 0x002E;
}

/**
 * Get the length of an acronym sequence starting at startIndex
 */
function getAcronymLength(text: string, startIndex: number): number {
  const n = text.length;
  let i = startIndex;

  while (i < n) {
    const clusterLen = getKhmerClusterLength(text, i);
    if (clusterLen > 0) {
      const dotIndex = i + clusterLen;
      if (dotIndex < n && text.charCodeAt(dotIndex) === 0x002E) {
        i = dotIndex + 1;
        continue;
      }
    }
    break;
  }

  return i - startIndex;
}

/**
 * Segment a single line of Khmer text using Viterbi algorithm
 */
export function segment(text: string, dict: Dictionary): string[] {
  // Remove zero-width spaces
  const textRaw = text.replaceAll('\u200B', '');
  if (textRaw.length === 0) return [];

  const n = textRaw.length;

  // DP arrays
  const dpCost = new Float32Array(n + 1);
  const dpParent = new Int32Array(n + 1);

  // Initialize
  for (let i = 0; i <= n; i++) {
    dpCost[i] = Infinity;
    dpParent[i] = -1;
  }
  dpCost[0] = 0;

  for (let i = 0; i < n; i++) {
    if (dpCost[i] === Infinity) continue;

    const currentCost = dpCost[i];
    let forceRepair = false;

    // Repair mode checks
    if (i > 0 && Constants.isCoeng(textRaw.charCodeAt(i - 1))) {
      forceRepair = true;
    }
    if (Constants.isDependentVowel(textRaw.charCodeAt(i))) {
      forceRepair = true;
    }

    if (forceRepair) {
      const nextIdx = i + 1;
      const newCost = currentCost + dict.unknownCost + 50.0;
      if (nextIdx <= n && newCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = newCost;
        dpParent[nextIdx] = i;
      }
      continue;
    }

    const charI = textRaw.charCodeAt(i);

    // 1. Numbers/Digits
    const isDigitChar = Constants.isDigit(charI);
    let isCurrencyStart = false;
    if (Constants.isCurrencySymbol(charI)) {
      if (i + 1 < n && Constants.isDigit(textRaw.charCodeAt(i + 1))) {
        isCurrencyStart = true;
      }
    }

    if (isDigitChar || isCurrencyStart) {
      const numLen = getNumberLength(textRaw, i);
      const nextIdx = i + numLen;
      const stepCost = 1.0;
      if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = currentCost + stepCost;
        dpParent[nextIdx] = i;
      }
    }

    // 2. Separators
    if (Constants.isSeparator(charI)) {
      const nextIdx = i + 1;
      const stepCost = 0.1;
      if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = currentCost + stepCost;
        dpParent[nextIdx] = i;
      }
    }

    // 3. Acronym Grouping
    if (isAcronymStart(textRaw, i)) {
      const acrLen = getAcronymLength(textRaw, i);
      const nextIdx = i + acrLen;
      const stepCost = 1.0;
      if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = currentCost + stepCost;
        dpParent[nextIdx] = i;
      }
    }

    // 4. Dictionary match (Trie lookup)
    const maxLen = dict.maxWordLength;
    let endLimit = i + maxLen;
    if (endLimit > n) endLimit = n;

    for (let j = i + 1; j <= endLimit; j++) {
      const wordCost = dict.lookupRange(textRaw, i, j);
      if (wordCost >= 0) {
        const newCost = currentCost + wordCost;
        if (newCost < dpCost[j]) {
          dpCost[j] = newCost;
          dpParent[j] = i;
        }
      }
    }

    // 5. Unknown cluster
    if (Constants.isKhmerChar(charI)) {
      const clusterLen = getKhmerClusterLength(textRaw, i);
      let stepCost = dict.unknownCost;
      if (clusterLen === 1 && !Constants.isValidSingleWord(charI)) {
        stepCost += 10.0;
      }
      const nextIdx = i + clusterLen;
      if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = currentCost + stepCost;
        dpParent[nextIdx] = i;
      }
    } else {
      // Non-Khmer (Latin, etc)
      const clusterLen = 1;
      const stepCost = dict.unknownCost;
      const nextIdx = i + clusterLen;
      if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = currentCost + stepCost;
        dpParent[nextIdx] = i;
      }
    }
  }

  // Backtrack
  const segments: string[] = [];
  let curr = n;
  while (curr > 0) {
    const prev = dpParent[curr];
    if (prev === -1) break;
    segments.push(textRaw.substring(prev, curr));
    curr = prev;
  }
  segments.reverse();

  // Post-processing
  const pass1 = snapInvalidSingleConsonants(segments, dict);
  const pass2 = applyHeuristics(pass1, dict);
  const pass3 = postProcessUnknowns(pass2, dict);

  return pass3;
}

/**
 * Segment a batch of lines
 */
export function segmentBatch(lines: string[], dict: Dictionary): string[][] {
  return lines.map(line => segment(line, dict));
}
