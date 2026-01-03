
import { globalDict } from "./dictionary";
import * as Constants from "./constants";
import { snapInvalidSingleConsonants, applyHeuristics, postProcessUnknowns } from "./heuristics";

export function segment(text: string): string {
  // 1. Strip ZWS (simplification: assume input doesn't have many or handled outside,
  // but strict parity requires handling. AS string replaceAll is available in recent versions or standard lib).
  // For raw speed in AS, simple replacement loop or just ignoring.
  // Standard String.replaceAll might be heavy. Let's do a quick cleaner pass if needed.
  // Actually, Viterbi is robust to ZWS usually if they are treated as separators or ignored.
  // C# implementation: text.Replace("\u200b", "")

  let textRaw = text.replaceAll(String.fromCharCode(Constants.ZERO_WIDTH_SPACE), "");
  if (textRaw.length == 0) return "";

  const n = textRaw.length;

  // DP Arrays
  // In AS, we can use static memory or TypedArrays.
  // TypedArrays are objects on the heap.
  // new Float32Array(n + 1)
  const dpCost = new Float32Array(n + 1);
  const dpParent = new Int32Array(n + 1);

  // Initialize
  for (let i = 0; i <= n; i++) {
    dpCost[i] = <f32>Infinity;
    dpParent[i] = -1;
  }
  dpCost[0] = 0.0;

  for (let i = 0; i < n; i++) {
    if (dpCost[i] == <f32>Infinity) continue;

    const currentCost = dpCost[i];
    let forceRepair = false;

    // Repair Mode Checks
    // 1. Prev char was Coeng (17D2)
    if (i > 0 && Constants.isCoeng(textRaw.charCodeAt(i - 1))) {
      forceRepair = true;
    }
    // 2. Curr char is Dependent Vowel
    if (Constants.isDependentVowel(textRaw.charCodeAt(i))) {
      forceRepair = true;
    }

    if (forceRepair) {
      let nextIdx = i + 1;
      let newCost = currentCost + globalDict.unknownCost + 50.0;
      if (nextIdx <= n) {
        if (newCost < dpCost[nextIdx]) {
          dpCost[nextIdx] = newCost;
          dpParent[nextIdx] = i;
        }
      }
      continue;
    }

    const charI = textRaw.charCodeAt(i);

    // 1. Numbers / Digits
    let isDigitChar = Constants.isDigit(charI);
    let isCurrencyStart = false;
    if (Constants.isCurrencySymbol(charI)) {
      if (i + 1 < n && Constants.isDigit(textRaw.charCodeAt(i + 1))) {
        isCurrencyStart = true;
      }
    }

    if (isDigitChar || isCurrencyStart) {
      // Get number length
      let numLen = getNumberLength(textRaw, i);
      let nextIdx = i + numLen;
      let stepCost: f32 = 1.0;
      if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = currentCost + stepCost;
        dpParent[nextIdx] = i;
      }
    }
    // 2. Separators
    else if (Constants.isSeparator(charI)) {
      let nextIdx = i + 1;
      let stepCost: f32 = 0.1;
      if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = currentCost + stepCost;
        dpParent[nextIdx] = i;
      }
    }

    // 3. Acronym Grouping (Cluster + dot pattern, e.g., "១." or "ក.")
    // Check if this position starts an acronym sequence
    if (isAcronymStart(textRaw, i)) {
      let acrLen = getAcronymLength(textRaw, i);
      let nextIdx = i + acrLen;
      // Acronyms are valid tokens, low cost
      let stepCost: f32 = 1.0;
      if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
        dpCost[nextIdx] = currentCost + stepCost;
        dpParent[nextIdx] = i;
      }
    }

    // 4. Dictionary Match - OPTIMIZED: use Trie lookup (no substring allocation!)
    let maxLen = globalDict.maxWordLength;
    let endLimit = i + maxLen;
    if (endLimit > n) endLimit = n;

    for (let j = i + 1; j <= endLimit; j++) {
      // Use Trie range lookup instead of substring + Map lookup
      let wordCost = globalDict.lookupRange(textRaw, i, j);

      if (wordCost >= 0) {
        let newCost = currentCost + wordCost;
        if (newCost < dpCost[j]) {
          dpCost[j] = newCost;
          dpParent[j] = i;
        }
      }
    }

    // 5. Unknown Cluster
    if (Constants.isKhmerChar(charI)) {
      let clusterLen = getKhmerClusterLength(textRaw, i);
      let stepCost = globalDict.unknownCost;
      if (clusterLen == 1) {
        if (!Constants.isValidSingleWord(charI)) {
          stepCost += 10.0;
        }
      }
      let nextIdx = i + clusterLen;
      if (nextIdx <= n) {
        if (currentCost + stepCost < dpCost[nextIdx]) {
          dpCost[nextIdx] = currentCost + stepCost;
          dpParent[nextIdx] = i;
        }
      }
    } else {
      // Non-Khmer (Latin, etc)
      let clusterLen = 1;
      let stepCost = globalDict.unknownCost;
      let nextIdx = i + clusterLen;
      if (nextIdx <= n) {
        if (currentCost + stepCost < dpCost[nextIdx]) {
          dpCost[nextIdx] = currentCost + stepCost;
          dpParent[nextIdx] = i;
        }
      }
    }
  }

  // Backtrack
  let segments = new Array<string>();
  let curr = n;
  while (curr > 0) {
    let prev = dpParent[curr];
    if (prev == -1) break; // Error
    segments.push(textRaw.substring(prev, curr));
    curr = prev;
  }
  // Segments are reversed
  segments.reverse();

  // Post Processing
  // Pass 1: Snap Invalid Single Consonants
  const pass1 = snapInvalidSingleConsonants(segments);
  // Pass 2: Apply Heuristics (merge specific patterns)
  const pass2 = applyHeuristics(pass1);
  // Pass 3: Merge consecutive unknown words
  const pass3 = postProcessUnknowns(pass2);

  return pass3.join("|");
}

function getNumberLength(text: string, startIndex: i32): i32 {
  let n = text.length;
  let i = startIndex;
  if (!Constants.isDigit(text.charCodeAt(i))) return 0;
  i++;
  while (i < n) {
    let c = text.charCodeAt(i);
    if (Constants.isDigit(c)) {
      i++;
      continue;
    }
    // Check , . space
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

function getKhmerClusterLength(text: string, startIndex: i32): i32 {
  let n = text.length;
  if (startIndex >= n) return 0;
  let i = startIndex;
  let c = text.charCodeAt(i);

  // Base Consonant or Independent Vowel
  if ( !((c >= 0x1780 && c <= 0x17B3)) ) {
    return 1;
  }
  i++;
  while (i < n) {
    let current = text.charCodeAt(i);
    if (Constants.isCoeng(current)) {
      if (i + 1 < n) {
        let nextC = text.charCodeAt(i + 1);
        if (Constants.isConsonant(nextC)) {
          i += 2;
          continue;
        }
      }
      break;
    }
    if (Constants.isDependentVowel(current) || Constants.isSign(current)) {
      i++;
      continue;
    }
    break;
  }
  return i - startIndex;
}

export function segmentBatch(content: string): string {
  let result = new Array<string>();
  let len = content.length;
  let start = 0;

  for (let i = 0; i < len; i++) {
    let c = content.charCodeAt(i);
    if (c == 10) { // \n
      let end = i;
      // Handle \r
      if (end > start && content.charCodeAt(end - 1) == 13) {
        end--;
      }

      let line = content.substring(start, end);
      if (line.length > 0) {
         result.push(segment(line));
      } else {
         // Keep empty lines? The python runner filters them out in load.
         // "lines = [line.strip() for line in f if line.strip()]"
         // But here we are processing raw content.
         // If we skip empty lines here, the output count might mismatch if the input had empty lines that were significant?
         // The benchmark script passes a file where every line is valid text generated.
         // But the runner.js does: lines.filter(line => line.trim().length > 0)
         // So we should mimic that.
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
    let line = content.substring(start, end);
    if (line.length > 0) {
      result.push(segment(line));
    }
  }

  return result.join("\n");
}

/**
 * Checks if position starts an acronym sequence (Cluster + .)
 */
function isAcronymStart(text: string, index: i32): boolean {
  let n = text.length;
  // Need at least 2 chars: Cluster + .
  if (index + 1 >= n) return false;

  // Get cluster length
  let clusterLen = getKhmerClusterLength(text, index);
  if (clusterLen == 0) return false;

  // Check if char AFTER cluster is dot
  let dotIndex = index + clusterLen;
  if (dotIndex < n && text.charCodeAt(dotIndex) == 0x002E) { // '.'
    return true;
  }

  return false;
}

/**
 * Returns length of acronym sequence starting at start_index.
 * Matches pattern (Cluster + .)+
 */
function getAcronymLength(text: string, startIndex: i32): i32 {
  let n = text.length;
  let i = startIndex;

  while (i < n) {
    // Check for Cluster + Dot
    let clusterLen = getKhmerClusterLength(text, i);
    if (clusterLen > 0) {
      let dotIndex = i + clusterLen;
      if (dotIndex < n && text.charCodeAt(dotIndex) == 0x002E) { // '.'
        i = dotIndex + 1; // Advance past cluster and dot
        continue;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return i - startIndex;
}
