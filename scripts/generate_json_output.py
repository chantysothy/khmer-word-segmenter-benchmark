import sys
import os
import json
import argparse

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from khmer_segmenter import KhmerSegmenter

def generate_json(input_path, output_path):
    # Setup paths
    data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
    dict_path = os.path.join(data_dir, "khmer_dictionary_words.txt")
    freq_path = os.path.join(data_dir, "khmer_word_frequencies.json")

    segmenter = KhmerSegmenter(dict_path, freq_path)

    with open(input_path, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f if line.strip()]

    print(f"Processing {len(lines)} lines...")

    with open(output_path, 'w', encoding='utf-8') as f_out:
        for line in lines:
            # Python segmenter returns a list of strings
            segments = segmenter.segment(line)
            # Dump to JSON string without pretty printing, matching C++ format
            # ensure_ascii=False to keep Khmer chars as is, C++ might be escaping them?
            # Let's check C++ escape_json again.
            # C++ escape_json escapes control chars, but passes others through.
            # It creates valid JSON strings.
            # Python json.dumps(ensure_ascii=False) produces unescaped unicode chars.
            # C++ implementation:
            #   case '\\"': out += "\\\""; break;
            #   default: if (c < 0x20) { ... } else { out += c; }
            # So C++ outputs raw UTF-8 bytes for Khmer characters.

            json_str = json.dumps(segments, ensure_ascii=False)
            f_out.write(json_str + "\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    generate_json(args.input, args.output)
