using System;
using System.Buffers;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text;

namespace KhmerSegmenter
{
    class Program
    {
        class Args
        {
            public string DictPath { get; set; } = "";
            public string FreqPath { get; set; } = "";
            public string InputPath { get; set; } = "";
            public string OutputPath { get; set; } = "";
            public int? Limit { get; set; }
        }

        static void Main(string[] args)
        {
            var parsedArgs = ParseArgs(args);

            Console.WriteLine("Initializing .NET Segmenter...");
            Console.WriteLine($"Dictionary: {parsedArgs.DictPath}");
            Console.WriteLine($"Frequencies: {parsedArgs.FreqPath}");

            // 1. Load Dictionary
            var swLoad = Stopwatch.StartNew();
            var dictionary = new Dictionary();
            dictionary.Load(parsedArgs.DictPath, parsedArgs.FreqPath);
            swLoad.Stop();
            Console.WriteLine($"Model loaded in {swLoad.Elapsed.TotalSeconds:F2}s");

            Console.WriteLine($"Reading source: {parsedArgs.InputPath}");
            if (!File.Exists(parsedArgs.InputPath))
            {
                Console.Error.WriteLine($"Input file not found: {parsedArgs.InputPath}");
                Environment.Exit(1);
            }

            // Read all lines (matching Node/Rust behavior for fairness in benchmark)
            var linesToProcess = new List<string>();
            foreach (var line in File.ReadLines(parsedArgs.InputPath))
            {
                var trimmed = line.Trim();
                if (!string.IsNullOrEmpty(trimmed))
                {
                    linesToProcess.Add(trimmed);
                }
                if (parsedArgs.Limit.HasValue && linesToProcess.Count >= parsedArgs.Limit.Value)
                {
                    break;
                }
            }

            Console.WriteLine($"Processing {linesToProcess.Count} lines...");
            var segmenter = new KhmerSegmenter(dictionary);

            var swProcess = Stopwatch.StartNew();

            // Pre-allocate array for results to avoid I/O lock and ensure order
            string[] results = new string[linesToProcess.Count];

            // Parallel processing using available cores
            System.Threading.Tasks.Parallel.For(0, linesToProcess.Count, i =>
            {
                var line = linesToProcess[i];
                // Segmenter is thread-safe (stateless except for read-only dictionary)
                var segments = segmenter.Segment(line);

                // Use custom fast JSON builder instead of System.Text.Json
                results[i] = FastJson.BuildRecord(i, line, segments);
            });

            // Write results only if output is specified
            if (!string.IsNullOrEmpty(parsedArgs.OutputPath))
            {
                using var writer = new StreamWriter(parsedArgs.OutputPath, false, new UTF8Encoding(false), 65536);
                foreach (var json in results)
                {
                    writer.WriteLine(json);
                }
            }

            swProcess.Stop();
            var duration = swProcess.Elapsed.TotalSeconds;

            if (!string.IsNullOrEmpty(parsedArgs.OutputPath))
            {
                Console.WriteLine($"Done. Saved to {parsedArgs.OutputPath}");
            }
            Console.WriteLine($"Time taken: {duration:F2}s");
            Console.WriteLine($"Speed: {(linesToProcess.Count / duration):F2} lines/sec");
        }

        static Args ParseArgs(string[] args)
        {
            // Default paths relative to potential execution location or project root
            // Assuming execution from project root or similar depth
            var baseDir = AppContext.BaseDirectory;
            // We usually run from bin/Release/net10.0/
            // Data is in ../../../../data usually if running from bin
            // But benchmark script might pass absolute paths.

            var parsed = new Args
            {
                DictPath = Path.Combine(baseDir, "../../../../data/khmer_dictionary_words.txt"),
                FreqPath = Path.Combine(baseDir, "../../../../data/khmer_word_frequencies.json"),
                InputPath = "",
                OutputPath = "",
                Limit = null
            };

            for (int i = 0; i < args.Length; i++)
            {
                var arg = args[i];
                if ((arg == "--dict" || arg == "-d") && i + 1 < args.Length)
                {
                    parsed.DictPath = args[++i];
                }
                else if ((arg == "--freq" || arg == "-f") && i + 1 < args.Length)
                {
                    parsed.FreqPath = args[++i];
                }
                else if ((arg == "--input" || arg == "-i") && i + 1 < args.Length)
                {
                    parsed.InputPath = args[++i];
                }
                else if ((arg == "--output" || arg == "-o") && i + 1 < args.Length)
                {
                    parsed.OutputPath = args[++i];
                }
                else if ((arg == "--limit" || arg == "-l") && i + 1 < args.Length)
                {
                    if (int.TryParse(args[++i], out int val))
                    {
                        parsed.Limit = val;
                    }
                }
            }

            if (string.IsNullOrEmpty(parsed.InputPath))
            {
                Console.WriteLine("Usage: dotnet run -- --input <file> [--output <file>] [options]");
                Console.WriteLine("Options:");
                Console.WriteLine("  --dict, -d <path>   Path to dictionary file");
                Console.WriteLine("  --freq, -f <path>   Path to frequency file");
                Console.WriteLine("  --output, -o <path> Output file (optional, skip to benchmark only)");
                Console.WriteLine("  --limit, -l <n>     Limit number of lines");
                Environment.Exit(1);
            }

            return parsed;
        }
    }

    /// <summary>
    /// High-performance JSON builder avoiding System.Text.Json overhead.
    /// Inspired by 1 Billion Row Challenge optimizations.
    /// </summary>
    internal static class FastJson
    {
        [ThreadStatic]
        private static StringBuilder? _sb;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static string BuildRecord(int id, string input, List<string> segments)
        {
            var sb = _sb ??= new StringBuilder(512);
            sb.Clear();

            sb.Append("{\"id\":");
            sb.Append(id);
            sb.Append(",\"input\":\"");
            EscapeString(sb, input);
            sb.Append("\",\"segments\":[");

            for (int i = 0; i < segments.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append('"');
                EscapeString(sb, segments[i]);
                sb.Append('"');
            }

            sb.Append("]}");
            return sb.ToString();
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static void EscapeString(StringBuilder sb, string s)
        {
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"':
                        sb.Append("\\\"");
                        break;
                    case '\\':
                        sb.Append("\\\\");
                        break;
                    case '\n':
                        sb.Append("\\n");
                        break;
                    case '\r':
                        sb.Append("\\r");
                        break;
                    case '\t':
                        sb.Append("\\t");
                        break;
                    default:
                        if (c < 32)
                        {
                            sb.Append("\\u");
                            sb.Append(((int)c).ToString("x4"));
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }
        }
    }
}
