import sys
import os

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from khmer_segmenter import KhmerSegmenter

def test_acronyms():
    # Setup
    data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
    dict_path = os.path.join(data_dir, "khmer_dictionary_words.txt")
    freq_path = os.path.join(data_dir, "khmer_word_frequencies.json")
    
    if not os.path.exists(dict_path):
        print(f"Dictionary not found at {dict_path}")
        return

    segmenter = KhmerSegmenter(dict_path, freq_path)
    
    test_cases = [
        ("ចម្ងាយ៥០គ.ម.", ["ចម្ងាយ", "៥០", "គ.ម."]),
        ("ព.ស.២៥៦០", ["ព.ស.", "២៥៦០"]),
        ("រាជធានីភ្នំពេញប.ក.", ["រាជធានី", "ភ្នំពេញ", "ប.ក."]), # Post code?
        ("គ.ជ.ប.", ["គ.ជ.ប."]),
    ]
    
    failed = 0
    for text, expected in test_cases:
        result = segmenter.segment(text)
        # We need to filter out pure separators from result for easier comparison? 
        # Or just expect exact match.
        # Current segmenter keeps ZWS? No it strips it.
        # It keeps punctuation as separate segments usually.
        
        # Join result to checking
        print(f"Input: {text}")
        print(f"Result: {result}")
        
        # Check if 'គ.ម.' is in result as a single token
        expected_acronyms = [t for t in expected if '.' in t]
        for acr in expected_acronyms:
            if acr not in result:
                print(f"  FAILED: Expected acronym '{acr}' not found in segments.")
                failed += 1
            else:
                print(f"  PASSED: Found '{acr}'")
        print("-" * 20)

    if failed == 0:
        print("All Tests PASSED")
    else:
        print(f"{failed} Tests FAILED")

if __name__ == "__main__":
    test_acronyms()
