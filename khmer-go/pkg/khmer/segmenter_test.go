package khmer

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// TestCase represents a single test case from the shared test file
type TestCase struct {
	ID          int      `json:"id"`
	Input       string   `json:"input"`
	Description string   `json:"description"`
	Expected    []string `json:"expected"`
}

var testSegmenter *KhmerSegmenter
var testCases []TestCase

func TestMain(m *testing.M) {
	// Find data directory (try multiple locations)
	possiblePaths := []string{
		"../../data",           // From pkg/khmer/
		"../../../data",        // From pkg/khmer/ with extra level
		"data",                 // Current directory
		"../data",              // Parent directory
		"../../../../data",     // Deep nesting
	}

	dataDir := ""
	for _, p := range possiblePaths {
		testFile := filepath.Join(p, "test_cases.json")
		if _, err := os.Stat(testFile); err == nil {
			dataDir = p
			break
		}
	}
	if dataDir == "" {
		panic("Could not find data directory with test_cases.json")
	}

	dictPath := filepath.Join(dataDir, "khmer_dictionary_words.txt")
	freqPath := filepath.Join(dataDir, "khmer_word_frequencies.json")
	testCasesPath := filepath.Join(dataDir, "test_cases.json")

	// Initialize segmenter
	dict := NewDictionary()
	if err := dict.Load(dictPath, freqPath); err != nil {
		panic("Failed to load dictionary: " + err.Error())
	}
	testSegmenter = NewKhmerSegmenter(dict)

	// Load test cases
	data, err := os.ReadFile(testCasesPath)
	if err != nil {
		panic("Failed to load test cases: " + err.Error())
	}
	if err := json.Unmarshal(data, &testCases); err != nil {
		panic("Failed to parse test cases: " + err.Error())
	}

	os.Exit(m.Run())
}

func TestAllCasesMatchExpected(t *testing.T) {
	var failures []TestCase
	for _, tc := range testCases {
		result := testSegmenter.Segment(tc.Input)
		if !reflect.DeepEqual(result, tc.Expected) {
			failures = append(failures, TestCase{
				ID:          tc.ID,
				Input:       tc.Input,
				Description: tc.Description,
				Expected:    tc.Expected,
			})
			t.Errorf("[%d] %s\n  Input: %s\n  Expected: %v\n  Actual: %v",
				tc.ID, tc.Description, tc.Input, tc.Expected, result)
		}
	}
	if len(failures) > 0 {
		t.Errorf("%d/%d test cases failed", len(failures), len(testCases))
	}
}

func TestSingleKnownWord(t *testing.T) {
	result := testSegmenter.Segment("សួស្តី")
	expected := []string{"សួស្តី"}
	if !reflect.DeepEqual(result, expected) {
		t.Errorf("Expected %v, got %v", expected, result)
	}
}

func TestMultipleWords(t *testing.T) {
	result := testSegmenter.Segment("ខ្ញុំស្រលាញ់កម្ពុជា")
	expected := []string{"ខ្ញុំ", "ស្រលាញ់", "កម្ពុជា"}
	if !reflect.DeepEqual(result, expected) {
		t.Errorf("Expected %v, got %v", expected, result)
	}
}

func TestWithSpaces(t *testing.T) {
	result := testSegmenter.Segment("សួស្តី បង")
	expected := []string{"សួស្តី", " ", "បង"}
	if !reflect.DeepEqual(result, expected) {
		t.Errorf("Expected %v, got %v", expected, result)
	}
}

func TestNumbers(t *testing.T) {
	result := testSegmenter.Segment("១២៣៤៥")
	expected := []string{"១២៣៤៥"}
	if !reflect.DeepEqual(result, expected) {
		t.Errorf("Expected %v, got %v", expected, result)
	}
}

func TestEmptyString(t *testing.T) {
	result := testSegmenter.Segment("")
	if len(result) != 0 {
		t.Errorf("Expected empty slice, got %v", result)
	}
}

func TestSpaceBeforeSignPattern(t *testing.T) {
	// Regression test for the fix
	result := testSegmenter.Segment("សម្រា ប់ការ")
	expected := []string{"ស", "ម្រា ប់", "ការ"}
	if !reflect.DeepEqual(result, expected) {
		t.Errorf("Expected %v, got %v", expected, result)
	}
}

func TestPunctuation(t *testing.T) {
	result := testSegmenter.Segment("សួស្តី។")
	expected := []string{"សួស្តី", "។"}
	if !reflect.DeepEqual(result, expected) {
		t.Errorf("Expected %v, got %v", expected, result)
	}
}
