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
    // High-performance JSON building inspired by 1BRC optimizations
    // ============================================================================

    // ThreadLocal StringBuilder to avoid allocation overhead in hot path
    private static final ThreadLocal<StringBuilder> JSON_BUFFER = ThreadLocal.withInitial(() -> new StringBuilder(512));

    private static String toJson(int id, String input, List<String> segments) {
        StringBuilder sb = JSON_BUFFER.get();
        sb.setLength(0); // Clear without reallocating

        sb.append("{\"id\":").append(id);
        sb.append(",\"input\":\"");
        escapeJsonTo(sb, input);
        sb.append("\",\"segments\":[");
        for (int j = 0; j < segments.size(); j++) {
            if (j > 0) sb.append(',');
            sb.append('"');
            escapeJsonTo(sb, segments.get(j));
            sb.append('"');
        }
        sb.append("]}");
        return sb.toString();
    }

    // Escape JSON directly into StringBuilder - no intermediate String allocation
    private static void escapeJsonTo(StringBuilder sb, String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 32) {
                        sb.append("\\u");
                        sb.append(HEX_DIGITS[(c >> 12) & 0xF]);
                        sb.append(HEX_DIGITS[(c >> 8) & 0xF]);
                        sb.append(HEX_DIGITS[(c >> 4) & 0xF]);
                        sb.append(HEX_DIGITS[c & 0xF]);
                    } else {
                        sb.append(c);
                    }
            }
        }
    }

    // Pre-computed hex digits for fast formatting (avoids String.format overhead)
    private static final char[] HEX_DIGITS = "0123456789abcdef".toCharArray();
}
