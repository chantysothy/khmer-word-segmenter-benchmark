import os
import sys
import subprocess
import json

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
TEST_INPUT = os.path.join(DATA_DIR, 'khmer_folktales_extracted.txt')
TEST_LIMIT = 200

sys.path.insert(0, BASE_DIR)
from khmer_segmenter import KhmerSegmenter

def generate_python_output():
    print("Generating Python reference output...")
    dict_path = os.path.join(DATA_DIR, "khmer_dictionary_words.txt")
    freq_path = os.path.join(DATA_DIR, "khmer_word_frequencies.json")
    seg = KhmerSegmenter(dict_path, freq_path)

    with open(TEST_INPUT, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f if line.strip()][:TEST_LIMIT]

    results = []
    for i, line in enumerate(lines):
        segments = seg.segment(line)
        results.append({"id": i, "input": line, "segments": segments})
    return results

def run_java():
    print("Generating Java output...")
    temp_input = os.path.join(BASE_DIR, 'temp_test_input.txt')
    out_file = os.path.join(BASE_DIR, 'test_output_java.jsonl')

    with open(TEST_INPUT, 'r', encoding='utf-8') as f:
        lines = [line for line in f if line.strip()][:TEST_LIMIT]
    with open(temp_input, 'w', encoding='utf-8') as f:
        f.writelines(lines)

    java_classes = os.path.join(BASE_DIR, 'khmer-java', 'target', 'classes')
    cmd = ["java", "-cp", java_classes, "khmer.Main",
           "--dict", os.path.join(DATA_DIR, "khmer_dictionary_words.txt"),
           "--freq", os.path.join(DATA_DIR, "khmer_word_frequencies.json"),
           "--input", temp_input, "--output", out_file]

    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    if result.returncode != 0:
        print(f"Java failed: {result.stderr}")
        return None

    with open(out_file, 'r', encoding='utf-8') as f:
        results = [json.loads(line) for line in f if line.strip()]

    os.remove(temp_input)
    os.remove(out_file)
    return results

def run_wasm():
    print("Generating WASM output...")
    temp_input = os.path.join(BASE_DIR, 'temp_test_input.txt')
    out_file = os.path.join(BASE_DIR, 'test_output_wasm.jsonl')

    with open(TEST_INPUT, 'r', encoding='utf-8') as f:
        lines = [line for line in f if line.strip()][:TEST_LIMIT]
    with open(temp_input, 'w', encoding='utf-8') as f:
        f.writelines(lines)

    wasm_runner = os.path.join(BASE_DIR, 'khmer-wasm', 'runner.js')
    cmd = ["node", wasm_runner,
           "--dict", os.path.join(DATA_DIR, "khmer_dictionary_words.txt"),
           "--freq", os.path.join(DATA_DIR, "khmer_word_frequencies.json"),
           "--input", temp_input, "--output", out_file]

    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    if result.returncode != 0:
        print(f"WASM failed: {result.stderr}")
        return None

    with open(out_file, 'r', encoding='utf-8') as f:
        results = [json.loads(line) for line in f if line.strip()]

    os.remove(temp_input)
    os.remove(out_file)
    return results

def analyze_differences(name, test_results, ref_results):
    print(f"\n{'='*60}")
    print(f"ANALYZING {name} DIFFERENCES")
    print(f"{'='*60}")

    mismatches = []
    for i, (ref, test) in enumerate(zip(ref_results, test_results)):
        ref_segs = ref['segments']
        test_segs = test['segments']

        if ref_segs != test_segs:
            mismatches.append((i, ref['input'], ref_segs, test_segs))

    print(f"Total mismatches: {len(mismatches)}/{len(ref_results)}")

    if mismatches:
        # Show first 5 detailed mismatches
        print(f"\nFirst 5 detailed mismatches:")
        for idx, (line_id, input_text, ref_segs, test_segs) in enumerate(mismatches[:5]):
            print(f"\n--- Line {line_id} ---")
            print(f"Input: {input_text[:80]}...")
            print(f"Python segments ({len(ref_segs)}): {ref_segs}")
            print(f"{name} segments ({len(test_segs)}): {test_segs}")

            # Find specific differences
            print("Differences:")
            max_len = max(len(ref_segs), len(test_segs))
            for j in range(max_len):
                ref_seg = ref_segs[j] if j < len(ref_segs) else "<missing>"
                test_seg = test_segs[j] if j < len(test_segs) else "<missing>"
                if ref_seg != test_seg:
                    print(f"  [{j}] Python: '{ref_seg}' vs {name}: '{test_seg}'")

    return mismatches

def main():
    python_results = generate_python_output()

    java_results = run_java()
    if java_results:
        analyze_differences("Java", java_results, python_results)

    wasm_results = run_wasm()
    if wasm_results:
        analyze_differences("WASM", wasm_results, python_results)

if __name__ == "__main__":
    main()
