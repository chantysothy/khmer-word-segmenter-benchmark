package khmer;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

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
            }
        }

        if (inputPath == null || outputPath == null) {
            System.err.println("Usage: java khmer.Main --input <file> --output <file> [options]");
            System.err.println("Options:");
            System.err.println("  --dict, -d <path>   Path to dictionary file");
            System.err.println("  --freq, -f <path>   Path to frequency file");
            System.err.println("  --limit, -l <n>     Limit number of lines to process");
            System.exit(1);
        }

        try {
            run(dictPath, freqPath, inputPath, outputPath, limit);
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    private static void run(String dictPath, String freqPath, String inputPath, String outputPath, Integer limit) throws IOException {
        System.out.println("Initializing Java Segmenter...");
        System.out.println("Dictionary: " + dictPath);
        System.out.println("Frequencies: " + freqPath);

        long startLoad = System.currentTimeMillis();

        Dictionary dictionary = new Dictionary();
        dictionary.load(dictPath, freqPath);
        KhmerSegmenter segmenter = new KhmerSegmenter(dictionary);

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

        System.out.println("Processing " + lines.size() + " lines...");

        long startProcess = System.currentTimeMillis();

        try (BufferedWriter writer = Files.newBufferedWriter(Path.of(outputPath), StandardCharsets.UTF_8)) {
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i).trim();
                List<String> segments = segmenter.segment(line);

                // Write as JSON manually
                writer.write("{\"id\":");
                writer.write(String.valueOf(i));
                writer.write(",\"input\":\"");
                writer.write(escapeJson(line));
                writer.write("\",\"segments\":[");

                for (int j = 0; j < segments.size(); j++) {
                    if (j > 0) writer.write(",");
                    writer.write("\"");
                    writer.write(escapeJson(segments.get(j)));
                    writer.write("\"");
                }

                writer.write("]}");
                writer.newLine();
            }
        }

        long endProcess = System.currentTimeMillis();
        double duration = (endProcess - startProcess) / 1000.0;

        System.out.println("Done. Saved to " + outputPath);
        System.out.printf("Time taken: %.2fs%n", duration);
        System.out.printf("Speed: %.2f lines/sec%n", lines.size() / duration);
    }

    private static String escapeJson(String s) {
        StringBuilder sb = new StringBuilder();
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
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.toString();
    }
}
