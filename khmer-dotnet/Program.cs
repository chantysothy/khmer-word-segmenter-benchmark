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
            // Quick test mode for dictionary check
            if (args.Length > 0 && args[0] == "--test-dict")
            {
                TestDictionaryWords(args.Skip(1).ToArray());
                return;
            }

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

        static void TestDictionaryWords(string[] testWords)
        {
            var baseDir = AppContext.BaseDirectory;
            var dictionary = new Dictionary();
            dictionary.Load(
                Path.Combine(baseDir, "../../../../data/khmer_dictionary_words.txt"),
                Path.Combine(baseDir, "../../../../data/khmer_word_frequencies.json")
            );

            // Test specific words that showed mismatches
            string[] wordsToCheck = { "សន្មត់", "អារម្មណ៏", "បុរេប្រវត្តិ", "បុរេប្រវត្តិសាស្រ្ត", "ឦឝានវម៌្ម" };

            Console.WriteLine("=== Dictionary Check ===");
            foreach (var word in wordsToCheck)
            {
                bool inDict = dictionary.Contains(word);
                float cost = dictionary.GetWordCost(word);
                Console.WriteLine($"'{word}': in_dict={inDict}, cost={cost}");
            }

            // Test segmentation
            Console.WriteLine("\n=== Segmentation Test ===");
            var segmenter = new KhmerSegmenter(dictionary);
            foreach (var word in wordsToCheck)
            {
                var segments = segmenter.Segment(word);
                Console.WriteLine($"'{word}': [{string.Join(", ", segments.ConvertAll(s => $"'{s}'"))}]");
            }

            // Debug cluster lengths
            Console.WriteLine("\n=== Cluster Length Debug ===");
            string testWord = "សន្មត់";
            Console.WriteLine($"Text: {testWord}");
            Console.Write("Chars: [");
            for (int i = 0; i < testWord.Length; i++)
            {
                if (i > 0) Console.Write(", ");
                Console.Write($"0x{(int)testWord[i]:x4}");
            }
            Console.WriteLine("]");

            // Check dictionary substrings
            Console.WriteLine("\n=== Dictionary Substring Check ===");
            for (int start = 0; start < testWord.Length; start++)
            {
                for (int end = start + 1; end <= testWord.Length; end++)
                {
                    string substr = testWord.Substring(start, end - start);
                    if (dictionary.Contains(substr))
                    {
                        float cost = dictionary.GetWordCost(substr);
                        Console.WriteLine($"Dict match: \"{substr}\" [{start}:{end}] cost={cost:F2}");
                    }
                }
            }

            // Check valid single words
            Console.WriteLine("\n=== Valid Single Words Check ===");
            char testChar = '\u179F'; // ស
            Console.WriteLine($"'ស' (0x179f) IsValidSingleWord: {Constants.IsValidSingleWord(testChar)}");
            Console.WriteLine($"'ស' in dictionary: {dictionary.Contains("ស")}");
            if (dictionary.Contains("ស"))
            {
                Console.WriteLine($"'ស' cost: {dictionary.GetWordCost("ស")}");
            }
            Console.WriteLine($"\nC# Unknown cost: {dictionary.UnknownCost}");

            // Check specific words for the mismatched case
            Console.WriteLine("\n=== Specific Word Check for បុរេប្រវត្តិសាស្រ្ត ===");
            string[] checkWords = { "បុរេ", "បុរេប្រវត្តិ", "ប្រវត្តិសាស្រ្ត", "សាស្រ្ត", "ប្រវត្តិសាស្ត្រ" };
            foreach (var w in checkWords)
            {
                bool inDict = dictionary.Contains(w);
                float cost = dictionary.GetWordCost(w);
                Console.WriteLine($"\"{w}\": in_dict={inDict}, cost={cost:F2}");
            }

            // Check mismatch words
            Console.WriteLine("\n=== Mismatch Word Check ===");
            string[] mismatchWords = { "រុក", "រានទន្រ្ទាន", "រុករាន", "ទន្រ្ទាន" };
            foreach (var w in mismatchWords)
            {
                bool inDict = dictionary.Contains(w);
                float cost = dictionary.GetWordCost(w);
                Console.WriteLine($"\"{w}\": in_dict={inDict}, cost={cost:F4}");
            }

            // Test segmentation
            Console.WriteLine("\n=== Mismatch Segmentation ===");
            string mismatchTest = "រុករានទន្រ្ទាន";
            var mismatchSegments = segmenter.Segment(mismatchTest);
            Console.WriteLine($"'{mismatchTest}': [{string.Join(", ", mismatchSegments.ConvertAll(s => $"'{s}'"))}]");
        }

        static int TestGetKhmerClusterLength(char[] chars, int startIndex, int n)
        {
            if (startIndex >= n) return 0;

            int i = startIndex;
            char c = chars[i];

            // Check for Base Consonant or Independent Vowel (0x1780-0x17B3)
            if (!((c >= 0x1780 && c <= 0x17B3)))
            {
                return 1;
            }
            i++;

            while (i < n)
            {
                char current = chars[i];

                // Check for Coeng (0x17D2)
                if (current == '\u17D2')
                {
                    if (i + 1 < n)
                    {
                        char nextC = chars[i + 1];
                        // IsConsonant: 0x1780-0x17A2
                        if (nextC >= 0x1780 && nextC <= 0x17A2)
                        {
                            i += 2;
                            continue;
                        }
                    }
                    break;
                }

                // IsDependentVowel: 0x17B6-0x17C5
                // IsSign: 0x17C6-0x17D1, 0x17D3, 0x17DD
                if ((current >= 0x17B6 && current <= 0x17D1) || current == 0x17D3 || current == 0x17DD)
                {
                    i++;
                    continue;
                }

                break;
            }

            return i - startIndex;
        }
    }

    /// <summary>
    /// High-performance JSON builder avoiding System.Text.Json overhead.
    /// 1BRC: Uses char buffer with Span for zero-allocation hot path.
    /// </summary>
    internal static class FastJson
    {
        [ThreadStatic]
        private static char[]? _buffer;

        private const int INITIAL_BUFFER_SIZE = 8192;

        [MethodImpl(MethodImplOptions.AggressiveInlining | MethodImplOptions.AggressiveOptimization)]
        public static string BuildRecord(int id, string input, List<string> segments)
        {
            // 1BRC: Use char buffer instead of StringBuilder
            var buffer = _buffer ??= new char[INITIAL_BUFFER_SIZE];
            int pos = 0;

            // Ensure buffer is large enough (worst case: all chars escaped as \uXXXX)
            int estimatedSize = 32 + input.Length * 6 + segments.Count * 10;
            foreach (var seg in segments)
            {
                estimatedSize += seg.Length * 6;
            }

            if (buffer.Length < estimatedSize)
            {
                buffer = _buffer = new char[estimatedSize * 2];
            }

            // Build: {"id":N,"input":"...","segments":["...", ...]}
            WriteString(buffer, ref pos, "{\"id\":");
            WriteInt(buffer, ref pos, id);
            WriteString(buffer, ref pos, ",\"input\":\"");
            EscapeString(buffer, ref pos, input);
            WriteString(buffer, ref pos, "\",\"segments\":[");

            for (int i = 0; i < segments.Count; i++)
            {
                if (i > 0)
                {
                    buffer[pos++] = ',';
                }
                buffer[pos++] = '"';
                EscapeString(buffer, ref pos, segments[i]);
                buffer[pos++] = '"';
            }

            WriteString(buffer, ref pos, "]}");

            return new string(buffer, 0, pos);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static void WriteString(char[] buffer, ref int pos, string s)
        {
            s.AsSpan().CopyTo(buffer.AsSpan(pos));
            pos += s.Length;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static void WriteInt(char[] buffer, ref int pos, int value)
        {
            if (value == 0)
            {
                buffer[pos++] = '0';
                return;
            }

            // Fast path for small numbers (most common case)
            if (value < 10)
            {
                buffer[pos++] = (char)('0' + value);
                return;
            }

            // Write digits in reverse, then reverse
            int start = pos;
            while (value > 0)
            {
                buffer[pos++] = (char)('0' + value % 10);
                value /= 10;
            }

            // Reverse the digits
            int end = pos - 1;
            while (start < end)
            {
                (buffer[start], buffer[end]) = (buffer[end], buffer[start]);
                start++;
                end--;
            }
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static void EscapeString(char[] buffer, ref int pos, string s)
        {
            foreach (char c in s)
            {
                switch (c)
                {
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
                        if (c < 32)
                        {
                            buffer[pos++] = '\\';
                            buffer[pos++] = 'u';
                            buffer[pos++] = '0';
                            buffer[pos++] = '0';
                            buffer[pos++] = GetHexChar((c >> 4) & 0xF);
                            buffer[pos++] = GetHexChar(c & 0xF);
                        }
                        else
                        {
                            buffer[pos++] = c;
                        }
                        break;
                }
            }
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static char GetHexChar(int value)
        {
            return (char)(value < 10 ? '0' + value : 'a' + value - 10);
        }
    }
}
