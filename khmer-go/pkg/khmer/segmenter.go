package khmer

import (
	"math"
	"strings"
)

// KhmerSegmenter segments Khmer text using the Viterbi algorithm
type KhmerSegmenter struct {
	Dictionary *Dictionary
	// Pre-allocated buffers for reuse (not thread-safe, but faster)
	dpCost   []float32
	dpParent []int
}

// NewKhmerSegmenter creates a new segmenter with the given dictionary
func NewKhmerSegmenter(dictionary *Dictionary) *KhmerSegmenter {
	// Pre-allocate reasonable buffer sizes
	initialSize := 1024
	return &KhmerSegmenter{
		Dictionary: dictionary,
		dpCost:     make([]float32, initialSize),
		dpParent:   make([]int, initialSize),
	}
}

// Segment segments Khmer text into words using the Viterbi algorithm
func (s *KhmerSegmenter) Segment(text string) []string {
	// 1. Strip Zero-Width Spaces
	textRaw := strings.ReplaceAll(text, "\u200b", "")
	if textRaw == "" {
		return []string{}
	}

	runes := []rune(textRaw)
	n := len(runes)

	// Ensure buffers are large enough
	if len(s.dpCost) < n+1 {
		s.dpCost = make([]float32, n+1)
		s.dpParent = make([]int, n+1)
	}

	// Reset DP arrays (reuse allocated memory)
	dpCost := s.dpCost[:n+1]
	dpParent := s.dpParent[:n+1]
	inf := float32(math.Inf(1))
	for i := range dpCost {
		dpCost[i] = inf
		dpParent[i] = -1
	}
	dpCost[0] = 0.0

	// Cache dictionary reference
	dict := s.Dictionary
	maxWordLen := dict.MaxWordLength
	unknownCost := dict.UnknownCost

	for i := 0; i < n; i++ {
		if dpCost[i] == inf {
			continue
		}

		currentCost := dpCost[i]
		charI := runes[i]

		// --- Constraint Checks & Fallback (Repair Mode) ---
		forceRepair := false

		// 1. Previous char was Coeng (U+17D2)
		if i > 0 && runes[i-1] == '\u17D2' {
			forceRepair = true
		}

		// 2. Current char is Dependent Vowel
		if IsDependentVowel(charI) {
			forceRepair = true
		}

		if forceRepair {
			// Recovery Mode: Consume 1 char with high penalty
			nextIdx := i + 1
			newCost := currentCost + unknownCost + 50.0
			if nextIdx <= n && newCost < dpCost[nextIdx] {
				dpCost[nextIdx] = newCost
				dpParent[nextIdx] = i
			}
			continue
		}

		// --- Normal Processing ---

		// 1. Number / Digit Grouping (and Currency)
		isDigitChar := IsDigit(charI)
		isCurrencyStart := false
		if IsCurrencySymbol(charI) && i+1 < n && IsDigit(runes[i+1]) {
			isCurrencyStart = true
		}

		if isDigitChar || isCurrencyStart {
			numLen := getNumberLength(runes, i, n)
			nextIdx := i + numLen
			stepCost := float32(1.0)
			if nextIdx <= n {
				newCost := currentCost + stepCost
				if newCost < dpCost[nextIdx] {
					dpCost[nextIdx] = newCost
					dpParent[nextIdx] = i
				}
			}
		} else if IsSeparator(charI) {
			// 2. Separators
			nextIdx := i + 1
			stepCost := float32(0.1)
			if nextIdx <= n {
				newCost := currentCost + stepCost
				if newCost < dpCost[nextIdx] {
					dpCost[nextIdx] = newCost
					dpParent[nextIdx] = i
				}
			}
		}

		// 3. Acronyms
		if isAcronymStart(runes, i, n) {
			acrLen := getAcronymLength(runes, i, n)
			nextIdx := i + acrLen
			stepCost := float32(1.0)
			if nextIdx <= n {
				newCost := currentCost + stepCost
				if newCost < dpCost[nextIdx] {
					dpCost[nextIdx] = newCost
					dpParent[nextIdx] = i
				}
			}
		}

		// 4. Dictionary Match - OPTIMIZED: use rune slice lookup
		endLimit := i + maxWordLen
		if endLimit > n {
			endLimit = n
		}
		for j := i + 1; j <= endLimit; j++ {
			// Use direct rune slice lookup instead of string conversion
			if wordCost, ok := dict.LookupRunes(runes[i:j]); ok {
				newCost := currentCost + wordCost
				if newCost < dpCost[j] {
					dpCost[j] = newCost
					dpParent[j] = i
				}
			}
		}

		// 5. Unknown Cluster Fallback
		if IsKhmerChar(charI) {
			clusterLen := getKhmerClusterLength(runes, i, n)
			stepCost := unknownCost

			if clusterLen == 1 && !IsValidSingleWord(charI) {
				stepCost += 10.0
			}

			nextIdx := i + clusterLen
			if nextIdx <= n {
				newCost := currentCost + stepCost
				if newCost < dpCost[nextIdx] {
					dpCost[nextIdx] = newCost
					dpParent[nextIdx] = i
				}
			}
		} else {
			// Non-Khmer
			nextIdx := i + 1
			newCost := currentCost + unknownCost
			if nextIdx <= n && newCost < dpCost[nextIdx] {
				dpCost[nextIdx] = newCost
				dpParent[nextIdx] = i
			}
		}
	}

	// Backtrack - build segments in reverse, then reverse once at the end
	segments := make([]string, 0, n/4) // Estimate ~4 chars per word
	curr := n
	for curr > 0 {
		prev := dpParent[curr]
		if prev == -1 {
			break
		}
		segments = append(segments, string(runes[prev:curr]))
		curr = prev
	}

	// Reverse segments in-place
	for i, j := 0, len(segments)-1; i < j; i, j = i+1, j-1 {
		segments[i], segments[j] = segments[j], segments[i]
	}

	// Post-Processing Pass 1: Snap Invalid Single Consonants
	pass1Segments := snapInvalidSingleConsonants(segments, dict)

	// Apply heuristics and post-process unknowns
	pass2Segments := ApplyHeuristics(pass1Segments, dict)
	return PostProcessUnknowns(pass2Segments, dict)
}

// snapInvalidSingleConsonants merges invalid single consonants with neighbors
func snapInvalidSingleConsonants(segments []string, dict *Dictionary) []string {
	pass1Segments := make([]string, 0, len(segments))

	for j, seg := range segments {
		segRunes := []rune(seg)
		if len(segRunes) == 0 {
			continue
		}
		firstChar := segRunes[0]
		segLen := len(segRunes)

		isInvalidSingle := segLen == 1 &&
			!IsValidSingleWord(firstChar) &&
			!dict.Contains(seg) &&
			!IsDigit(firstChar) &&
			!IsSeparator(firstChar)

		if isInvalidSingle {
			prevIsSep := false
			if len(pass1Segments) > 0 {
				prevSeg := pass1Segments[len(pass1Segments)-1]
				pRunes := []rune(prevSeg)
				if len(pRunes) > 0 {
					pChar := pRunes[0]
					if IsSeparator(pChar) || prevSeg == " " || prevSeg == "\u200b" {
						prevIsSep = true
					}
				}
			} else if j == 0 {
				prevIsSep = true
			}

			nextIsSep := false
			if j+1 < len(segments) {
				nextSeg := segments[j+1]
				nRunes := []rune(nextSeg)
				if len(nRunes) > 0 {
					nChar := nRunes[0]
					if IsSeparator(nChar) || nextSeg == " " || nextSeg == "\u200b" {
						nextIsSep = true
					}
				}
			} else {
				nextIsSep = true
			}

			if prevIsSep && nextIsSep {
				pass1Segments = append(pass1Segments, seg)
				continue
			}

			if len(pass1Segments) > 0 {
				prevSeg := pass1Segments[len(pass1Segments)-1]
				pRunes := []rune(prevSeg)
				if len(pRunes) > 0 && !IsSeparator(pRunes[0]) {
					pass1Segments[len(pass1Segments)-1] = prevSeg + seg
				} else {
					pass1Segments = append(pass1Segments, seg)
				}
			} else {
				pass1Segments = append(pass1Segments, seg)
			}
		} else {
			pass1Segments = append(pass1Segments, seg)
		}
	}

	return pass1Segments
}

// --- Helper Functions (now standalone for inlining) ---

func getKhmerClusterLength(runes []rune, startIndex, n int) int {
	if startIndex >= n {
		return 0
	}

	c := runes[startIndex]

	// Must start with Base Consonant or Independent Vowel
	if !(c >= 0x1780 && c <= 0x17B3) {
		return 1
	}

	i := startIndex + 1

	for i < n {
		current := runes[i]

		if IsCoeng(current) {
			if i+1 < n && IsConsonant(runes[i+1]) {
				i += 2
				continue
			}
			break
		}

		if IsDependentVowel(current) || IsSign(current) {
			i++
			continue
		}

		break
	}

	return i - startIndex
}

func getNumberLength(runes []rune, startIndex, n int) int {
	i := startIndex

	if !IsDigit(runes[i]) {
		return 0
	}
	i++

	for i < n {
		c := runes[i]
		if IsDigit(c) {
			i++
			continue
		}
		if c == ',' || c == '.' || c == ' ' {
			if i+1 < n && IsDigit(runes[i+1]) {
				i += 2
				continue
			}
		}
		break
	}

	return i - startIndex
}

func getAcronymLength(runes []rune, startIndex, n int) int {
	i := startIndex

	for {
		clusterLen := getKhmerClusterLength(runes, i, n)
		if clusterLen > 0 {
			dotIndex := i + clusterLen
			if dotIndex < n && runes[dotIndex] == '.' {
				i = dotIndex + 1
				if i >= n {
					break
				}
				continue
			}
		}
		break
	}

	return i - startIndex
}

func isAcronymStart(runes []rune, index, n int) bool {
	if index+1 >= n {
		return false
	}

	clusterLen := getKhmerClusterLength(runes, index, n)
	if clusterLen == 0 {
		return false
	}

	dotIndex := index + clusterLen
	return dotIndex < n && runes[dotIndex] == '.'
}
