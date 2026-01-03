import sys
import os
import time
import subprocess
import json
import platform
import argparse

# Add parent directory to path to import python implementation
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from khmer_segmenter import KhmerSegmenter

def get_rust_binary_path():
    base_path = os.path.join(os.path.dirname(__file__), '..', 'khmer-rs', 'target', 'release')
    binary_name = "khmer-rs.exe" if platform.system() == "Windows" else "khmer-rs"
    return os.path.abspath(os.path.join(base_path, binary_name))

def run_python_benchmark(input_file, limit, dict_path, freq_path):
    print(f"Running Python implementation (Limit: {limit})...")

    # Load model
    start_load = time.time()
    segmenter = KhmerSegmenter(dict_path, freq_path)
    load_time = time.time() - start_load
    print(f"Python Load Time: {load_time:.4f}s")

    # Read lines
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f if line.strip()]

    if limit and limit < len(lines):
        lines = lines[:limit]

    print(f"Processing {len(lines)} lines...")

    # Process
    start_process = time.time()
    count = 0
    for line in lines:
        segmenter.segment(line)
        count += 1

    duration = time.time() - start_process
    speed = len(lines) / duration

    print(f"Python Time: {duration:.4f}s")
    print(f"Python Speed: {speed:.2f} lines/sec")

    return duration, speed, load_time

def run_rust_benchmark(binary_path, input_file, limit, dict_path, freq_path):
    print(f"\nRunning Rust implementation (Limit: {limit})...")

    output_file = "temp_rust_output.jsonl"

    cmd = [
        binary_path,
        "--dict", dict_path,
        "--freq", freq_path,
        "--input", input_file,
        "--output", output_file
    ]

    if limit:
        cmd.extend(["--limit", str(limit)])

    start_time = time.time()

    try:
        # Capture stdout to parse the reported speed/time
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')

        if result.returncode != 0:
            print(f"Rust binary failed: {result.stderr}")
            return None, None, None

        # Parse output for timing info
        # Expecting:
        # Model loaded in 0.05s
        # ...
        # Time taken: 0.15s
        # Speed: 12345.67 lines/sec

        rust_load_time = 0.0
        rust_total_time = 0.0
        rust_speed = 0.0

        for line in result.stdout.splitlines():
            if "Model loaded in" in line:
                try:
                    rust_load_time = float(line.split("Model loaded in")[1].strip().replace("s", ""))
                except: pass
            if "Time taken:" in line:
                try:
                    rust_total_time = float(line.split("Time taken:")[1].strip().replace("s", ""))
                except: pass
            if "Speed:" in line:
                try:
                    rust_speed = float(line.split("Speed:")[1].strip().split()[0])
                except: pass

        print(result.stdout.strip())

        # Cleanup
        if os.path.exists(output_file):
            os.remove(output_file)

        return rust_total_time, rust_speed, rust_load_time

    except Exception as e:
        print(f"Error running Rust binary: {e}")
        return None, None, None

def main():
    parser = argparse.ArgumentParser(description="Compare Python vs Rust Khmer Segmenter Performance")
    parser.add_argument("--limit", type=int, default=1000, help="Number of lines to process")
    parser.add_argument("--source", default=None, help="Input corpus file")
    args = parser.parse_args()

    # Paths
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, 'data')
    dict_path = os.path.join(data_dir, "khmer_dictionary_words.txt")
    freq_path = os.path.join(data_dir, "khmer_word_frequencies.json")

    # Input file
    input_file = args.source
    if not input_file:
        input_file = os.path.join(data_dir, "khmer_folktales_extracted.txt")
        if not os.path.exists(input_file):
            # Fallback to wiki corpus if folktales not found
            input_file = os.path.join(data_dir, "khmer_wiki_corpus.txt")

    if not os.path.exists(input_file):
        print(f"Error: Corpus file not found at {input_file}")
        sys.exit(1)

    # Check Rust binary
    rust_bin = get_rust_binary_path()
    if not os.path.exists(rust_bin):
        print(f"Warning: Rust binary not found at {rust_bin}")
        print("Please build it first: cd khmer-rs && cargo build --release")
        print("Running Python benchmark only...\n")
        run_python_benchmark(input_file, args.limit, dict_path, freq_path)
        return

    print("=" * 60)
    print("Khmer Segmenter Performance Comparison")
    print("=" * 60)

    py_time, py_speed, py_load = run_python_benchmark(input_file, args.limit, dict_path, freq_path)
    rust_time, rust_speed, rust_load = run_rust_benchmark(rust_bin, input_file, args.limit, dict_path, freq_path)

    if py_speed and rust_speed:
        print("\n" + "=" * 60)
        print("Results Summary")
        print("=" * 60)
        print(f"{'Metric':<20} | {'Python':<15} | {'Rust':<15} | {'Improvement':<15}")
        print("-" * 73)
        print(f"{'Load Time':<20} | {py_load:<15.4f} | {rust_load:<15.4f} | {py_load/rust_load:<15.2f}x")
        print(f"{'Processing Time':<20} | {py_time:<15.4f} | {rust_time:<15.4f} | {py_time/rust_time:<15.2f}x")
        print(f"{'Throughput (l/s)':<20} | {py_speed:<15.2f} | {rust_speed:<15.2f} | {rust_speed/py_speed:<15.2f}x")
        print("=" * 73)

if __name__ == "__main__":
    main()
