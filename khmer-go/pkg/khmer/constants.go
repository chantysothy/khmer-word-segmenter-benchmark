package khmer

// Unicode character classification utilities for Khmer script.
// Khmer Unicode Block: U+1780 - U+17FF (main), U+19E0 - U+19FF (symbols)

// ValidSingleWords are single characters that can stand alone as words
var ValidSingleWords = map[rune]bool{
	'\u1780': true, '\u1781': true, '\u1782': true, '\u1784': true, '\u1785': true,
	'\u1786': true, '\u1789': true, '\u178A': true, '\u178F': true, '\u1791': true,
	'\u1796': true, '\u179A': true, '\u179B': true, '\u179F': true, '\u17A1': true, // Consonants
	'\u17AC': true, '\u17AE': true, '\u17AA': true, '\u17AF': true, '\u17B1': true,
	'\u17A6': true, '\u17A7': true, '\u17B3': true, // Independent Vowels
}

// CurrencySymbols that should be grouped with numbers
var CurrencySymbols = map[rune]bool{
	'$': true, '\u17DB': true, '\u20AC': true, '\u00A3': true, '\u00A5': true,
}

// SeparatorChars includes punctuation and special characters
const SeparatorChars = "!?.,;:\"'()[]{}-/ \u00AB\u00BB\u201C\u201D\u02DD$%"

// IsKhmerChar checks if character is in Khmer Unicode range
func IsKhmerChar(r rune) bool {
	return (r >= 0x1780 && r <= 0x17FF) || (r >= 0x19E0 && r <= 0x19FF)
}

// IsConsonant checks if character is a Khmer consonant (U+1780 - U+17A2)
func IsConsonant(r rune) bool {
	return r >= 0x1780 && r <= 0x17A2
}

// IsCoeng checks if character is the Coeng (subscript marker) U+17D2
func IsCoeng(r rune) bool {
	return r == 0x17D2
}

// IsDependentVowel checks if character is a dependent vowel (U+17B6 - U+17C5)
func IsDependentVowel(r rune) bool {
	return r >= 0x17B6 && r <= 0x17C5
}

// IsSign checks if character is a sign/diacritic
func IsSign(r rune) bool {
	return (r >= 0x17C6 && r <= 0x17D1) || r == 0x17D3 || r == 0x17DD
}

// IsDigit checks if character is a digit (ASCII or Khmer)
func IsDigit(r rune) bool {
	return (r >= '0' && r <= '9') || (r >= 0x17E0 && r <= 0x17E9)
}

// IsCurrencySymbol checks if character is a currency symbol
func IsCurrencySymbol(r rune) bool {
	return CurrencySymbols[r]
}

// IsSeparator checks if character is a separator/punctuation
func IsSeparator(r rune) bool {
	// Khmer punctuation range
	if r >= 0x17D4 && r <= 0x17DA {
		return true
	}
	// Currency Riel
	if r == 0x17DB {
		return true
	}
	// ASCII/General punctuation
	for _, c := range SeparatorChars {
		if r == c {
			return true
		}
	}
	return false
}

// IsValidSingleWord checks if character can be a single-character word
func IsValidSingleWord(r rune) bool {
	return ValidSingleWords[r]
}
