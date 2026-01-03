import sys
import os
import time
import subprocess
import json

# Force UTF-8
sys.stdout.reconfigure(encoding='utf-8')

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
NODE_DIR = os.path.join(BASE_DIR, 'khmer-node')
JAVA_DIR = os.path.join(BASE_DIR, 'khmer-java')
GO_DIR = os.path.join(BASE_DIR, 'khmer-go')
CPP_DIR = os.path.join(BASE_DIR, 'khmer-cpp')
TEMP_INPUT = os.path.join(BASE_DIR, 'temp_battle_input.txt')
TEMP_OUTPUT_NODE = os.path.join(BASE_DIR, 'temp_node_output.txt')
TEMP_OUTPUT_CSHARP = os.path.join(BASE_DIR, 'temp_csharp_output.txt')
TEMP_OUTPUT_WASM = os.path.join(BASE_DIR, 'temp_wasm_output.txt')
TEMP_OUTPUT_RUST = os.path.join(BASE_DIR, 'temp_rust_output.txt')
TEMP_OUTPUT_JAVA = os.path.join(BASE_DIR, 'temp_java_output.txt')
TEMP_OUTPUT_GO = os.path.join(BASE_DIR, 'temp_go_output.txt')
TEMP_OUTPUT_CPP = os.path.join(BASE_DIR, 'temp_cpp_output.txt')
CSHARP_PROJECT = os.path.join(BASE_DIR, 'khmer-dotnet')
WASM_DIR = os.path.join(BASE_DIR, 'khmer-wasm')
RUST_DIR = os.path.join(BASE_DIR, 'khmer-rs')

sys.path.append(BASE_DIR)
from khmer_segmenter import KhmerSegmenter

def generate_workload():
    text = (
        "ក្រុមហ៊ុនទទួលបានប្រាក់ចំណូល ១ ០០០ ០០០ ដុល្លារក្នុងឆ្នាំនេះ ខណៈដែលតម្លៃភាគហ៊ុនកើនឡើង ៥% ស្មើនឹង 50.00$។ "
        "លោក ទេព សុវិចិត្រ នាយកប្រតិបត្តិដែលបញ្ចប់ការសិក្សាពីសាកលវិទ្យាល័យភូមិន្ទភ្នំពេញ (ស.ភ.ភ.ព.) "
        "បានថ្លែងថា ភាពជោគជ័យផ្នែកហិរញ្ញវត្ថុនាឆ្នាំនេះ គឺជាសក្ខីភាពនៃកិច្ចខិតខំប្រឹងប្រែងរបស់ក្រុមការងារទាំងមូល "
        "និងការជឿទុកចិត្តពីសំណាក់វិនិយោគិន។"
    )
    # Repeat 1000 times to create a decent workload
    print("Generating workload (1000 lines)...")
    with open(TEMP_INPUT, 'w', encoding='utf-8') as f:
        for _ in range(1000):
            f.write(text + "\n")

    file_size_kb = os.path.getsize(TEMP_INPUT) / 1024
    print(f"Workload size: {file_size_kb:.2f} KB")

def benchmark_python():
    print("\n" + "="*30)
    print("PYTHON CHALLENGER")
    print("="*30)

    dict_path = os.path.join(DATA_DIR, "khmer_dictionary_words.txt")
    freq_path = os.path.join(DATA_DIR, "khmer_word_frequencies.json")

    # 1. Load Time
    start_load = time.time()
    seg = KhmerSegmenter(dict_path, freq_path)
    load_time = time.time() - start_load
    print(f"Load Time: {load_time:.4f}s")

    # 2. Processing Time
    with open(TEMP_INPUT, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f if line.strip()]

    start_proc = time.time()
    count = 0
    for line in lines:
        seg.segment(line)
        count += 1
    proc_time = time.time() - start_proc

    print(f"Processed {count} lines")
    print(f"Processing Time: {proc_time:.4f}s")
    print(f"Speed: {count / proc_time:.2f} lines/sec")

    return count / proc_time

def benchmark_node():
    print("\n" + "="*30)
    print("NODE.JS CHALLENGER")
    print("="*30)

    # Check if built
    dist_file = os.path.join(NODE_DIR, 'dist', 'index.js')
    if not os.path.exists(dist_file):
        print("Node.js build not found! Run 'npm run build' in khmer-node/")
        return 0

    cmd = [
        "node", dist_file,
        "--input", TEMP_INPUT,
        "--output", TEMP_OUTPUT_NODE
    ]

    start_time = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    total_real_time = time.time() - start_time

    if result.returncode != 0:
        print("Node.js failed:")
        print(result.stderr)
        return 0

    print(result.stdout)

    # Parse speed from stdout
    speed = 0.0
    for line in result.stdout.split('\n'):
        if "Speed:" in line:
            try:
                parts = line.split()
                speed = float(parts[1])
            except:
                pass

    print(f"Total System Time (Load+Proc): {total_real_time:.4f}s")
    return speed

def benchmark_csharp():
    print("\n" + "="*30)
    print("C# (.NET) CHALLENGER")
    print("="*30)

    # Try different .NET versions
    for version in ['net10.0', 'net9.0', 'net8.0', 'net7.0']:
        dll_path = os.path.join(CSHARP_PROJECT, 'bin', 'Release', version, 'khmer-dotnet.dll')
        if os.path.exists(dll_path):
            break
    else:
        print(f"C# build not found!")
        print("Run 'dotnet build -c Release' in khmer-dotnet/")
        return 0

    cmd = [
        "dotnet", dll_path,
        "--input", TEMP_INPUT,
        "--output", TEMP_OUTPUT_CSHARP
    ]

    start_time = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    total_real_time = time.time() - start_time

    if result.returncode != 0:
        print("C# failed:")
        print(result.stderr)
        return 0

    print(result.stdout)

    # Parse speed from stdout
    speed = 0.0
    for line in result.stdout.split('\n'):
        if "Speed:" in line:
            try:
                parts = line.split()
                speed = float(parts[1])
            except:
                pass

    print(f"Total System Time (Load+Proc): {total_real_time:.4f}s")
    return speed

def benchmark_wasm():
    print("\n" + "="*30)
    print("WEBASSEMBLY (AssemblyScript) CHALLENGER")
    print("="*30)

    runner_path = os.path.join(WASM_DIR, 'runner.js')
    if not os.path.exists(runner_path):
        print(f"Wasm runner not found at {runner_path}!")
        return 0

    cmd = [
        "node", runner_path,
        "--dict", os.path.join(DATA_DIR, "khmer_dictionary_words.txt"),
        "--freq", os.path.join(DATA_DIR, "khmer_word_frequencies.json"),
        "--input", TEMP_INPUT,
        "--output", TEMP_OUTPUT_WASM
    ]

    start_time = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    total_real_time = time.time() - start_time

    if result.returncode != 0:
        print("Wasm failed:")
        print(result.stderr)
        return 0

    print(result.stdout)

    # Parse speed from stdout
    speed = 0.0
    for line in result.stdout.split('\n'):
        if "Speed:" in line:
            try:
                parts = line.split()
                speed = float(parts[1])
            except:
                pass

    print(f"Total System Time (Load+Proc): {total_real_time:.4f}s")
    return speed

def benchmark_rust():
    print("\n" + "="*30)
    print("RUST CHALLENGER")
    print("="*30)

    # Path to executable
    exe_path = os.path.join(RUST_DIR, 'target', 'release', 'khmer-rs.exe')

    if not os.path.exists(exe_path):
        print(f"Rust build not found at {exe_path}!")
        print("Run 'cargo build --release' in khmer-rs/")
        return 0

    cmd = [
        exe_path,
        "--dict", os.path.join(DATA_DIR, "khmer_dictionary_words.txt"),
        "--freq", os.path.join(DATA_DIR, "khmer_word_frequencies.json"),
        "--input", TEMP_INPUT,
        "--output", TEMP_OUTPUT_RUST
    ]

    start_time = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    total_real_time = time.time() - start_time

    if result.returncode != 0:
        print("Rust failed:")
        print(result.stderr)
        return 0

    print(result.stdout)

    # Parse speed from stdout
    speed = 0.0
    for line in result.stdout.split('\n'):
        if "Speed:" in line:
            try:
                parts = line.split()
                speed = float(parts[1])
            except:
                pass

    print(f"Total System Time (Load+Proc): {total_real_time:.4f}s")
    return speed

def benchmark_java():
    print("\n" + "="*30)
    print("JAVA CHALLENGER")
    print("="*30)

    classes_dir = os.path.join(JAVA_DIR, 'target', 'classes')
    if not os.path.exists(classes_dir):
        print(f"Java build not found at {classes_dir}!")
        print("Run 'javac -d target/classes src/main/java/khmer/*.java' in khmer-java/")
        return 0

    # Find java executable
    java_exe = "java"
    java_paths = [
        r"C:\Program Files\Zulu\zulu-17\bin\java.exe",
        r"C:\Program Files\Zulu\zulu-21\bin\java.exe",
        r"C:\Program Files\Java\jdk-17\bin\java.exe",
    ]
    for jp in java_paths:
        if os.path.exists(jp):
            java_exe = jp
            break

    cmd = [
        java_exe, "-cp", classes_dir, "khmer.Main",
        "--dict", os.path.join(DATA_DIR, "khmer_dictionary_words.txt"),
        "--freq", os.path.join(DATA_DIR, "khmer_word_frequencies.json"),
        "--input", TEMP_INPUT,
        "--output", TEMP_OUTPUT_JAVA
    ]

    start_time = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    total_real_time = time.time() - start_time

    if result.returncode != 0:
        print("Java failed:")
        print(result.stderr)
        return 0

    print(result.stdout)

    # Parse speed from stdout
    speed = 0.0
    for line in result.stdout.split('\n'):
        if "Speed:" in line:
            try:
                parts = line.split()
                speed = float(parts[1])
            except:
                pass

    print(f"Total System Time (Load+Proc): {total_real_time:.4f}s")
    return speed

def benchmark_go():
    print("\n" + "="*30)
    print("GO CHALLENGER")
    print("="*30)

    exe_path = os.path.join(GO_DIR, 'khmer.exe')
    if not os.path.exists(exe_path):
        print(f"Go build not found at {exe_path}!")
        print("Run 'go build -o khmer.exe ./cmd/khmer' in khmer-go/")
        return 0

    cmd = [
        exe_path,
        "--dict", os.path.join(DATA_DIR, "khmer_dictionary_words.txt"),
        "--freq", os.path.join(DATA_DIR, "khmer_word_frequencies.json"),
        "--input", TEMP_INPUT,
        "--output", TEMP_OUTPUT_GO
    ]

    start_time = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    total_real_time = time.time() - start_time

    if result.returncode != 0:
        print("Go failed:")
        print(result.stderr)
        return 0

    print(result.stdout)

    # Parse speed from stdout
    speed = 0.0
    for line in result.stdout.split('\n'):
        if "Speed:" in line:
            try:
                parts = line.split()
                speed = float(parts[1])
            except:
                pass

    print(f"Total System Time (Load+Proc): {total_real_time:.4f}s")
    return speed

def benchmark_cpp():
    print("\n" + "="*30)
    print("C++ CHALLENGER")
    print("="*30)

    exe_path = os.path.join(CPP_DIR, 'build', 'Release', 'khmer_segmenter_cpp.exe')
    if not os.path.exists(exe_path):
        print(f"C++ build not found at {exe_path}!")
        print("Run 'cmake --build build --config Release' in khmer-cpp/")
        return 0

    cmd = [
        exe_path,
        "--dict", os.path.join(DATA_DIR, "khmer_dictionary_words.txt"),
        "--freq", os.path.join(DATA_DIR, "khmer_word_frequencies.json"),
        "--input", TEMP_INPUT,
        "--output", TEMP_OUTPUT_CPP,
        "--threads", "1"  # Single-threaded for fair comparison
    ]

    start_time = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    total_real_time = time.time() - start_time

    if result.returncode != 0:
        print("C++ failed:")
        print(result.stderr)
        return 0

    print(result.stdout)

    # Parse speed from stdout
    speed = 0.0
    for line in result.stdout.split('\n'):
        if "Speed:" in line:
            try:
                parts = line.split()
                speed = float(parts[1])
            except:
                pass

    print(f"Total System Time (Load+Proc): {total_real_time:.4f}s")
    return speed

def main():
    generate_workload()

    py_speed = benchmark_python()
    node_speed = benchmark_node()
    csharp_speed = benchmark_csharp()
    wasm_speed = benchmark_wasm()
    rust_speed = benchmark_rust()
    cpp_speed = benchmark_cpp()
    java_speed = benchmark_java()
    go_speed = benchmark_go()

    print("\n" + "#"*50)
    print("           BENCHMARK BATTLE RESULTS")
    print("#"*50)
    print(f"{'Language':<15} {'Speed (lines/sec)':>20}")
    print("-"*35)
    print(f"{'Python':<15} {py_speed:>20.2f}")
    print(f"{'Node.js':<15} {node_speed:>20.2f}")
    print(f"{'C# (.NET)':<15} {csharp_speed:>20.2f}")
    print(f"{'WASM (AS)':<15} {wasm_speed:>20.2f}")
    print(f"{'Rust':<15} {rust_speed:>20.2f}")
    print(f"{'C++':<15} {cpp_speed:>20.2f}")
    print(f"{'Java':<15} {java_speed:>20.2f}")
    print(f"{'Go':<15} {go_speed:>20.2f}")

    speeds = [
        ("Python", py_speed),
        ("Node.js", node_speed),
        ("C#", csharp_speed),
        ("Wasm", wasm_speed),
        ("Rust", rust_speed),
        ("C++", cpp_speed),
        ("Java", java_speed),
        ("Go", go_speed)
    ]

    # Filter out zeros and sort by speed descending
    speeds = [(name, speed) for name, speed in speeds if speed > 0]
    speeds.sort(key=lambda x: x[1], reverse=True)

    if speeds:
        winner_name, winner_speed = speeds[0]
        print(f"\n{'='*35}")
        print(f"WINNER: {winner_name} 🏆")
        print(f"{'='*35}")

        # Ratios against Python (Baseline)
        if py_speed > 0:
            print("\nSpeedup vs Python:")
            for name, speed in speeds:
                ratio = speed / py_speed
                print(f"  {name.ljust(10)}: {ratio:.2f}x")

    # Cleanup
    for f in [TEMP_INPUT, TEMP_OUTPUT_NODE, TEMP_OUTPUT_CSHARP,
              TEMP_OUTPUT_WASM, TEMP_OUTPUT_RUST, TEMP_OUTPUT_JAVA, TEMP_OUTPUT_GO, TEMP_OUTPUT_CPP]:
        if os.path.exists(f):
            os.remove(f)

if __name__ == "__main__":
    main()
