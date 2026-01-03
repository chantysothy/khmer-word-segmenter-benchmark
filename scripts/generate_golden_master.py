import sys
import os
import json
import time

# Add parent directory to path to import the module
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from khmer_segmenter import KhmerSegmenter

def generate_golden_master(source_file, output_file, limit=1000):
    print(f"Initializing Segmenter...")
    data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
    dict_path = os.path.join(data_dir, "khmer_dictionary_words.txt")
    freq_path = os.path.join(data_dir, "khmer_word_frequencies.json")

    seg = KhmerSegmenter(dict_path, freq_path)

    print(f"Reading source: {source_file}")
    with open(source_file, 'r', encoding='utf-8') as f:
        lines = [l.strip() for l in f if l.strip()]

    if limit:
        lines = lines[:limit]

    print(f"Processing {len(lines)} lines...")

    start_time = time.time()
    with open(output_file, 'w', encoding='utf-8') as f:
        for i, line in enumerate(lines):
            segments = seg.segment(line)
            record = {
                "id": i,
                "input": line,
                "segments": segments
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

            if (i + 1) % 100 == 0:
                print(f"Processed {i + 1}/{len(lines)}")

    print(f"Done. Saved to {output_file}")
    print(f"Time taken: {time.time() - start_time:.2f}s")

if __name__ == "__main__":
    source = os.path.join(os.path.dirname(__file__), '..', 'data', 'khmer_folktales_extracted.txt')
    output = os.path.join(os.path.dirname(__file__), '..', 'data', 'golden_master.jsonl')
    generate_golden_master(source, output)
