import { Dictionary } from './dictionary';
import { isDigit, isSeparator, isValidSingleWord, isConsonant } from './constants';

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

        // Rule 1: Consonant + [់/ិ៍/៍/៌] -> Merge with PREVIOUS
        // 17CB (Bantoc), 17CE (Kakabat), 17CF (Ahsdja)
        // 17B7 + 17CD (I + Toe)
        if (merged.length > 0) {
            const chars = [...curr];
            if (chars.length === 2) {
                const c0 = chars[0];
                const c1 = chars[1];
                if (isConsonant(c0) && (c1 === '\u17CB' || c1 === '\u17CE' || c1 === '\u17CF')) {
                    const prev = merged.pop()!;
                    merged.push(prev + curr);
                    i++;
                    continue;
                }
            }
            if (chars.length === 3) {
                 const c0 = chars[0];
                 if (isConsonant(c0) && chars[1] === '\u17B7' && chars[2] === '\u17CD') {
                    const prev = merged.pop()!;
                    merged.push(prev + curr);
                    i++;
                    continue;
                 }
            }
        }

        // Rule 2: Consonant + ័ (\u17D0) -> Merge with NEXT
        if (i + 1 < n) {
             const chars = [...curr];
             if (chars.length === 2) {
                 const c0 = chars[0];
                 const c1 = chars[1];
                 if (isConsonant(c0) && c1 === '\u17D0') {
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

        if (isDigit(seg.charAt(0))) {
            isKnown = true;
        } else if (dictionary.contains(seg)) {
            isKnown = true;
        } else {
             const chars = [...seg];
             if (chars.length === 1 && isValidSingleWord(chars[0])) {
                 isKnown = true;
             } else if (chars.length === 1 && isSeparator(chars[0])) {
                 isKnown = true;
             } else if (seg.includes('.') && chars.length >= 2) {
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
