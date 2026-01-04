package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/khmer-segmenter/pkg/khmer"
)

// 1BRC optimization: Pre-allocated string builder pool for JSON output
var builderPool = sync.Pool{
	New: func() interface{} {
		return &strings.Builder{}
	},
}

// 1BRC optimization: Custom JSON builder - avoids reflection and allocation overhead of json.Marshal
// Format: {"id":N,"input":"...","segments":["...","..."]}
func buildJSON(sb *strings.Builder, id int, input string, segments []string) {
	sb.Reset()
	sb.Grow(len(input)*2 + len(segments)*10 + 50) // Pre-allocate estimated size

	sb.WriteString(`{"id":`)
	writeInt(sb, id)
	sb.WriteString(`,"input":"`)
	writeEscapedJSON(sb, input)
	sb.WriteString(`","segments":[`)

	for i, seg := range segments {
		if i > 0 {
			sb.WriteByte(',')
		}
		sb.WriteByte('"')
		writeEscapedJSON(sb, seg)
		sb.WriteByte('"')
	}
	sb.WriteString(`]}`)
}

// 1BRC optimization: Fast integer to string (avoids strconv allocation)
func writeInt(sb *strings.Builder, n int) {
	if n == 0 {
		sb.WriteByte('0')
		return
	}

	// Handle negative numbers
	if n < 0 {
		sb.WriteByte('-')
		n = -n
	}

	// Build digits in reverse
	var buf [20]byte
	pos := len(buf)
	for n > 0 {
		pos--
		buf[pos] = byte('0' + n%10)
		n /= 10
	}
	sb.Write(buf[pos:])
}

// 1BRC optimization: Write JSON-escaped string (handles control chars and quotes)
func writeEscapedJSON(sb *strings.Builder, s string) {
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '"':
			sb.WriteString(`\"`)
		case '\\':
			sb.WriteString(`\\`)
		case '\n':
			sb.WriteString(`\n`)
		case '\r':
			sb.WriteString(`\r`)
		case '\t':
			sb.WriteString(`\t`)
		default:
			if c < 0x20 {
				// Other control characters - use unicode escape
				sb.WriteString(`\u00`)
				sb.WriteByte("0123456789abcdef"[c>>4])
				sb.WriteByte("0123456789abcdef"[c&0xf])
			} else {
				sb.WriteByte(c)
			}
		}
	}
}

func main() {
	// Parse command-line arguments
	dictPath := flag.String("dict", "../data/khmer_dictionary_words.txt", "Path to dictionary file")
	freqPath := flag.String("freq", "../data/khmer_word_frequencies.json", "Path to frequency file")
	inputPath := flag.String("input", "", "Input text file (required)")
	outputPath := flag.String("output", "", "Output JSON file (required)")
	limit := flag.Int("limit", 0, "Limit number of lines (0 = unlimited)")
	threads := flag.Int("threads", 0, "Number of worker threads (0 = use all CPUs)")

	// Short aliases
	flag.StringVar(dictPath, "d", *dictPath, "Path to dictionary file (short)")
	flag.StringVar(freqPath, "f", *freqPath, "Path to frequency file (short)")
	flag.StringVar(inputPath, "i", "", "Input text file (short)")
	flag.StringVar(outputPath, "o", "", "Output JSON file (short)")
	flag.IntVar(limit, "l", 0, "Limit number of lines (short)")
	flag.IntVar(threads, "t", 0, "Number of worker threads (short)")

	flag.Parse()

	if *inputPath == "" {
		fmt.Fprintln(os.Stderr, "Usage: khmer --input <file> [--output <file>] [options]")
		fmt.Fprintln(os.Stderr, "Options:")
		fmt.Fprintln(os.Stderr, "  --dict, -d <path>   Path to dictionary file")
		fmt.Fprintln(os.Stderr, "  --freq, -f <path>   Path to frequency file")
		fmt.Fprintln(os.Stderr, "  --output, -o <path> Output file (optional, skip to benchmark only)")
		fmt.Fprintln(os.Stderr, "  --limit, -l <n>     Limit number of lines")
		fmt.Fprintln(os.Stderr, "  --threads, -t <n>   Number of worker threads")
		os.Exit(1)
	}

	if err := run(*dictPath, *freqPath, *inputPath, *outputPath, *limit, *threads); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func run(dictPath, freqPath, inputPath, outputPath string, limit, threads int) error {
	fmt.Println("Initializing Go Segmenter...")
	fmt.Printf("Dictionary: %s\n", dictPath)
	fmt.Printf("Frequencies: %s\n", freqPath)

	startLoad := time.Now()

	dictionary := khmer.NewDictionary()
	if err := dictionary.Load(dictPath, freqPath); err != nil {
		return err
	}

	loadTime := time.Since(startLoad).Seconds()
	fmt.Printf("Model loaded in %.2fs\n", loadTime)

	fmt.Printf("Reading source: %s\n", inputPath)

	// Read input file
	inputFile, err := os.Open(inputPath)
	if err != nil {
		return fmt.Errorf("input file not found: %w", err)
	}
	defer inputFile.Close()

	var lines []string
	scanner := bufio.NewScanner(inputFile)
	// Increase buffer size for long lines
	const maxCapacity = 1024 * 1024 // 1MB
	buf := make([]byte, maxCapacity)
	scanner.Buffer(buf, maxCapacity)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			lines = append(lines, line)
		}
		if limit > 0 && len(lines) >= limit {
			break
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}

	numLines := len(lines)
	fmt.Printf("Processing %d lines...\n", numLines)

	// Determine number of workers
	numWorkers := threads
	if numWorkers <= 0 {
		numWorkers = runtime.NumCPU()
	}
	fmt.Printf("Using %d worker goroutines\n", numWorkers)

	startProcess := time.Now()

	// Pre-allocate results array
	results := make([]string, numLines)

	// Create worker pool
	var wg sync.WaitGroup
	jobs := make(chan int, numLines)

	// Start workers - each worker gets its own segmenter (with pre-allocated buffers)
	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// Each goroutine has its own segmenter instance (thread-local buffers)
			segmenter := khmer.NewKhmerSegmenter(dictionary)
			// 1BRC optimization: Reuse string builder from pool
			sb := builderPool.Get().(*strings.Builder)
			defer builderPool.Put(sb)

			for i := range jobs {
				line := lines[i]
				segments := segmenter.Segment(line)

				// 1BRC optimization: Custom JSON builder (no reflection, minimal allocation)
				buildJSON(sb, i, line, segments)
				results[i] = sb.String()
			}
		}()
	}

	// Send jobs
	for i := 0; i < numLines; i++ {
		jobs <- i
	}
	close(jobs)

	// Wait for all workers to complete
	wg.Wait()

	// Write results sequentially (only if output specified)
	if outputPath != "" {
		outputFile, err := os.Create(outputPath)
		if err != nil {
			return fmt.Errorf("could not create output file: %w", err)
		}
		defer outputFile.Close()

		// 1BRC optimization: Use larger buffer for output (256KB vs default 4KB)
		writer := bufio.NewWriterSize(outputFile, 256*1024)
		for _, jsonStr := range results {
			writer.WriteString(jsonStr)
			writer.WriteByte('\n')
		}
		writer.Flush()
	}

	duration := time.Since(startProcess).Seconds()

	if outputPath != "" {
		fmt.Printf("Done. Saved to %s\n", outputPath)
	}
	fmt.Printf("Time taken: %.2fs\n", duration)
	fmt.Printf("Speed: %.2f lines/sec\n", float64(numLines)/duration)

	return nil
}
