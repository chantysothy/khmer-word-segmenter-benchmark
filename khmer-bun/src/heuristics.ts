import * as Constants from './constants';
import { Dictionary } from './dictionary';

// Pre-compute special character codes
const BANTOC = 0x17CB;
const KAKABAT = 0x17CE;
const AHSDJA = 0x17CF;
const I_VOWEL = 0x17B7;
const TOE = 0x17CD;
const SAMYOK_SANNYA = 0x17D0;

/**
 * Snap invalid single consonants to adjacent words.
 * Invalid single consonants that are not valid standalone words get merged.
 */
export function snapInvalidSingleConsonants(segments: string[], dict: Dictionary): string[] {
  const result: string[] = [];
  const n = segments.length;

  for (let j = 0; j < n; j++) {
    const seg = segments[j];
    const segLen = seg.length;

    if (segLen === 0) {
      result.push(seg);
      continue;
    }

    const firstCode = seg.charCodeAt(0);

    // Check if this is an invalid single character
    const isInvalidSingle = segLen === 1
      && !Constants.isValidSingleWord(firstCode)
      && !dict.hasWord(seg)
      && !Constants.isDigit(firstCode)
      && !Constants.isSeparator(firstCode);

    if (isInvalidSingle) {
      // Check if prev is separator
      let prevIsSep = false;
      if (result.length > 0) {
        const prevSeg = result[result.length - 1];
        const pCode = prevSeg.charCodeAt(0);
        if (Constants.isSeparator(pCode) || prevSeg === ' ' || prevSeg === '\u200b') {
          prevIsSep = true;
        }
      } else if (j === 0) {
        prevIsSep = true;
      }

      // Check if next is separator
      let nextIsSep = false;
      if (j + 1 < n) {
        const nextSeg = segments[j + 1];
        const nCode = nextSeg.charCodeAt(0);
        if (Constants.isSeparator(nCode) || nextSeg === ' ' || nextSeg === '\u200b') {
          nextIsSep = true;
        }
      } else {
        nextIsSep = true;
      }

      // If surrounded by separators, keep as-is
      if (prevIsSep && nextIsSep) {
        result.push(seg);
        continue;
      }

      // Merge with previous non-separator
      if (result.length > 0) {
        const prevSeg = result[result.length - 1];
        const pCode = prevSeg.charCodeAt(0);
        if (!Constants.isSeparator(pCode)) {
          const prev = result.pop()!;
          result.push(prev + seg);
        } else {
          result.push(seg);
        }
      } else {
        result.push(seg);
      }
    } else {
      result.push(seg);
    }
  }

  return result;
}

/**
 * Apply linguistic heuristics for merging patterns.
 * Rule 1: Consonant + [់/ិ៍/៍/៌] -> Merge with PREVIOUS
 * Rule 2: Consonant + ័ -> Merge with NEXT
 */
export function applyHeuristics(segments: string[], dict: Dictionary): string[] {
  const merged: string[] = [];
  const n = segments.length;
  let i = 0;

  while (i < n) {
    const curr = segments[i];
    const currLen = curr.length;

    // If known word, don't merge
    if (dict.hasWord(curr)) {
      merged.push(curr);
      i++;
      continue;
    }

    // Rule 1: Consonant + [់/ិ៍/៍/៌] -> Merge with PREVIOUS
    // 17CB (Bantoc), 17CE (Kakabat), 17CF (Ahsdja)
    // 17B7 + 17CD (I + Toe)
    if (merged.length > 0) {
      if (currLen === 2) {
        const c0 = curr.charCodeAt(0);
        const c1 = curr.charCodeAt(1);
        if (Constants.isConsonant(c0) && (c1 === BANTOC || c1 === KAKABAT || c1 === AHSDJA)) {
          const prev = merged.pop()!;
          merged.push(prev + curr);
          i++;
          continue;
        }
      }
      if (currLen === 3) {
        const c0 = curr.charCodeAt(0);
        const c1 = curr.charCodeAt(1);
        const c2 = curr.charCodeAt(2);
        if (Constants.isConsonant(c0) && c1 === I_VOWEL && c2 === TOE) {
          const prev = merged.pop()!;
          merged.push(prev + curr);
          i++;
          continue;
        }
      }
    }

    // Rule 2: Consonant + ័ (\u17D0) -> Merge with NEXT
    if (i + 1 < n) {
      if (currLen === 2) {
        const c0 = curr.charCodeAt(0);
        const c1 = curr.charCodeAt(1);
        if (Constants.isConsonant(c0) && c1 === SAMYOK_SANNYA) {
          const nextSeg = segments[i + 1];
          merged.push(curr + nextSeg);
          i += 2;
          continue;
        }
      }
    }

    merged.push(curr);
    i++;
  }

  return merged;
}

/**
 * Post-process unknown segments by merging consecutive unknowns.
 */
export function postProcessUnknowns(segments: string[], dict: Dictionary): string[] {
  const finalSegments: string[] = [];
  let unknownBuffer: string[] = [];

  for (const seg of segments) {
    let isKnown = false;

    if (seg.length === 0) {
      isKnown = true;
    } else {
      const firstCode = seg.charCodeAt(0);
      const segLen = seg.length;

      if (Constants.isDigit(firstCode)) {
        isKnown = true;
      } else if (dict.hasWord(seg)) {
        isKnown = true;
      } else if (segLen === 1 && Constants.isValidSingleWord(firstCode)) {
        isKnown = true;
      } else if (segLen === 1 && Constants.isSeparator(firstCode)) {
        isKnown = true;
      } else if (seg.indexOf('.') !== -1 && segLen >= 2) {
        // Rudimentary acronym check
        isKnown = true;
      }
    }

    if (isKnown) {
      if (unknownBuffer.length > 0) {
        finalSegments.push(unknownBuffer.join(''));
        unknownBuffer = [];
      }
      finalSegments.push(seg);
    } else {
      unknownBuffer.push(seg);
    }
  }

  if (unknownBuffer.length > 0) {
    finalSegments.push(unknownBuffer.join(''));
  }

  return finalSegments;
}
