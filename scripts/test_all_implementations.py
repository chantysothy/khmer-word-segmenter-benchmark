import os
import sys
import subprocess
import json

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
TEST_INPUT = os.path.join(DATA_DIR, 'khmer_folktales_extracted.txt')
TEST_LIMIT = 200  # Test with 200 lines for faster comparison

# Output files
OUT_PYTHON = os.path.join(BASE_DIR, 'test_output_python.jsonl')
OUT_NODE = os.path.join(BASE_DIR, 'test_output_node.jsonl')
OUT_CSHARP = os.path.join(BASE_DIR, 'test_output_csharp.jsonl')
OUT_RUST = os.path.join(BASE_DIR, 'test_output_rust.jsonl')
OUT_CPP = os.path.join(BASE_DIR, 'test_output_cpp.jsonl')
OUT_JAVA = os.path.join(BASE_DIR, 'test_output_java.jsonl')
OUT_GO = os.path.join(BASE_DIR, 'test_output_go.jsonl')
OUT_WASM = os.path.join(BASE_DIR, 'test_output_wasm.jsonl')

sys.path.insert(0, BASE_DIR)
from khmer_segmenter import KhmerSegmenter

def generate_python_output():
    print("Generating Python reference output...")
    dict_path = os.path.join(DATA_DIR, "khmer_dictionary_words.txt")
    freq_path = os.path.join(DATA_DIR, "khmer_word_frequencies.json")
    seg = KhmerSegmenter(dict_path, freq_path)

    with open(TEST_INPUT, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f if line.strip()][:TEST_LIMIT]

    with open(OUT_PYTHON, 'w', encoding='utf-8') as out:
        for i, line in enumerate(lines):
            segments = seg.segment(line)
            record = {"id": i, "input": line, "segments": segments}
            out.write(json.dumps(record, ensure_ascii=False) + '\n')
    print(f"  Generated {len(lines)} lines to {OUT_PYTHON}")

def run_impl(name, cmd, output_file):
    print(f"Generating {name} output...")
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    if result.returncode != 0:
        print(f"  FAILED: {result.stderr[:200]}")
        return False
    print(f"  Generated output to {output_file}")
    return True

def compare_outputs(name, test_file, ref_file):
    try:
        with open(ref_file, 'r', encoding='utf-8') as f:
            ref_lines = [json.loads(line) for line in f if line.strip()]
        with open(test_file, 'r', encoding='utf-8') as f:
            test_lines = [json.loads(line) for line in f if line.strip()]
    except Exception as e:
        print(f"  {name}: ERROR reading files - {e}")
        return False

    if len(ref_lines) != len(test_lines):
        print(f"  {name}: FAILED - Line count mismatch ({len(test_lines)} vs {len(ref_lines)} expected)")
        return False

    mismatches = 0
    first_mismatch = None
    for i, (ref, test) in enumerate(zip(ref_lines, test_lines)):
        # Handle different output formats:
        # - Standard format: {"id": 0, "input": "...", "segments": [...]}
        # - C++ format: ["segment1", "segment2", ...]  (just the array)
        ref_segments = ref['segments'] if isinstance(ref, dict) else ref
        test_segments = test['segments'] if isinstance(test, dict) else test

        if ref_segments != test_segments:
            mismatches += 1
            if first_mismatch is None:
                first_mismatch = (i, ref_segments, test_segments)

    if mismatches == 0:
        print(f"  {name}: PASSED - 100% match ({len(ref_lines)} lines)")
        return True
    else:
        print(f"  {name}: FAILED - {mismatches}/{len(ref_lines)} mismatches")
        if first_mismatch:
            i, ref_segs, test_segs = first_mismatch
            print(f"    First mismatch at line {i}:")
            print(f"    Python: {ref_segs[:5]}...")
            print(f"    {name}: {test_segs[:5]}...")
        return False

def main():
    os.chdir(BASE_DIR)

    # Generate Python reference
    generate_python_output()

    # Create temp input file with limited lines
    temp_input = os.path.join(BASE_DIR, 'temp_test_input.txt')
    with open(TEST_INPUT, 'r', encoding='utf-8') as f:
        lines = [line for line in f if line.strip()][:TEST_LIMIT]
    with open(temp_input, 'w', encoding='utf-8') as f:
        f.writelines(lines)

    implementations = []

    # Node.js
    node_dist = os.path.join(BASE_DIR, 'khmer-node', 'dist', 'index.js')
    if os.path.exists(node_dist):
        run_impl("Node.js", ["node", node_dist, "--input", temp_input, "--output", OUT_NODE], OUT_NODE)
        implementations.append(("Node.js", OUT_NODE))

    # C#
    for version in ['net10.0', 'net9.0', 'net8.0']:
        dll = os.path.join(BASE_DIR, 'khmer-dotnet', 'bin', 'Release', version, 'khmer-dotnet.dll')
        if os.path.exists(dll):
            run_impl("C#", ["dotnet", dll, "--input", temp_input, "--output", OUT_CSHARP], OUT_CSHARP)
            implementations.append(("C#", OUT_CSHARP))
            break

    # Rust
    rust_exe = os.path.join(BASE_DIR, 'khmer-rs', 'target', 'release', 'khmer-rs.exe')
    if os.path.exists(rust_exe):
        run_impl("Rust", [rust_exe, "--dict", os.path.join(DATA_DIR, "khmer_dictionary_words.txt"),
                         "--freq", os.path.join(DATA_DIR, "khmer_word_frequencies.json"),
                         "--input", temp_input, "--output", OUT_RUST], OUT_RUST)
        implementations.append(("Rust", OUT_RUST))

    # C++
    cpp_exe = os.path.join(BASE_DIR, 'khmer-cpp', 'build', 'Release', 'khmer_segmenter_cpp.exe')
    if os.path.exists(cpp_exe):
        run_impl("C++", [cpp_exe, "--dict", os.path.join(DATA_DIR, "khmer_dictionary_words.txt"),
                        "--freq", os.path.join(DATA_DIR, "khmer_word_frequencies.json"),
                        "--input", temp_input, "--output", OUT_CPP, "--threads", "1"], OUT_CPP)
        implementations.append(("C++", OUT_CPP))

    # Java
    java_classes = os.path.join(BASE_DIR, 'khmer-java', 'target', 'classes')
    if os.path.exists(java_classes):
        run_impl("Java", ["java", "-cp", java_classes, "khmer.Main",
                         "--dict", os.path.join(DATA_DIR, "khmer_dictionary_words.txt"),
                         "--freq", os.path.join(DATA_DIR, "khmer_word_frequencies.json"),
                         "--input", temp_input, "--output", OUT_JAVA], OUT_JAVA)
        implementations.append(("Java", OUT_JAVA))

    # Go
    go_exe = os.path.join(BASE_DIR, 'khmer-go', 'khmer.exe')
    if os.path.exists(go_exe):
        run_impl("Go", [go_exe, "--dict", os.path.join(DATA_DIR, "khmer_dictionary_words.txt"),
                       "--freq", os.path.join(DATA_DIR, "khmer_word_frequencies.json"),
                       "--input", temp_input, "--output", OUT_GO], OUT_GO)
        implementations.append(("Go", OUT_GO))

    # WASM
    wasm_runner = os.path.join(BASE_DIR, 'khmer-wasm', 'runner.js')
    if os.path.exists(wasm_runner):
        run_impl("WASM", ["node", wasm_runner,
                         "--dict", os.path.join(DATA_DIR, "khmer_dictionary_words.txt"),
                         "--freq", os.path.join(DATA_DIR, "khmer_word_frequencies.json"),
                         "--input", temp_input, "--output", OUT_WASM], OUT_WASM)
        implementations.append(("WASM", OUT_WASM))

    # Compare all outputs
    print("\n" + "="*50)
    print("COMPARISON RESULTS (vs Python reference)")
    print("="*50)

    passed = 0
    failed = 0
    for name, output_file in implementations:
        if os.path.exists(output_file):
            if compare_outputs(name, output_file, OUT_PYTHON):
                passed += 1
            else:
                failed += 1
        else:
            print(f"  {name}: SKIPPED - output file not found")

    print("\n" + "="*50)
    print(f"SUMMARY: {passed} passed, {failed} failed out of {len(implementations)} implementations")
    print("="*50)

    # Cleanup
    for f in [temp_input, OUT_PYTHON, OUT_NODE, OUT_CSHARP, OUT_RUST, OUT_CPP, OUT_JAVA, OUT_GO, OUT_WASM]:
        if os.path.exists(f):
            os.remove(f)

if __name__ == "__main__":
    main()
