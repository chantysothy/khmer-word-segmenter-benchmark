import { Dictionary } from './dictionary';
import { isDigitCode, isSeparatorCode, isValidSingleWordCode, isConsonantCode } from './constants';

// Pre-compute special character codes
const BANTOC = 0x17CB;
const KAKABAT = 0x17CE;
const AHSDJA = 0x17CF;
const I_VOWEL = 0x17B7;
const TOE = 0x17CD;
const SAMYOK_SANNYA = 0x17D0;

export function applyHeuristics(segments: string[], dictionary: Dictionary): string[] {
    const merged: string[] = [];
    const n = segments.length;
    let i = 0;

    while (i < n) {
        const curr = segments[i];

        // If known word, don't merge (unless it matches a heuristic pattern explicitly?)
        // The Rust logic checks `dictionary.contains(curr)` first.
        if (dictionary.contains(curr)) {
            merged.push(curr);
            i++;
            continue;
        }

        const currLen = curr.length;

        // Rule 1: Consonant + [់/ិ៍/៍/៌] -> Merge with PREVIOUS
        // 17CB (Bantoc), 17CE (Kakabat), 17CF (Ahsdja)
        // 17B7 + 17CD (I + Toe)
        if (merged.length > 0) {
            if (currLen === 2) {
                const c0 = curr.charCodeAt(0);
                const c1 = curr.charCodeAt(1);
                if (isConsonantCode(c0) && (c1 === BANTOC || c1 === KAKABAT || c1 === AHSDJA)) {
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
                if (isConsonantCode(c0) && c1 === I_VOWEL && c2 === TOE) {
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
                if (isConsonantCode(c0) && c1 === SAMYOK_SANNYA) {
                    const nextSeg = segments[i+1];
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

export function postProcessUnknowns(segments: string[], dictionary: Dictionary): string[] {
    const finalSegments: string[] = [];
    let unknownBuffer: string[] = [];

    for (const seg of segments) {
        let isKnown = false;
        const firstCode = seg.charCodeAt(0);
        const segLen = seg.length;

        if (isDigitCode(firstCode)) {
            isKnown = true;
        } else if (dictionary.contains(seg)) {
            isKnown = true;
        } else if (segLen === 1 && isValidSingleWordCode(firstCode)) {
            isKnown = true;
        } else if (segLen === 1 && isSeparatorCode(firstCode)) {
            isKnown = true;
        } else if (seg.indexOf('.') !== -1 && segLen >= 2) {
            // Rudimentary acronym check
            isKnown = true;
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
