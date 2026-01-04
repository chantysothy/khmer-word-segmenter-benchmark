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

                    // Filter single-char words not in valid_single_words (matches Python)
                    if (w.Length == 1 && !Constants.IsValidSingleWord(w[0])) continue;

                    words.Add(w);
                }
            }

            // 2. Generate Variants first (before filtering - matches Python order)
            var allWords = new HashSet<string>(words);

            // First pass: Ta/Da swap + Coeng Ro ordering for original words
            foreach (var word in words)
            {
                GenerateVariants(word, allWords);
            }

            // Python also processes variants of variants (base_set = {word} | variants)
            // Do another pass on newly added words
            var newVariants = new HashSet<string>(allWords);
            newVariants.ExceptWith(words);
            foreach (var word in newVariants)
            {
                GenerateVariants(word, allWords);
            }

            // 3. Apply "ឬ" (OR) filter - remove compound words containing ឬ if parts are valid
            // This matches Python's viterbi.py lines 49-70
            var wordsToRemove = new HashSet<string>();
            const char OR_CHAR = '\u17AC'; // ឬ

            foreach (var word in allWords)
            {
                if (word.Contains(OR_CHAR) && word.Length > 1)
                {
                    // Case 1: Starts with ឬ (e.g. ឬហៅ)
                    if (word[0] == OR_CHAR)
                    {
                        var suffix = word.Substring(1);
                        if (allWords.Contains(suffix))
                        {
                            wordsToRemove.Add(word);
                        }
                    }
                    // Case 2: Ends with ឬ (e.g. មកឬ)
                    else if (word[word.Length - 1] == OR_CHAR)
                    {
                        var prefix = word.Substring(0, word.Length - 1);
                        if (allWords.Contains(prefix))
                        {
                            wordsToRemove.Add(word);
                        }
                    }
                    // Case 3: ឬ in the middle (e.g. មែនឬទេ)
                    else
                    {
                        var parts = word.Split(OR_CHAR);
                        if (parts.All(p => allWords.Contains(p) || p == ""))
                        {
                            wordsToRemove.Add(word);
                        }
                    }
                }
            }

            // Remove filtered words
            foreach (var w in wordsToRemove)
            {
                allWords.Remove(w);
            }

            // 4. Load Frequencies and generate variants with inherited frequencies
            // This matches Python's _load_frequencies which generates variants and gives them same count
            var rawFreqs = new Dictionary<string, double>();
            if (File.Exists(freqPath))
            {
                try
                {
                    var jsonString = File.ReadAllText(freqPath);
                    rawFreqs = JsonSerializer.Deserialize<Dictionary<string, double>>(jsonString) ?? new Dictionary<string, double>();
                }
                catch (Exception e)
                {
                    Console.WriteLine($"Error loading frequencies: {e.Message}");
                }
            }

            // Generate variants for frequency entries and inherit same frequency (matches Python)
            // IMPORTANT: Process ALL original entries first, THEN add variants
            // This ensures original frequency values take precedence over inherited variants
            var freqs = new Dictionary<string, double>();

            // First pass: Add all original entries from raw frequency file
            foreach (var kvp in rawFreqs)
            {
                double eff = Math.Max(kvp.Value, DEFAULT_FREQ);
                freqs[kvp.Key] = eff;
            }

            // Second pass: Generate variants and add those NOT already in freqs
            foreach (var kvp in rawFreqs)
            {
                double eff = Math.Max(kvp.Value, DEFAULT_FREQ);
                var variants = GenerateVariantsList(kvp.Key);
                foreach (var v in variants)
                {
                    if (!freqs.ContainsKey(v))
                    {
                        freqs[v] = eff;
                    }
                }
            }

            // 5. Calculate Costs - MUST match Python: only sum from frequency file entries
            // Python iterates over data.items() (frequency file), NOT dictionary words
            // Note: total_tokens is calculated from RAW frequency file, not expanded variants
            double totalCount = 0;
            foreach (var kvp in rawFreqs)
            {
                totalCount += Math.Max(kvp.Value, DEFAULT_FREQ);
            }

            if (totalCount <= 0) totalCount = 1;

            // Build trie and word set from filtered allWords
            foreach (var w in allWords)
            {
                // Apply min_freq_floor (matches Python: eff = max(count, min_freq_floor))
                double count = freqs.ContainsKey(w) ? Math.Max(freqs[w], DEFAULT_FREQ) : DEFAULT_FREQ;
                float cost = (float)-Math.Log10(count / totalCount);

                _trie.Insert(w, cost);
                _wordSet.Add(w);
                MaxWordLength = Math.Max(MaxWordLength, w.Length);
            }

            // Calculate Unknown Cost - Must match Python:
            // Python: unknown_cost = -log10(min_freq_floor / total_tokens) + 5.0
            // = -log10(DEFAULT_FREQ / totalCount) + 5.0
            UnknownCost = (float)-Math.Log10(DEFAULT_FREQ / totalCount) + 5.0f;
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

        /// <summary>
        /// Generate variants for a word (Ta/Da swap and Coeng Ro ordering).
        /// Matches Python's _generate_variants method in viterbi.py.
        /// </summary>
        private static void GenerateVariants(string word, HashSet<string> allWords)
        {
            foreach (var v in GenerateVariantsList(word))
            {
                allWords.Add(v);
            }
        }

        /// <summary>
        /// Generate variants for a word and return as a list.
        /// Used for frequency inheritance where we need to iterate over variants.
        /// </summary>
        private static List<string> GenerateVariantsList(string word)
        {
            var variants = new List<string>();

            const string COENG_TA = "\u17D2\u178F";
            const string COENG_DA = "\u17D2\u178D";
            const char COENG = '\u17D2';
            const char RO = '\u179A';

            // 1. Ta/Da swap
            if (word.Contains(COENG_TA))
            {
                variants.Add(word.Replace(COENG_TA, COENG_DA));
            }
            if (word.Contains(COENG_DA))
            {
                variants.Add(word.Replace(COENG_DA, COENG_TA));
            }

            // 2. Coeng Ro ordering swap
            for (int i = 0; i < word.Length - 3; i++)
            {
                if (word[i] == COENG)
                {
                    if (i + 3 < word.Length && word[i + 2] == COENG)
                    {
                        char first = word[i + 1];
                        char second = word[i + 3];

                        if (first == RO && second != RO)
                        {
                            var chars = word.ToCharArray();
                            chars[i + 1] = second;
                            chars[i + 3] = RO;
                            variants.Add(new string(chars));
                        }
                        else if (first != RO && second == RO)
                        {
                            var chars = word.ToCharArray();
                            chars[i + 1] = RO;
                            chars[i + 3] = first;
                            variants.Add(new string(chars));
                        }
                    }
                }
            }

            return variants;
        }
    }
}
