using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace KhmerSegmenter
{
    public class Dictionary
    {
        private readonly Trie _trie = new Trie();
        private readonly HashSet<string> _wordSet = new HashSet<string>();
        public int MaxWordLength { get; private set; }
        public float UnknownCost { get; private set; }
        private const float DEFAULT_FREQ = 5.0f;

        public Dictionary()
        {
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

                    // Filter logic
                    if (w.Contains("\u17D7")) continue; // Repetition sign
                    if (w.StartsWith("\u17D2")) continue; // Starts with Coeng

                    // "Compound OR" check
                    if (w.Contains("\u17D4") && w.Length > 1) continue;

                    words.Add(w);
                }
            }

            // 2. Load Frequencies
            var freqs = new Dictionary<string, double>();
            if (File.Exists(freqPath))
            {
                try
                {
                    var jsonString = File.ReadAllText(freqPath);
                    freqs = JsonSerializer.Deserialize<Dictionary<string, double>>(jsonString) ?? new Dictionary<string, double>();
                }
                catch (Exception e)
                {
                    Console.WriteLine($"Error loading frequencies: {e.Message}");
                }
            }

            // 3. Calculate Costs
            double totalCount = 0;
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

            if (totalCount <= 0) totalCount = 1;

            // Build trie and word set
            foreach (var w in words)
            {
                double count = freqs.ContainsKey(w) ? freqs[w] : DEFAULT_FREQ;
                float cost = (float)-Math.Log10(count / totalCount);

                _trie.Insert(w, cost);
                _wordSet.Add(w);
                MaxWordLength = Math.Max(MaxWordLength, w.Length);
            }

            // Calculate Unknown Cost
            UnknownCost = (float)-Math.Log10(1.0 / totalCount) + 5.0f;

            // 4. Generate Variants
            var variants = new List<(string word, float cost)>();

            foreach (var word in words)
            {
                float wordCost = 0;
                _trie.TryLookup(word.AsSpan(), out wordCost);

                // Swap Ta/Da subscripts
                if (word.Contains("\u17D2\u178F"))
                {
                    var v = word.Replace("\u17D2\u178F", "\u17D2\u178D");
                    if (!_wordSet.Contains(v))
                    {
                        variants.Add((v, wordCost));
                    }
                }
                else if (word.Contains("\u17D2\u178D"))
                {
                    var v = word.Replace("\u17D2\u178D", "\u17D2\u178F");
                    if (!_wordSet.Contains(v))
                    {
                        variants.Add((v, wordCost));
                    }
                }
            }

            foreach (var (v, cost) in variants)
            {
                if (!_wordSet.Contains(v))
                {
                    _trie.Insert(v, cost);
                    _wordSet.Add(v);
                    MaxWordLength = Math.Max(MaxWordLength, v.Length);
                }
            }
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public bool Contains(string word)
        {
            return _wordSet.Contains(word);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public bool Contains(ReadOnlySpan<char> word)
        {
            return _trie.Contains(word);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public bool ContainsRange(char[] chars, int start, int end)
        {
            return _trie.ContainsRange(chars, start, end);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public bool TryGetCost(char[] chars, int start, int end, out float cost)
        {
            return _trie.TryLookupRange(chars, start, end, out cost);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public float GetWordCost(string word)
        {
            if (_trie.TryLookup(word.AsSpan(), out float cost))
            {
                return cost;
            }
            return UnknownCost;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public float GetWordCost(ReadOnlySpan<char> word)
        {
            if (_trie.TryLookup(word, out float cost))
            {
                return cost;
            }
            return UnknownCost;
        }
    }
}
