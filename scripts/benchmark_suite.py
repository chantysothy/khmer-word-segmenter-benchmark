import sys
import os
import time
import timeit
import concurrent.futures
import argparse

# Force UTF-8 for output
sys.stdout.reconfigure(encoding='utf-8')

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from khmer_segmenter import KhmerSegmenter

try:
    from khmernltk import word_tokenize
    HAS_KHMERNLTK = True
except ImportError:
    print("Warning: khmernltk not installed. Benchmarking only against local segmenter.")
    HAS_KHMERNLTK = False
    def word_tokenize(text): return [] 

def run_concurrently(segment_func, text, iterations, workers):
    start_time = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(segment_func, text) for _ in range(iterations)]
        concurrent.futures.wait(futures)
    end_time = time.time()
    return end_time - start_time

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

def get_memory_mb():
    if HAS_PSUTIL:
        process = psutil.Process(os.getpid())
        return process.memory_info().rss / 1024 / 1024
    else:
        # Fallback (roughly just object size, not full RSS) or 0
        return 0.0

def benchmark_suite(corpus_file=None):
    # Setup
    print(f"Initial Memory: {get_memory_mb():.2f} MB")

    data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
    dict_path = os.path.join(data_dir, "khmer_dictionary_words.txt")
    freq_path = os.path.join(data_dir, "khmer_word_frequencies.json")

    print("Loading KhmerSegmenter...")
    start_load = time.time()
    mem_before_ours = get_memory_mb()
    seg = KhmerSegmenter(dict_path, freq_path)
    mem_after_ours = get_memory_mb()
    print(f"KhmerSegmenter Load Time: {time.time() - start_load:.4f}s")
    print(f"KhmerSegmenter Memory Added: {mem_after_ours - mem_before_ours:.2f} MB")

    if corpus_file:
        print(f"Reading corpus from {corpus_file}...")
        with open(corpus_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        # Combine into one big string for throughput test, or keep as lines?
        # Let's combine first 500 lines to avoid excessive waiting if file is huge
        text = "\n".join([line.strip() for line in lines[:500] if line.strip()])
        print(f"Loaded {len(lines)} lines. Using first 500 non-empty lines.")
    else:
        # New Sentence provided by user
        text = (
            "ក្រុមហ៊ុនទទួលបានប្រាក់ចំណូល ១ ០០០ ០០០ ដុល្លារក្នុងឆ្នាំនេះ ខណៈដែលតម្លៃភាគហ៊ុនកើនឡើង ៥% ស្មើនឹង 50.00$។ "
            "លោក ទេព សុវិចិត្រ នាយកប្រតិបត្តិដែលបញ្ចប់ការសិក្សាពីសាកលវិទ្យាល័យភូមិន្ទភ្នំពេញ (ស.ភ.ភ.ព.) "
            "បានថ្លែងថា ភាពជោគជ័យផ្នែកហិរញ្ញវត្ថុនាឆ្នាំនេះ គឺជាសក្ខីភាពនៃកិច្ចខិតខំប្រឹងប្រែងរបស់ក្រុមការងារទាំងមូល "
            "និងការជឿទុកចិត្តពីសំណាក់វិនិយោគិន។"
        )

    # Check khmernltk loading
    if HAS_KHMERNLTK:
        print("\nLoading khmernltk model...")
        mem_before_nltk = get_memory_mb()
        # Force load by tokenizing once
        word_tokenize("test") 
        mem_after_nltk = get_memory_mb()
        print(f"khmernltk Memory Added: {mem_after_nltk - mem_before_nltk:.2f} MB")

    print(f"\n--- Text to Segment (Length: {len(text)}) ---")
    if len(text) > 500:
        print(text[:500] + "...")
    else:
        print(text)
    print("-" * 60)

    # 1. Output Comparison
    print("\n--- 1. Segmentation Output ---")
    res_ours = seg.segment(text)
    preview_ours = ' | '.join(res_ours)
    if len(preview_ours) > 500:
        print(f"KhmerSegmenter:\n{preview_ours[:500]}...\n")
    else:
        print(f"KhmerSegmenter:\n{preview_ours}\n")

    if HAS_KHMERNLTK:
        res_nltk = word_tokenize(text)
        preview_nltk = ' | '.join(res_nltk)
        if len(preview_nltk) > 500:
            print(f"khmernltk:\n{preview_nltk[:500]}...\n")
        else:
            print(f"khmernltk:\n{preview_nltk}\n")
    
    # 2. Sequential Speed
    ITERATIONS_SEQ = 1000
    print(f"--- 2. Sequential Speed ({ITERATIONS_SEQ} iterations) ---")
    
    start_mem = get_memory_mb()
    t_ours = timeit.timeit(lambda: seg.segment(text), number=ITERATIONS_SEQ)
    end_mem = get_memory_mb()
    print(f"KhmerSegmenter: {t_ours/ITERATIONS_SEQ*1000:.3f}ms per call (Mem Delta: {end_mem-start_mem:.2f} MB)")
    
    if HAS_KHMERNLTK:
        start_mem = get_memory_mb()
        t_nltk = timeit.timeit(lambda: word_tokenize(text), number=ITERATIONS_SEQ)
        end_mem = get_memory_mb()
        print(f"khmernltk:      {t_nltk/ITERATIONS_SEQ*1000:.3f}ms per call (Mem Delta: {end_mem-start_mem:.2f} MB)")
        print(f"Speedup: {t_nltk/t_ours:.2f}x")

    # 3. Concurrent Speed
    WORKERS = 10
    ITERATIONS_CONC = 5000
    print(f"\n--- 3. Concurrent Speed ({WORKERS} workers, {ITERATIONS_CONC} total calls) ---")
    
    # Ours
    start_mem = get_memory_mb()
    time_ours_conc = run_concurrently(seg.segment, text, ITERATIONS_CONC, WORKERS)
    end_mem = get_memory_mb()
    tps_ours = ITERATIONS_CONC / time_ours_conc
    print(f"KhmerSegmenter: {tps_ours:.2f} calls/sec (Mem Delta during run: {end_mem-start_mem:.2f} MB)")
    
    # NLTK
    if HAS_KHMERNLTK:
        try:
            start_mem = get_memory_mb()
            time_nltk_conc = run_concurrently(word_tokenize, text, ITERATIONS_CONC, WORKERS)
            end_mem = get_memory_mb()
            tps_nltk = ITERATIONS_CONC / time_nltk_conc
            print(f"khmernltk:      {tps_nltk:.2f} calls/sec (Mem Delta during run: {end_mem-start_mem:.2f} MB)")
            print(f"Throughput Advantage: {tps_ours/tps_nltk:.2f}x")
        except Exception as e:
            print(f"khmernltk concurrent failed: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Benchmark Khmer Segmenter")
    parser.add_argument("--source", "-s", help="Optional corpus file to benchmark against (reads full file)")
    args = parser.parse_args()

    benchmark_suite(corpus_file=args.source)
