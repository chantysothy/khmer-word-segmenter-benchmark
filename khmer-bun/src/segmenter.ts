import * as Constants from './constants';
import { Dictionary } from './dictionary';
import { snapInvalidSingleConsonants, applyHeuristics, postProcessUnknowns } from './heuristics';

// Pre-allocated buffers for reuse (avoids GC pressure)
let dpCost: Float32Array | null = null;
let dpParent: Int32Array | null = null;

function ensureBuffers(size: number): void {
  if (!dpCost || dpCost.length < size) {
    dpCost = new Float32Array(size + 128);
    dpParent = new Int32Array(size + 128);
  }
}

/**
 * Get the length of a number sequence starting at startIndex
 * Inlined for performance
 */
function getNumberLength(text: string, startIndex: number): number {
  const n = text.length;
  let i = startIndex;

  // Check if starts with currency symbol followed by digit
  const firstCode = text.charCodeAt(i);
  if (firstCode === 0x17DB) { // Khmer Riel
    if (i + 1 < n && Constants.isDigit(text.charCodeAt(i + 1))) {
      i++;
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
    // Allow separators in numbers: , . space (0x2C, 0x2E, 0x20)
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
 * Inlined for performance
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

    // Coeng (0x17D2) + Consonant (0x1780-0x17A2)
    if (current === 0x17D2) {
      if (i + 1 < n) {
        const next = text.charCodeAt(i + 1);
        if (next >= 0x1780 && next <= 0x17A2) {
          i += 2;
          continue;
        }
      }
      break;
    }

    // Dependent vowel (0x17B6-0x17C5) or sign
    if ((current >= 0x17B6 && current <= 0x17C5) || Constants.isSign(current)) {
      i++;
      continue;
    }

    break;
  }

  return i - startIndex;
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
 * Segment a single line of Khmer text using Viterbi algorithm
 * Optimized with pre-allocated buffers and inlined operations
 */
export function segment(text: string, dict: Dictionary): string[] {
  // Remove zero-width spaces - check first (most strings don't have it)
  let textRaw = text;
  if (text.indexOf('\u200B') !== -1) {
    textRaw = text.split('\u200B').join('');
  }
  if (textRaw.length === 0) return [];

  const n = textRaw.length;

  // Ensure buffers are allocated
  ensureBuffers(n + 1);
  const cost = dpCost!;
  const parent = dpParent!;

  // Initialize
  for (let i = 0; i <= n; i++) {
    cost[i] = Infinity;
    parent[i] = -1;
  }
  cost[0] = 0;

  // Cache frequently accessed values
  const maxLen = dict.maxWordLength;
  const unknownCost = dict.unknownCost;

  for (let i = 0; i < n; i++) {
    if (cost[i] === Infinity) continue;

    const currentCost = cost[i];
    const charI = textRaw.charCodeAt(i);
    let forceRepair = false;

    // Repair mode checks
    if (i > 0 && textRaw.charCodeAt(i - 1) === 0x17D2) {
      forceRepair = true;
    }
    if (charI >= 0x17B6 && charI <= 0x17C5) {
      forceRepair = true;
    }

    if (forceRepair) {
      const nextIdx = i + 1;
      const newCost = currentCost + unknownCost + 50.0;
      if (nextIdx <= n && newCost < cost[nextIdx]) {
        cost[nextIdx] = newCost;
        parent[nextIdx] = i;
      }
      continue;
    }

    // 1. Numbers/Digits
    const isDigitChar = Constants.isDigit(charI);
    let isCurrencyStart = false;
    if (charI === 0x17DB) { // Khmer Riel
      if (i + 1 < n && Constants.isDigit(textRaw.charCodeAt(i + 1))) {
        isCurrencyStart = true;
      }
    }

    if (isDigitChar || isCurrencyStart) {
      const numLen = getNumberLength(textRaw, i);
      const nextIdx = i + numLen;
      const stepCost = 1.0;
      if (nextIdx <= n && currentCost + stepCost < cost[nextIdx]) {
        cost[nextIdx] = currentCost + stepCost;
        parent[nextIdx] = i;
      }
    }

    // 2. Separators
    if (Constants.isSeparator(charI)) {
      const nextIdx = i + 1;
      const stepCost = 0.1;
      if (nextIdx <= n && currentCost + stepCost < cost[nextIdx]) {
        cost[nextIdx] = currentCost + stepCost;
        parent[nextIdx] = i;
      }
    }

    // 3. Acronym Grouping
    if (isAcronymStart(textRaw, i)) {
      const acrLen = getAcronymLength(textRaw, i);
      const nextIdx = i + acrLen;
      const stepCost = 1.0;
      if (nextIdx <= n && currentCost + stepCost < cost[nextIdx]) {
        cost[nextIdx] = currentCost + stepCost;
        parent[nextIdx] = i;
      }
    }

    // 4. Dictionary match (Trie lookup - no substring allocation)
    let endLimit = i + maxLen;
    if (endLimit > n) endLimit = n;

    for (let j = i + 1; j <= endLimit; j++) {
      const wordCost = dict.lookupRange(textRaw, i, j);
      if (wordCost >= 0) {
        const newCost = currentCost + wordCost;
        if (newCost < cost[j]) {
          cost[j] = newCost;
          parent[j] = i;
        }
      }
    }

    // 5. Unknown cluster
    if (charI >= 0x1780 && charI <= 0x17FF) { // isKhmerChar inlined
      const clusterLen = getKhmerClusterLength(textRaw, i);
      let stepCost = unknownCost;
      if (clusterLen === 1 && !Constants.isValidSingleWord(charI)) {
        stepCost += 10.0;
      }
      const nextIdx = i + clusterLen;
      if (nextIdx <= n && currentCost + stepCost < cost[nextIdx]) {
        cost[nextIdx] = currentCost + stepCost;
        parent[nextIdx] = i;
      }
    } else {
      // Non-Khmer (Latin, etc)
      const nextIdx = i + 1;
      if (nextIdx <= n && currentCost + unknownCost < cost[nextIdx]) {
        cost[nextIdx] = currentCost + unknownCost;
        parent[nextIdx] = i;
      }
    }
  }

  // Backtrack
  const segments: string[] = [];
  let curr = n;
  while (curr > 0) {
    const prev = parent[curr];
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
 * Segment a batch of lines (single-threaded)
 */
export function segmentBatch(lines: string[], dict: Dictionary): string[][] {
  return lines.map(line => segment(line, dict));
}
