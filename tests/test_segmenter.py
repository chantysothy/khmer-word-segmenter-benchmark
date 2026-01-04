"""
Unit tests for Khmer Word Segmenter.
Tests against the shared test cases to ensure 100% match with baseline.
"""
import json
import os
import sys
import unittest

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from khmer_segmenter.viterbi import KhmerSegmenter


class TestKhmerSegmenter(unittest.TestCase):
    """Test cases for Khmer word segmentation."""

    @classmethod
    def setUpClass(cls):
        """Initialize segmenter once for all tests."""
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        dict_path = os.path.join(base_dir, 'data', 'khmer_dictionary_words.txt')
        freq_path = os.path.join(base_dir, 'data', 'khmer_word_frequencies.json')
        cls.segmenter = KhmerSegmenter(dict_path, freq_path)

        # Load test cases
        test_cases_path = os.path.join(base_dir, 'data', 'test_cases.json')
        with open(test_cases_path, 'r', encoding='utf-8') as f:
            cls.test_cases = json.load(f)

    def test_all_cases_match_expected(self):
        """Test that all segmentation results match expected output."""
        failures = []
        for tc in self.test_cases:
            result = self.segmenter.segment(tc['input'])
            if result != tc['expected']:
                failures.append({
                    'id': tc['id'],
                    'description': tc['description'],
                    'input': tc['input'],
                    'expected': tc['expected'],
                    'actual': result
                })

        if failures:
            msg = f"\n{len(failures)} test case(s) failed:\n"
            for f in failures:
                msg += f"  [{f['id']}] {f['description']}\n"
                msg += f"    Input: {f['input']}\n"
                msg += f"    Expected: {f['expected']}\n"
                msg += f"    Actual: {f['actual']}\n"
            self.fail(msg)

    def test_single_known_word(self):
        """Test segmentation of single known words."""
        result = self.segmenter.segment('សួស្តី')
        self.assertEqual(result, ['សួស្តី'])

        result = self.segmenter.segment('កម្ពុជា')
        self.assertEqual(result, ['កម្ពុជា'])

    def test_multiple_words(self):
        """Test segmentation of multiple words."""
        result = self.segmenter.segment('ខ្ញុំស្រលាញ់កម្ពុជា')
        self.assertEqual(result, ['ខ្ញុំ', 'ស្រលាញ់', 'កម្ពុជា'])

    def test_with_spaces(self):
        """Test that spaces are preserved correctly."""
        result = self.segmenter.segment('សួស្តី បង')
        self.assertEqual(result, ['សួស្តី', ' ', 'បង'])

    def test_numbers(self):
        """Test number grouping."""
        result = self.segmenter.segment('១២៣៤៥')
        self.assertEqual(result, ['១២៣៤៥'])

    def test_empty_string(self):
        """Test empty input."""
        result = self.segmenter.segment('')
        self.assertEqual(result, [])

    def test_space_before_sign_pattern(self):
        """Test the problematic space-before-sign pattern (regression test)."""
        result = self.segmenter.segment('សម្រា ប់ការ')
        self.assertEqual(result, ['ស', 'ម្រា ប់', 'ការ'])

    def test_punctuation(self):
        """Test punctuation handling."""
        result = self.segmenter.segment('សួស្តី។')
        self.assertEqual(result, ['សួស្តី', '។'])


if __name__ == '__main__':
    unittest.main()
