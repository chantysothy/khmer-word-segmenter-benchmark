package khmer

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strings"
)

const (
	khmerStart = 0x1780
	khmerEnd   = 0x17FF
	khmerRange = khmerEnd - khmerStart + 1 // 128
)

// TrieNode represents a node in the trie with flat array optimization for Khmer range
type TrieNode struct {
	// Flat array for O(1) Khmer character lookup (0x1780-0x17FF)
	khmerChildren [khmerRange]*TrieNode
	// Fallback map for non-Khmer characters
	otherChildren map[rune]*TrieNode
	isWord        bool
	cost          float32
}

// getChild returns child for rune using O(1) array access for Khmer range
//
//go:inline
func (n *TrieNode) getChild(r rune) *TrieNode {
	if r >= khmerStart && r <= khmerEnd {
		return n.khmerChildren[r-khmerStart]
	}
	if n.otherChildren == nil {
		return nil
	}
	return n.otherChildren[r]
}

// getOrCreateChild gets or creates child using O(1) array access for Khmer range
func (n *TrieNode) getOrCreateChild(r rune) *TrieNode {
	if r >= khmerStart && r <= khmerEnd {
		idx := r - khmerStart
		if n.khmerChildren[idx] == nil {
			n.khmerChildren[idx] = &TrieNode{}
		}
		return n.khmerChildren[idx]
	}
	// Non-Khmer: use map
	if n.otherChildren == nil {
		n.otherChildren = make(map[rune]*TrieNode)
	}
	child, exists := n.otherChildren[r]
	if !exists {
		child = &TrieNode{}
		n.otherChildren[r] = child
	}
	return child
}

// Dictionary holds the word set and frequency costs
type Dictionary struct {
	Words         map[string]bool
	WordCosts     map[string]float32
	MaxWordLength int
	DefaultCost   float32
	UnknownCost   float32
	// Optimized Trie for fast rune lookups
	trie *TrieNode
}

const minFreqFloor = 5.0

// Precompiled patterns as simple string operations
var (
	coengTa = "\u17D2\u178F"
	coengDa = "\u17D2\u178D"
	coengRo = "\u17D2\u179A"
)

// NewDictionary creates a new empty dictionary
func NewDictionary() *Dictionary {
	return &Dictionary{
		Words:         make(map[string]bool),
		WordCosts:     make(map[string]float32),
		MaxWordLength: 0,
		DefaultCost:   10.0,
		UnknownCost:   20.0,
		trie:          &TrieNode{},
	}
}

// Load loads dictionary and frequency files
func (d *Dictionary) Load(dictPath, freqPath string) error {
	if err := d.loadDictionary(dictPath); err != nil {
		return err
	}
	if err := d.loadFrequencies(freqPath); err != nil {
		return err
	}
	// Build trie after loading
	d.buildTrie()
	return nil
}

func (d *Dictionary) loadDictionary(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("dictionary not found at %s: %w", path, err)
	}
	defer file.Close()

	validSingleWords := make(map[string]bool)
	for r := range ValidSingleWords {
		validSingleWords[string(r)] = true
	}

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		word := strings.TrimSpace(scanner.Text())
		if word == "" {
			continue
		}

		// Filter invalid single-char words
		runes := []rune(word)
		if len(runes) == 1 && !validSingleWords[word] {
			continue
		}

		d.addWordWithVariants(word)
	}

	if err := scanner.Err(); err != nil {
		return err
	}

	// Post-process: remove compound words with OR, repetition mark, Coeng starts
	toRemove := make(map[string]bool)
	for word := range d.Words {
		// Contains ឬ (OR)
		if strings.Contains(word, "\u17AC") && len([]rune(word)) > 1 {
			if strings.HasPrefix(word, "\u17AC") {
				suffix := strings.TrimPrefix(word, "\u17AC")
				if d.Words[suffix] {
					toRemove[word] = true
				}
			} else if strings.HasSuffix(word, "\u17AC") {
				prefix := strings.TrimSuffix(word, "\u17AC")
				if d.Words[prefix] {
					toRemove[word] = true
				}
			} else {
				parts := strings.Split(word, "\u17AC")
				allValid := true
				for _, p := range parts {
					if p != "" && !d.Words[p] {
						allValid = false
						break
					}
				}
				if allValid {
					toRemove[word] = true
				}
			}
		}

		// Contains repetition mark
		if strings.Contains(word, "\u17D7") {
			toRemove[word] = true
		}

		// Starts with Coeng
		if strings.HasPrefix(word, "\u17D2") {
			toRemove[word] = true
		}
	}

	for word := range toRemove {
		delete(d.Words, word)
	}
	delete(d.Words, "\u17D7")

	// Recalculate max word length
	d.MaxWordLength = 0
	for word := range d.Words {
		wordLen := len([]rune(word))
		if wordLen > d.MaxWordLength {
			d.MaxWordLength = wordLen
		}
	}

	fmt.Printf("Loaded %d words. Max length: %d\n", len(d.Words), d.MaxWordLength)
	return nil
}

func (d *Dictionary) addWordWithVariants(word string) {
	d.Words[word] = true
	wordLen := len([]rune(word))
	if wordLen > d.MaxWordLength {
		d.MaxWordLength = wordLen
	}

	variants := d.generateVariants(word)
	for _, v := range variants {
		d.Words[v] = true
		vLen := len([]rune(v))
		if vLen > d.MaxWordLength {
			d.MaxWordLength = vLen
		}
	}
}

func (d *Dictionary) generateVariants(word string) []string {
	variants := make(map[string]bool)

	// 1. Coeng Ta <-> Coeng Da swap
	if strings.Contains(word, coengTa) {
		variants[strings.ReplaceAll(word, coengTa, coengDa)] = true
	}
	if strings.Contains(word, coengDa) {
		variants[strings.ReplaceAll(word, coengDa, coengTa)] = true
	}

	// 2. Coeng Ro ordering swaps
	baseSet := make(map[string]bool)
	baseSet[word] = true
	for v := range variants {
		baseSet[v] = true
	}

	for w := range baseSet {
		swapped := swapCoengRoOrder(w)
		if swapped != w {
			variants[swapped] = true
		}
	}

	result := make([]string, 0, len(variants))
	for v := range variants {
		result = append(result, v)
	}
	return result
}

// swapCoengRoOrder swaps Coeng+Ro with adjacent Coeng+X patterns
func swapCoengRoOrder(word string) string {
	runes := []rune(word)
	n := len(runes)
	if n < 4 {
		return word
	}

	result := make([]rune, 0, n)
	i := 0
	changed := false

	for i < n {
		// Look for pattern: Coeng + Ro + Coeng + X
		if i+3 < n &&
			runes[i] == 0x17D2 && runes[i+1] == 0x179A &&
			runes[i+2] == 0x17D2 && runes[i+3] != 0x179A {
			result = append(result, runes[i+2], runes[i+3], runes[i], runes[i+1])
			i += 4
			changed = true
			continue
		}
		// Look for pattern: Coeng + X + Coeng + Ro
		if i+3 < n &&
			runes[i] == 0x17D2 && runes[i+1] != 0x179A &&
			runes[i+2] == 0x17D2 && runes[i+3] == 0x179A {
			result = append(result, runes[i+2], runes[i+3], runes[i], runes[i+1])
			i += 4
			changed = true
			continue
		}
		result = append(result, runes[i])
		i++
	}

	if changed {
		return string(result)
	}
	return word
}

func (d *Dictionary) loadFrequencies(path string) error {
	file, err := os.Open(path)
	if err != nil {
		fmt.Printf("Frequency file not found at %s. Using default costs.\n", path)
		return nil
	}
	defer file.Close()

	var data map[string]float64
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&data); err != nil {
		return fmt.Errorf("error parsing frequency file: %w", err)
	}

	effectiveCounts := make(map[string]float32, len(data))
	var totalTokens float32 = 0

	for word, count := range data {
		eff := float32(math.Max(count, minFreqFloor))
		effectiveCounts[word] = eff

		// Add variants with same frequency
		variants := d.generateVariants(word)
		for _, v := range variants {
			if _, exists := effectiveCounts[v]; !exists {
				effectiveCounts[v] = eff
			}
		}

		totalTokens += eff
	}

	if totalTokens > 0 {
		minProb := minFreqFloor / totalTokens
		d.DefaultCost = float32(-math.Log10(float64(minProb)))
		d.UnknownCost = d.DefaultCost + 5.0

		for word, count := range effectiveCounts {
			prob := count / totalTokens
			if prob > 0 {
				d.WordCosts[word] = float32(-math.Log10(float64(prob)))
			}
		}
	}

	fmt.Printf("Loaded frequencies for %d words.\n", len(d.WordCosts))
	fmt.Printf("Default cost: %.2f (freq floor=%.0f), Unknown cost: %.2f\n",
		d.DefaultCost, minFreqFloor, d.UnknownCost)
	return nil
}

// buildTrie builds the optimized trie from the dictionary
func (d *Dictionary) buildTrie() {
	for word := range d.Words {
		cost := d.GetWordCost(word)
		d.insertIntoTrie(word, cost)
	}
}

// insertIntoTrie inserts a word into the trie
func (d *Dictionary) insertIntoTrie(word string, cost float32) {
	node := d.trie
	for _, r := range word {
		node = node.getOrCreateChild(r)
	}
	node.isWord = true
	node.cost = cost
}

// LookupRuneRange looks up a slice range in the trie (zero allocation)
//
//go:inline
func (d *Dictionary) LookupRuneRange(runes []rune, start, end int) (float32, bool) {
	node := d.trie
	for i := start; i < end; i++ {
		child := node.getChild(runes[i])
		if child == nil {
			return 0, false
		}
		node = child
	}
	if node.isWord {
		return node.cost, true
	}
	return 0, false
}

// LookupRunes looks up a rune slice in the trie and returns (cost, found)
func (d *Dictionary) LookupRunes(runes []rune) (float32, bool) {
	return d.LookupRuneRange(runes, 0, len(runes))
}

// Contains checks if a word is in the dictionary
func (d *Dictionary) Contains(word string) bool {
	return d.Words[word]
}

// GetWordCost returns the cost for a word
func (d *Dictionary) GetWordCost(word string) float32 {
	if cost, ok := d.WordCosts[word]; ok {
		return cost
	}
	if d.Words[word] {
		return d.DefaultCost
	}
	return d.UnknownCost
}
