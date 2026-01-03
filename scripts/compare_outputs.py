import json
import sys

def compare_json(file1, file2):
    print(f"Comparing {file1} and {file2}...")
    try:
        with open(file1, 'r', encoding='utf-8') as f1:
            lines1 = [json.loads(line) for line in f1 if line.strip()]
        with open(file2, 'r', encoding='utf-8') as f2:
            lines2 = [json.loads(line) for line in f2 if line.strip()]
    except Exception as e:
        print(f"Error reading files: {e}")
        return

    if len(lines1) != len(lines2):
        print(f"Line count mismatch: {len(lines1)} vs {len(lines2)}")
        return

    mismatches = 0
    for i, (l1, l2) in enumerate(zip(lines1, lines2)):
        if l1 != l2:
            mismatches += 1
            if mismatches <= 5:
                print(f"Mismatch at line {i+1}:")
                print(f"  Py:  {l1}")
                print(f"  Cpp: {l2}")

    if mismatches == 0:
        print("SUCCESS: All lines match exactly.")
    else:
        print(f"FAILURE: Found {mismatches} mismatches out of {len(lines1)} lines.")

if __name__ == "__main__":
    if sys.stdout.encoding.lower() != 'utf-8':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    if len(sys.argv) < 3:
        print("Usage: python compare_json.py file1 file2")
        sys.exit(1)
    compare_json(sys.argv[1], sys.argv[2])
