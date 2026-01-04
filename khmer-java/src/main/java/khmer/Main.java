package khmer;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;

/**
 * CLI entry point for Khmer Segmenter.
 * Usage: java -cp classes khmer.Main --input <file> --output <file>
 */
public class Main {

    public static void main(String[] args) {
        String dictPath = "../data/khmer_dictionary_words.txt";
        String freqPath = "../data/khmer_word_frequencies.json";
        String inputPath = null;
        String outputPath = null;
        Integer limit = null;
        int threads = 0; // 0 = use all available

        // Parse arguments
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--dict":
                case "-d":
                    dictPath = args[++i];
                    break;
                case "--freq":
                case "-f":
                    freqPath = args[++i];
                    break;
                case "--input":
                case "-i":
                    inputPath = args[++i];
                    break;
                case "--output":
                case "-o":
                    outputPath = args[++i];
                    break;
                case "--limit":
                case "-l":
                    limit = Integer.parseInt(args[++i]);
                    break;
                case "--threads":
                case "-t":
                    threads = Integer.parseInt(args[++i]);
                    break;
            }
        }

        if (inputPath == null) {
            System.err.println("Usage: java khmer.Main --input <file> [--output <file>] [options]");
            System.err.println("Options:");
            System.err.println("  --dict, -d <path>   Path to dictionary file");
            System.err.println("  --freq, -f <path>   Path to frequency file");
            System.err.println("  --output, -o <path> Output file (optional, skip to benchmark only)");
            System.err.println("  --limit, -l <n>     Limit number of lines to process");
            System.err.println("  --threads, -t <n>   Number of threads (0 = auto)");
            System.exit(1);
        }

        try {
            run(dictPath, freqPath, inputPath, outputPath, limit, threads);
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    private static void run(String dictPath, String freqPath, String inputPath, String outputPath, Integer limit, int threads) throws IOException {
        System.out.println("Initializing Java Segmenter...");
        System.out.println("Dictionary: " + dictPath);
        System.out.println("Frequencies: " + freqPath);

        long startLoad = System.currentTimeMillis();

        Dictionary dictionary = new Dictionary();
        dictionary.load(dictPath, freqPath);

        long loadTime = System.currentTimeMillis() - startLoad;
        System.out.printf("Model loaded in %.2fs%n", loadTime / 1000.0);

        System.out.println("Reading source: " + inputPath);

        // Read input lines
        List<String> lines;
        try (BufferedReader reader = Files.newBufferedReader(Path.of(inputPath), StandardCharsets.UTF_8)) {
            if (limit != null) {
                lines = reader.lines().filter(l -> !l.trim().isEmpty()).limit(limit).toList();
            } else {
                lines = reader.lines().filter(l -> !l.trim().isEmpty()).toList();
            }
        }

        int numLines = lines.size();
        int numThreads = threads > 0 ? threads : Runtime.getRuntime().availableProcessors();
        System.out.println("Processing " + numLines + " lines with " + numThreads + " threads...");

        // Pre-convert lines to trimmed strings for faster access
        String[] lineArray = new String[numLines];
        for (int i = 0; i < numLines; i++) {
            lineArray[i] = lines.get(i).trim();
        }

        // ThreadLocal segmenter ensures each thread has its own instance with pre-allocated buffers
        ThreadLocal<KhmerSegmenter> segmenterLocal = ThreadLocal.withInitial(() -> new KhmerSegmenter(dictionary));

        // JIT Warmup: process first 100 lines to warm up the JIT compiler
        int warmupSize = Math.min(100, numLines);
        for (int i = 0; i < warmupSize; i++) {
            KhmerSegmenter seg = segmenterLocal.get();
            seg.segment(lineArray[i]);
        }

        // Pre-allocate result array for parallel processing
        String[] results = new String[numLines];

        long startProcess = System.currentTimeMillis();

        // Use ForkJoinPool with controlled parallelism
        java.util.concurrent.ForkJoinPool pool = new java.util.concurrent.ForkJoinPool(numThreads);
        try {
            pool.submit(() ->
                IntStream.range(0, numLines)
                    .parallel()
                    .forEach(i -> {
                        KhmerSegmenter segmenter = segmenterLocal.get();
                        List<String> segments = segmenter.segment(lineArray[i]);
                        results[i] = toJson(i, lineArray[i], segments);
                    })
            ).get();
        } catch (Exception e) {
            throw new IOException("Parallel processing failed", e);
        } finally {
            pool.shutdown();
        }

        // Write results sequentially with buffered writer (only if output specified)
        if (outputPath != null) {
            try (BufferedWriter writer = new BufferedWriter(
                    new OutputStreamWriter(new FileOutputStream(outputPath), StandardCharsets.UTF_8), 65536)) {
                for (String json : results) {
                    writer.write(json);
                    writer.newLine();
                }
            }
        }

        long endProcess = System.currentTimeMillis();
        double duration = (endProcess - startProcess) / 1000.0;

        if (outputPath != null) {
            System.out.println("Done. Saved to " + outputPath);
        }
        System.out.printf("Time taken: %.2fs%n", duration);
        System.out.printf("Speed: %.2f lines/sec%n", numLines / duration);
    }

    // ============================================================================
    // 1BRC: High-performance JSON building with char[] buffer
    // ============================================================================

    // 1BRC: ThreadLocal char buffer instead of StringBuilder for faster hot path
    private static final ThreadLocal<char[]> JSON_BUFFER = ThreadLocal.withInitial(() -> new char[8192]);

    private static String toJson(int id, String input, List<String> segments) {
        char[] buffer = JSON_BUFFER.get();
        int pos = 0;

        // Estimate size needed (worst case: all chars escaped as unicode)
        int estimatedSize = 32 + input.length() * 6 + segments.size() * 10;
        for (int i = 0; i < segments.size(); i++) {
            estimatedSize += segments.get(i).length() * 6;
        }
        if (buffer.length < estimatedSize) {
            buffer = new char[estimatedSize * 2];
            JSON_BUFFER.set(buffer);
        }

        // Build: {"id":N,"input":"...","segments":["...", ...]}
        pos = writeString(buffer, pos, "{\"id\":");
        pos = writeInt(buffer, pos, id);
        pos = writeString(buffer, pos, ",\"input\":\"");
        pos = escapeJson(buffer, pos, input);
        pos = writeString(buffer, pos, "\",\"segments\":[");

        for (int j = 0; j < segments.size(); j++) {
            if (j > 0) buffer[pos++] = ',';
            buffer[pos++] = '"';
            pos = escapeJson(buffer, pos, segments.get(j));
            buffer[pos++] = '"';
        }

        pos = writeString(buffer, pos, "]}");
        return new String(buffer, 0, pos);
    }

    // 1BRC: Direct char copy, faster than StringBuilder.append
    private static int writeString(char[] buffer, int pos, String s) {
        s.getChars(0, s.length(), buffer, pos);
        return pos + s.length();
    }

    // 1BRC: Fast integer to char conversion
    private static int writeInt(char[] buffer, int pos, int value) {
        if (value == 0) {
            buffer[pos++] = '0';
            return pos;
        }
        if (value < 10) {
            buffer[pos++] = (char) ('0' + value);
            return pos;
        }
        // Write digits in reverse, then reverse
        int start = pos;
        while (value > 0) {
            buffer[pos++] = (char) ('0' + value % 10);
            value /= 10;
        }
        // Reverse the digits
        int end = pos - 1;
        while (start < end) {
            char temp = buffer[start];
            buffer[start] = buffer[end];
            buffer[end] = temp;
            start++;
            end--;
        }
        return pos;
    }

    // 1BRC: Escape JSON directly into char buffer
    private static int escapeJson(char[] buffer, int pos, String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':
                    buffer[pos++] = '\\';
                    buffer[pos++] = '"';
                    break;
                case '\\':
                    buffer[pos++] = '\\';
                    buffer[pos++] = '\\';
                    break;
                case '\n':
                    buffer[pos++] = '\\';
                    buffer[pos++] = 'n';
                    break;
                case '\r':
                    buffer[pos++] = '\\';
                    buffer[pos++] = 'r';
                    break;
                case '\t':
                    buffer[pos++] = '\\';
                    buffer[pos++] = 't';
                    break;
                default:
                    if (c < 32) {
                        buffer[pos++] = '\\';
                        buffer[pos++] = 'u';
                        buffer[pos++] = '0';
                        buffer[pos++] = '0';
                        buffer[pos++] = HEX_DIGITS[(c >> 4) & 0xF];
                        buffer[pos++] = HEX_DIGITS[c & 0xF];
                    } else {
                        buffer[pos++] = c;
                    }
            }
        }
        return pos;
    }

    // Pre-computed hex digits for fast formatting (avoids String.format overhead)
    private static final char[] HEX_DIGITS = "0123456789abcdef".toCharArray();
}
