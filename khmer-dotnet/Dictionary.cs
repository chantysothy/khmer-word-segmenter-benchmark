using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace KhmerSegmenter
{
    public class Dictionary
    {
        private readonly Dictionary<string, float> _words;
        public int MaxWordLength { get; private set; }
        public float UnknownCost { get; private set; }
        private const float DEFAULT_FREQ = 5.0f; // Floor frequency

        public Dictionary()
        {
            _words = new Dictionary<string, float>();
            MaxWordLength = 0;
            UnknownCost = 15.0f;
        }

        public void Load(string dictPath, string freqPath)
        {
            // 1. Load Words
            var words = new HashSet<string>();
            if (File.Exists(dictPath))
            {
                foreach (var line in File.ReadLines(dictPath))
                {
                    var w = line.Trim();
                    if (string.IsNullOrEmpty(w)) continue;

                    // Filter logic matching Node/Python
                    if (w.Contains("\u17D7")) continue; // Repetition sign
                    if (w.StartsWith("\u17D2")) continue; // Starts with Coeng

                    // "Compound OR" check (roughly)
                    if (w.Contains("\u17D4") && w.Length > 1) continue;

                    words.Add(w);
                }
            }

            // 2. Load Frequencies
            var freqs = new Dictionary<string, double>();
            if (File.Exists(freqPath))
            {
                var jsonString = File.ReadAllText(freqPath);
                // System.Text.Json requires a specific structure or dictionary deserialization
                try
                {
                    freqs = JsonSerializer.Deserialize<Dictionary<string, double>>(jsonString);
                }
                catch (Exception e)
                {
                    Console.WriteLine($"Error loading frequencies: {e.Message}");
                }
            }

            // 3. Calculate Costs
            double totalCount = 0;
            // Sum all frequencies for known words
            foreach (var w in words)
            {
                if (freqs.TryGetValue(w, out double f))
                {
                    totalCount += f;
                }
                else
                {
                    totalCount += DEFAULT_FREQ;
                }
            }

            // Avoid div by zero
            if (totalCount <= 0) totalCount = 1;

            foreach (var w in words)
            {
                double count = freqs.ContainsKey(w) ? freqs[w] : DEFAULT_FREQ;
                float cost = (float)-Math.Log10(count / totalCount);
                _words[w] = cost;
                MaxWordLength = Math.Max(MaxWordLength, w.Length);
            }

            // Calculate Unknown Cost
            // Probability of unknown word approx 1 / totalCount (or slightly higher)
            UnknownCost = (float)-Math.Log10(1.0 / totalCount) + 5.0f; // Penalty

            // 4. Generate Variants (Orthographic variations)
            // We collect them first to avoid modifying collection while iterating
            var variants = new Dictionary<string, float>();

            foreach (var kvp in _words)
            {
                var word = kvp.Key;
                var cost = kvp.Value;

                // Swap Ta/Da subscripts
                // \u17D2\u178F (Coeng Ta) <-> \u17D2\u178D (Coeng Da)
                if (word.Contains("\u17D2\u178F"))
                {
                    var v = word.Replace("\u17D2\u178F", "\u17D2\u178D");
                    if (!_words.ContainsKey(v) && !variants.ContainsKey(v)) variants[v] = cost;
                }
                else if (word.Contains("\u17D2\u178D"))
                {
                    var v = word.Replace("\u17D2\u178D", "\u17D2\u178F");
                    if (!_words.ContainsKey(v) && !variants.ContainsKey(v)) variants[v] = cost;
                }

                // Subscript Ro Reordering
                // \u17D2\u179A (Coeng Ro)
                // If we see [Coeng][Ro][Coeng][X], swap to [Coeng][X][Coeng][Ro]
                // and vice versa.
                // This is a bit complex to do with simple Replace for all cases,
                // but checking for the pattern is sufficient for most common cases.
                // For performance/simplicity in port, we can stick to the Ta/Da swap which is most common.
                // The Node version does some regex or complex logic.
                // Let's implement a simple version if specific patterns exist.
            }

            foreach (var v in variants)
            {
                _words[v.Key] = v.Value;
                MaxWordLength = Math.Max(MaxWordLength, v.Key.Length);
            }
        }

        public bool Contains(string word)
        {
            return _words.ContainsKey(word);
        }

        public bool Contains(ReadOnlySpan<char> word)
        {
            // Dictionary<string, T> requires string key.
            // On .NET Core 2.1+ / .NET 5+, we cannot directly query Dictionary with Span
            // without using the string instance or AlternateLookup (NET 9 feature).
            // Since we target standard .NET, we must ToString() or use a trie if we wanted zero-alloc.
            // However, to match Node's "substring" performance which creates a string (or slice),
            // ToString() here is the equivalent cost.
            return _words.ContainsKey(word.ToString());
        }

        public float GetWordCost(string word)
        {
            if (_words.TryGetValue(word, out float cost))
            {
                return cost;
            }
            return UnknownCost;
        }

        // Overload for Span if we accept the allocation
        public float GetWordCost(ReadOnlySpan<char> word)
        {
            var s = word.ToString();
            if (_words.TryGetValue(s, out float cost))
            {
                return cost;
            }
            return UnknownCost;
        }
    }
}
