import { Dictionary } from './dictionary';
import {
    isDependentVowel, isDigit, isCurrencySymbol, isSeparator, isKhmerChar,
    isValidSingleWord, isCoeng, isConsonant, isSign,
    // CharCode-based (faster - no string creation)
    isDigitCode, isCurrencyCode, isSeparatorCode, isKhmerCharCode,
    isValidSingleWordCode, isCoengCode, isConsonantCode, isSignCode, isDependentVowelCode
} from './constants';
import { applyHeuristics, postProcessUnknowns } from './heuristics';

// Pre-compile regex once (faster than creating each time)
const ZWSP_CODE = 0x200B;

export class KhmerSegmenter {
    dictionary: Dictionary;
    // Pre-allocated buffers (reused per-call for single-threaded, not thread-safe for parallel)
    private dpCost: Float32Array;
    private dpParent: Int32Array;

    constructor(dictionary: Dictionary) {
        this.dictionary = dictionary;
        // Pre-allocate reasonable initial size
        this.dpCost = new Float32Array(1024);
        this.dpParent = new Int32Array(1024);
    }

    segment(text: string): string[] {
        // 1. Strip ZWS - split/join is faster than O(n²) string concatenation
        // Most strings don't have ZWSP, so check first (indexOf is fast)
        let textRaw = text;
        if (text.indexOf('\u200B') !== -1) {
            textRaw = text.split('\u200B').join('');
        }
        if (!textRaw) return [];

        const n = textRaw.length;

        // 2. Ensure buffers are large enough
        if (this.dpCost.length < n + 1) {
            this.dpCost = new Float32Array(n + 128);
            this.dpParent = new Int32Array(n + 128);
        }

        // Reset arrays
        const dpCost = this.dpCost;
        const dpParent = this.dpParent;
        for (let i = 0; i <= n; i++) {
            dpCost[i] = Infinity;
            dpParent[i] = -1;
        }

        dpCost[0] = 0.0;

        // Cache frequently used values
        const maxWordLen = this.dictionary.maxWordLength;
        const unknownCost = this.dictionary.unknownCost;

        for (let i = 0; i < n; i++) {
            if (dpCost[i] === Infinity) continue;

            const currentCost = dpCost[i];
            const charCode = textRaw.charCodeAt(i);

            // --- Constraint Checks & Fallback (Repair Mode) ---
            let forceRepair = false;

            // 1. Previous char was Coeng (0x17D2)
            if (i > 0 && textRaw.charCodeAt(i - 1) === 0x17D2) {
                forceRepair = true;
            }

            // 2. Current char is Dependent Vowel (0x17B6 - 0x17C5)
            if (charCode >= 0x17B6 && charCode <= 0x17C5) {
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

            // --- Normal Processing ---
            // Use charCode directly instead of creating string objects

            // 1. Number / Digit Grouping (and Currency)
            const isDigitChar = isDigitCode(charCode);
            let isCurrencyStart = false;
            if (isCurrencyCode(charCode)) {
                if (i + 1 < n && isDigitCode(textRaw.charCodeAt(i + 1))) {
                    isCurrencyStart = true;
                }
            }

            if (isDigitChar || isCurrencyStart) {
                const numLen = this.getNumberLength(textRaw, i);
                const nextIdx = i + numLen;
                const stepCost = 1.0;
                if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
                    dpCost[nextIdx] = currentCost + stepCost;
                    dpParent[nextIdx] = i;
                }
            }
            // 2. Separators
            else if (isSeparatorCode(charCode)) {
                 const nextIdx = i + 1;
                 const stepCost = 0.1;
                 if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
                     dpCost[nextIdx] = currentCost + stepCost;
                     dpParent[nextIdx] = i;
                 }
            }

            // 3. Acronyms
            if (this.isAcronymStart(textRaw, i)) {
                const acrLen = this.getAcronymLength(textRaw, i);
                const nextIdx = i + acrLen;
                const stepCost = 1.0;
                if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx]) {
                    dpCost[nextIdx] = currentCost + stepCost;
                    dpParent[nextIdx] = i;
                }
            }

            // 4. Dictionary Match - OPTIMIZED: use Trie lookup (no substring allocation)
            const endLimit = Math.min(n, i + maxWordLen);

            for (let j = i + 1; j <= endLimit; j++) {
                const wordCost = this.dictionary.lookupRange(textRaw, i, j);

                if (wordCost >= 0) {
                    const newCost = currentCost + wordCost;
                    if (newCost < dpCost[j]) {
                        dpCost[j] = newCost;
                        dpParent[j] = i;
                    }
                }
            }

            // 5. Unknown Cluster Fallback
            if (isKhmerCharCode(charCode)) {
                const clusterLen = this.getKhmerClusterLength(textRaw, i);
                let stepCost = unknownCost;

                if (clusterLen === 1) {
                    if (!isValidSingleWordCode(charCode)) {
                        stepCost += 10.0;
                    }
                }

                const nextIdx = i + clusterLen;
                if (nextIdx <= n) {
                    if (currentCost + stepCost < dpCost[nextIdx]) {
                        dpCost[nextIdx] = currentCost + stepCost;
                        dpParent[nextIdx] = i;
                    }
                }
            } else {
                // Non-Khmer
                const clusterLen = 1;
                const stepCost = unknownCost;
                const nextIdx = i + clusterLen;
                if (nextIdx <= n) {
                    if (currentCost + stepCost < dpCost[nextIdx]) {
                        dpCost[nextIdx] = currentCost + stepCost;
                        dpParent[nextIdx] = i;
                    }
                }
            }
        }

        // Backtrack
        const segments: string[] = [];
        let curr = n;
        while (curr > 0) {
            const prev = dpParent[curr];
            if (prev === -1) {
                console.error(`Error: Could not segment text. Stuck at index ${curr}`);
                break;
            }
            segments.push(textRaw.substring(prev, curr));
            curr = prev;
        }
        segments.reverse();

        // Post Processing
        // Pass 1: Snap Invalid Single Consonants
        const pass1Segments: string[] = [];
        for (let j = 0; j < segments.length; j++) {
            const seg = segments[j];
            const segLen = seg.length;
            const firstCode = seg.charCodeAt(0);

            const isInvalidSingle = segLen === 1
                && !isValidSingleWordCode(firstCode)
                && !this.dictionary.contains(seg)
                && !isDigitCode(firstCode)
                && !isSeparatorCode(firstCode);

            if (isInvalidSingle) {
                let prevIsSep = false;
                if (pass1Segments.length > 0) {
                    const prevSeg = pass1Segments[pass1Segments.length - 1];
                    const pCode = prevSeg.charCodeAt(0);
                    if (isSeparatorCode(pCode) || prevSeg === " " || prevSeg === "\u200b") {
                        prevIsSep = true;
                    }
                } else if (j === 0) {
                    prevIsSep = true;
                }

                let nextIsSep = false;
                if (j + 1 < segments.length) {
                    const nextSeg = segments[j+1];
                    const nCode = nextSeg.charCodeAt(0);
                    if (isSeparatorCode(nCode) || nextSeg === " " || nextSeg === "\u200b") {
                        nextIsSep = true;
                    }
                } else {
                    nextIsSep = true;
                }

                if (prevIsSep && nextIsSep) {
                    pass1Segments.push(seg);
                    continue;
                }

                if (pass1Segments.length > 0) {
                    const prevSeg = pass1Segments[pass1Segments.length - 1];
                    const pCode = prevSeg.charCodeAt(0);
                    if (!isSeparatorCode(pCode)) {
                        const prev = pass1Segments.pop();
                        pass1Segments.push(prev + seg);
                    } else {
                        pass1Segments.push(seg);
                    }
                } else {
                    pass1Segments.push(seg);
                }
            } else {
                pass1Segments.push(seg);
            }
        }

        const pass2Segments = applyHeuristics(pass1Segments, this.dictionary);
        return postProcessUnknowns(pass2Segments, this.dictionary);
    }

    // Helpers - optimized with charCodeAt throughout
    private getKhmerClusterLength(text: string, startIndex: number): number {
        const n = text.length;
        if (startIndex >= n) return 0;

        let i = startIndex;

        // Check for Base Consonant or Independent Vowel (0x1780-0x17B3)
        const code = text.charCodeAt(i);
        if (!(code >= 0x1780 && code <= 0x17B3)) {
            return 1;
        }
        i++;

        while (i < n) {
            const currentCode = text.charCodeAt(i);

            if (isCoengCode(currentCode)) {
                if (i + 1 < n) {
                    const nextCode = text.charCodeAt(i + 1);
                    if (isConsonantCode(nextCode)) {
                        i += 2;
                        continue;
                    }
                }
                break;
            }

            if (isDependentVowelCode(currentCode) || isSignCode(currentCode)) {
                i++;
                continue;
            }

            break;
        }

        return i - startIndex;
    }

    private getNumberLength(text: string, startIndex: number): number {
        const n = text.length;
        let i = startIndex;

        if (!isDigitCode(text.charCodeAt(i))) return 0;
        i++;

        while (i < n) {
            const code = text.charCodeAt(i);
            if (isDigitCode(code)) {
                i++;
                continue;
            }
            // Check , . space (0x2C, 0x2E, 0x20)
            if (code === 0x2C || code === 0x2E || code === 0x20) {
                if (i + 1 < n && isDigitCode(text.charCodeAt(i + 1))) {
                    i += 2;
                    continue;
                }
            }
            break;
        }
        return i - startIndex;
    }

    private getAcronymLength(text: string, startIndex: number): number {
        const n = text.length;
        let i = startIndex;

        while (true) {
            const clusterLen = this.getKhmerClusterLength(text, i);
            if (clusterLen > 0) {
                const dotIndex = i + clusterLen;
                if (dotIndex < n && text.charCodeAt(dotIndex) === 0x2E) { // '.'
                    i = dotIndex + 1;
                    if (i >= n) break;
                    continue;
                }
            }
            break;
        }
        return i - startIndex;
    }

    private isAcronymStart(text: string, index: number): boolean {
        const n = text.length;
        if (index + 1 >= n) return false;

        const clusterLen = this.getKhmerClusterLength(text, index);
        if (clusterLen === 0) return false;

        const dotIndex = index + clusterLen;
        return dotIndex < n && text.charCodeAt(dotIndex) === 0x2E; // '.'
    }
}
