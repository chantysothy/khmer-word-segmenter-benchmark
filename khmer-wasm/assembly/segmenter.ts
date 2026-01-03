
import { globalDict } from "./dictionary";
import * as Constants from "./constants";
import { snapInvalidSingleConsonants, applyHeuristics, postProcessUnknowns } from "./heuristics";

// Pre-allocated buffers for reuse (avoids GC pressure)
// These grow as needed but are never shrunk
let dpCostBuffer: Float32Array | null = null;
let dpParentBuffer: Int32Array | null = null;
let currentBufferSize: i32 = 0;

function ensureBuffers(size: i32): void {
  if (dpCostBuffer === null || currentBufferSize < size) {
    const newSize = size + 256; // Add extra capacity
    dpCostBuffer = new Float32Array(newSize);
    dpParentBuffer = new Int32Array(newSize);
    currentBufferSize = newSize;
  }
}

/**
 * Get the length of a number sequence starting at startIndex
 */
@inline
function getNumberLength(text: string, startIndex: i32): i32 {
  const n = text.length;
  let i = startIndex;

  // Check if starts with currency symbol followed by digit
  const firstCode = text.charCodeAt(i);
  if (firstCode == 0x17DB) { // Khmer Riel
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
    // Allow separators in numbers: , . space
    if (c == 0x002C || c == 0x002E || c == 0x0020) {
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
@inline
function getKhmerClusterLength(text: string, startIndex: i32): i32 {
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
    if (current == 0x17D2) {
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
 * Check if position starts an acronym sequence (Cluster + .)
 */
@inline
function isAcronymStart(text: string, index: i32): boolean {
  const n = text.length;
  if (index + 1 >= n) return false;

  const clusterLen = getKhmerClusterLength(text, index);
  if (clusterLen == 0) return false;

  const dotIndex = index + clusterLen;
  return dotIndex < n && text.charCodeAt(dotIndex) == 0x002E;
}

/**
 * Get the length of an acronym sequence starting at startIndex
 */
@inline
function getAcronymLength(text: string, startIndex: i32): i32 {
  const n = text.length;
  let i = startIndex;

  while (i < n) {
    const clusterLen = getKhmerClusterLength(text, i);
    if (clusterLen > 0) {
      const dotIndex = i + clusterLen;
      if (dotIndex < n && text.charCodeAt(dotIndex) == 0x002E) {
        i = dotIndex + 1;
        continue;
      }
    }
    break;
  }

  return i - startIndex;
}

export function segment(text: string): string {
  // Remove zero-width spaces - check first (most strings don't have it)
  let textRaw = text;
  if (text.indexOf(String.fromCharCode(Constants.ZERO_WIDTH_SPACE)) != -1) {
    textRaw = text.replaceAll(String.fromCharCode(Constants.ZERO_WIDTH_SPACE), "");
  }
  if (textRaw.length == 0) return "";

  const n = textRaw.length;

  // Ensure buffers are allocated
  ensureBuffers(n + 1);
  const dpCost = dpCostBuffer!;
  const dpParent = dpParentBuffer!;

  // Initialize
  for (let i: i32 = 0; i <= n; i++) {
    dpCost[i] = <f32>Infinity;
    dpParent[i] = -1;
  }
  dpCost[0] = 0.0;

  // Cache frequently accessed values
  const maxLen = globalDict.maxWordLength;
  const unknownCost = globalDict.unknownCost;

  for (let i: i32 = 0; i < n; i++) {
    if (dpCost[i] == <f32>Infinity) continue;

    const currentCost = dpCost[i];
    const charI = textRaw.charCodeAt(i);
    let forceRepair = false;

    // Repair Mode Checks
    if (i > 0 && textRaw.charCodeAt(i - 1) == 0x17D2) {
      forceRepair = true;
    }
    if (charI >= 0x17B6 && charI <= 0x17C5) {
      forceRepair = true;
    }

    if (forceRepair) {
      const nextIdx = i + 1;
      const newCost = currentCost + unknownCost + 50.0;
      if (nextIdx <= n && newCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = newCost;
        dpParent[nextIdx] = i;
      }
      continue;
    }

    // 1. Numbers/Digits
    const isDigitChar = Constants.isDigit(charI);
    let isCurrencyStart = false;
    if (charI == 0x17DB) { // Khmer Riel
      if (i + 1 < n && Constants.isDigit(textRaw.charCodeAt(i + 1))) {
        isCurrencyStart = true;
      }
    }

    if (isDigitChar || isCurrencyStart) {
      const numLen = getNumberLength(textRaw, i);
      const nextIdx = i + numLen;
      const stepCost: f32 = 1.0;
      if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = currentCost + stepCost;
        dpParent[nextIdx] = i;
      }
    }

    // 2. Separators
    if (Constants.isSeparator(charI)) {
      const nextIdx = i + 1;
      const stepCost: f32 = 0.1;
      if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = currentCost + stepCost;
        dpParent[nextIdx] = i;
      }
    }

    // 3. Acronym Grouping
    if (isAcronymStart(textRaw, i)) {
      const acrLen = getAcronymLength(textRaw, i);
      const nextIdx = i + acrLen;
      const stepCost: f32 = 1.0;
      if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = currentCost + stepCost;
        dpParent[nextIdx] = i;
      }
    }

    // 4. Dictionary Match (Trie lookup - no substring allocation)
    let endLimit = i + maxLen;
    if (endLimit > n) endLimit = n;

    for (let j: i32 = i + 1; j <= endLimit; j++) {
      const wordCost = globalDict.lookupRange(textRaw, i, j);
      if (wordCost >= 0) {
        const newCost = currentCost + wordCost;
        if (newCost < dpCost[j]) {
          dpCost[j] = newCost;
          dpParent[j] = i;
        }
      }
    }

    // 5. Unknown Cluster
    if (charI >= 0x1780 && charI <= 0x17FF) { // isKhmerChar inlined
      const clusterLen = getKhmerClusterLength(textRaw, i);
      let stepCost = unknownCost;
      if (clusterLen == 1 && !Constants.isValidSingleWord(charI)) {
        stepCost += 10.0;
      }
      const nextIdx = i + clusterLen;
      if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = currentCost + stepCost;
        dpParent[nextIdx] = i;
      }
    } else {
      // Non-Khmer (Latin, etc)
      const nextIdx = i + 1;
      if (nextIdx <= n && currentCost + unknownCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = currentCost + unknownCost;
        dpParent[nextIdx] = i;
      }
    }
  }

  // Backtrack
  const segments = new Array<string>();
  let curr = n;
  while (curr > 0) {
    const prev = dpParent[curr];
    if (prev == -1) break;
    segments.push(textRaw.substring(prev, curr));
    curr = prev;
  }
  segments.reverse();

  // Post-processing
  const pass1 = snapInvalidSingleConsonants(segments);
  const pass2 = applyHeuristics(pass1);
  const pass3 = postProcessUnknowns(pass2);

  return pass3.join("|");
}

export function segmentBatch(content: string): string {
  const result = new Array<string>();
  const len = content.length;
  let start: i32 = 0;

  for (let i: i32 = 0; i < len; i++) {
    const c = content.charCodeAt(i);
    if (c == 10) { // \n
      let end = i;
      // Handle \r
      if (end > start && content.charCodeAt(end - 1) == 13) {
        end--;
      }

      const line = content.substring(start, end);
      if (line.length > 0) {
        result.push(segment(line));
      }
      start = i + 1;
    }
  }

  // Last line
  if (start < len) {
    let end = len;
    if (end > start && content.charCodeAt(end - 1) == 13) {
      end--;
    }
    const line = content.substring(start, end);
    if (line.length > 0) {
      result.push(segment(line));
    }
  }

  return result.join("\n");
}
