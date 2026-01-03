import sys
import os
import time
import argparse

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from khmer_segmenter import KhmerSegmenter

def benchmark_file(input_path, limit=None):
    # Setup paths
    data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
    dict_path = os.path.join(data_dir, "khmer_dictionary_words.txt")
    freq_path = os.path.join(data_dir, "khmer_word_frequencies.json")

    print("Loading Dictionary...")
    start_load = time.time()
    segmenter = KhmerSegmenter(dict_path, freq_path)
    print(f"Dictionary loaded in {time.time() - start_load:.4f}s")

    print(f"Reading {input_path}...")
    with open(input_path, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f if line.strip()]

    if limit and limit > 0:
        lines = lines[:limit]

    print(f"Loaded {len(lines)} lines.")

    print("Processing...")
    start_proc = time.time()

    # Process sequentially (Python is single threaded for CPU bound tasks usually)
    count = 0
    for line in lines:
        segmenter.segment(line)
        count += 1

    end_proc = time.time()
    duration = end_proc - start_proc

    print(f"Processed {count} lines in {duration:.4f}s")
    if duration > 0:
        print(f"Speed: {count / duration:.2f} lines/sec")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--limit", type=int, default=-1)
    args = parser.parse_args()

    benchmark_file(args.input, args.limit)
