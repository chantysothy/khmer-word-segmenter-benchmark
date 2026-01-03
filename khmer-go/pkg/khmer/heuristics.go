package khmer

import (
	"strings"
)

// ApplyHeuristics applies post-processing heuristic rules
// Rule 1: Consonant + [់/៍/៌] -> Merge with PREVIOUS
// Rule 2: Consonant + ័ -> Merge with NEXT
func ApplyHeuristics(segments []string, dictionary *Dictionary) []string {
	merged := make([]string, 0, len(segments))
	n := len(segments)
	i := 0

	for i < n {
		curr := segments[i]

		// If known word, don't merge
		if dictionary.Contains(curr) {
			merged = append(merged, curr)
			i++
			continue
		}

		runes := []rune(curr)

		// Rule 1: Consonant + [់/៍/៌] -> Merge with PREVIOUS
		mergedRule1 := false
		if len(merged) > 0 && len(runes) == 2 {
			c0, c1 := runes[0], runes[1]
			if IsConsonant(c0) && (c1 == '\u17CB' || c1 == '\u17CE' || c1 == '\u17CF') {
				prev := merged[len(merged)-1]
				merged[len(merged)-1] = prev + curr
				i++
				mergedRule1 = true
			}
		}

		// Special case for 3-char (Consonant + ិ + ៍)
		if !mergedRule1 && len(merged) > 0 && len(runes) == 3 {
			c0, c1, c2 := runes[0], runes[1], runes[2]
			if IsConsonant(c0) && c1 == '\u17B7' && c2 == '\u17CD' {
				prev := merged[len(merged)-1]
				merged[len(merged)-1] = prev + curr
				i++
				mergedRule1 = true
			}
		}

		if mergedRule1 {
			continue
		}

		// Rule 2: Consonant + ័ (0x17D0) -> Merge with NEXT
		if i+1 < n && len(runes) == 2 {
			c0, c1 := runes[0], runes[1]
			if IsConsonant(c0) && c1 == '\u17D0' {
				nextSeg := segments[i+1]
				merged = append(merged, curr+nextSeg)
				i += 2
				continue
			}
		}

		merged = append(merged, curr)
		i++
	}

	return merged
}

// PostProcessUnknowns merges consecutive unknown segments
func PostProcessUnknowns(segments []string, dictionary *Dictionary) []string {
	finalSegments := make([]string, 0, len(segments))
	var unknownBuffer strings.Builder

	for _, seg := range segments {
		isKnown := false

		if len(seg) > 0 {
			runes := []rune(seg)
			firstChar := runes[0]

			if IsDigit(firstChar) {
				isKnown = true
			} else if dictionary.Contains(seg) {
				isKnown = true
			} else if len(runes) == 1 && IsValidSingleWord(firstChar) {
				isKnown = true
			} else if IsSeparator(firstChar) {
				isKnown = true
			} else if strings.Contains(seg, ".") && len(runes) >= 2 {
				// Acronym pattern
				isKnown = true
			}
		}

		if isKnown {
			if unknownBuffer.Len() > 0 {
				finalSegments = append(finalSegments, unknownBuffer.String())
				unknownBuffer.Reset()
			}
			finalSegments = append(finalSegments, seg)
		} else {
			unknownBuffer.WriteString(seg)
		}
	}

	if unknownBuffer.Len() > 0 {
		finalSegments = append(finalSegments, unknownBuffer.String())
	}

	return finalSegments
}
