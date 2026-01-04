using System;
using System.Buffers;
using System.Collections.Generic;
using System.Runtime.CompilerServices;

// 1BRC: Skip zero-initialization for performance-critical methods
[module: SkipLocalsInit]

namespace KhmerSegmenter
{
    public class KhmerSegmenter
    {
        private Dictionary dictionary;

        // Thread-local buffers to avoid allocation in hot path
        [ThreadStatic]
        private static float[]? s_dpCost;
        [ThreadStatic]
        private static int[]? s_dpParent;
        [ThreadStatic]
        private static List<string>? s_segments;
        [ThreadStatic]
        private static List<string>? s_pass1Segments;

        public KhmerSegmenter(Dictionary dictionary)
        {
            this.dictionary = dictionary;
        }

        [MethodImpl(MethodImplOptions.AggressiveOptimization)]
        public List<string> Segment(string text)
        {
            // 1. Strip ZWS - use Span to avoid allocation when no ZWS present
            ReadOnlySpan<char> textSpan = text.AsSpan();
            if (text.Contains('\u200b'))
            {
                text = text.Replace("\u200b", "");
                textSpan = text.AsSpan();
            }

            if (textSpan.IsEmpty) return new List<string>();

            int n = textSpan.Length;

            // 1BRC: Use thread-local buffers
            float[] dpCost = GetOrCreateBuffer(ref s_dpCost, n + 1);
            int[] dpParent = GetOrCreateBuffer(ref s_dpParent, n + 1);

            // Reset buffers - use Span for fast fill
            dpCost.AsSpan(0, n + 1).Fill(float.PositiveInfinity);
            dpParent.AsSpan(0, n + 1).Fill(-1);

            dpCost[0] = 0.0f;

            // Cache frequently used values
            float unknownCost = dictionary.UnknownCost;
            int maxWordLen = dictionary.MaxWordLength;

            for (int i = 0; i < n; i++)
            {
                if (float.IsInfinity(dpCost[i])) continue;

                float currentCost = dpCost[i];
                char charI = textSpan[i];

                // --- Constraint Checks & Fallback (Repair Mode) ---
                bool forceRepair = false;

                // 1. Previous char was Coeng (\u17D2)
                if (i > 0 && textSpan[i - 1] == '\u17D2')
                {
                    forceRepair = true;
                }

                // 2. Current char is Dependent Vowel
                if (Constants.IsDependentVowel(charI))
                {
                    forceRepair = true;
                }

                if (forceRepair)
                {
                    // Recovery Mode: Consume 1 char with high penalty
                    int nextIdx = i + 1;
                    float newCost = currentCost + unknownCost + 50.0f;
                    if (nextIdx <= n && newCost < dpCost[nextIdx])
                    {
                        dpCost[nextIdx] = newCost;
                        dpParent[nextIdx] = i;
                    }
                    continue;
                }

                // --- Normal Processing ---

                // 1. Number / Digit Grouping (and Currency)
                bool isDigitChar = Constants.IsDigit(charI);
                bool isCurrencyStart = false;

                if (Constants.IsCurrencySymbol(charI))
                {
                    if (i + 1 < n && Constants.IsDigit(textSpan[i + 1]))
                    {
                        isCurrencyStart = true;
                    }
                }

                if (isDigitChar || isCurrencyStart)
                {
                    int numLen = GetNumberLength(textSpan, i);
                    int nextIdx = i + numLen;
                    float stepCost = 1.0f;
                    if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx])
                    {
                        dpCost[nextIdx] = currentCost + stepCost;
                        dpParent[nextIdx] = i;
                    }
                }
                // 2. Separators
                else if (Constants.IsSeparator(charI))
                {
                    int nextIdx = i + 1;
                    float stepCost = 0.1f;
                    if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx])
                    {
                        dpCost[nextIdx] = currentCost + stepCost;
                        dpParent[nextIdx] = i;
                    }
                }

                // 3. Acronyms
                if (IsAcronymStart(textSpan, i))
                {
                    int acrLen = GetAcronymLength(textSpan, i);
                    int nextIdx = i + acrLen;
                    float stepCost = 1.0f;
                    if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx])
                    {
                        dpCost[nextIdx] = currentCost + stepCost;
                        dpParent[nextIdx] = i;
                    }
                }

                // 4. Dictionary Match - Use trie for zero-allocation lookup
                int endLimit = Math.Min(n, i + maxWordLen);
                for (int j = i + 1; j <= endLimit; j++)
                {
                    // Zero-allocation trie lookup using Span
                    if (dictionary.TryGetCost(textSpan, i, j, out float wordCost))
                    {
                        float newCost = currentCost + wordCost;
                        if (newCost < dpCost[j])
                        {
                            dpCost[j] = newCost;
                            dpParent[j] = i;
                        }
                    }
                }

                // 5. Unknown Cluster Fallback
                if (Constants.IsKhmerChar(charI))
                {
                    int clusterLen = GetKhmerClusterLength(textSpan, i);
                    float stepCost = unknownCost;

                    if (clusterLen == 1 && !Constants.IsValidSingleWord(charI))
                    {
                        stepCost += 10.0f;
                    }

                    int nextIdx = i + clusterLen;
                    if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx])
                    {
                        dpCost[nextIdx] = currentCost + stepCost;
                        dpParent[nextIdx] = i;
                    }
                }
                else
                {
                    // Non-Khmer
                    float stepCost = unknownCost;
                    int nextIdx = i + 1;
                    if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx])
                    {
                        dpCost[nextIdx] = currentCost + stepCost;
                        dpParent[nextIdx] = i;
                    }
                }
            }

            // Backtrack - reuse thread-local list
            var segments = s_segments ??= new List<string>(64);
            segments.Clear();

            int curr = n;
            while (curr > 0)
            {
                int prev = dpParent[curr];
                if (prev == -1)
                {
                    Console.Error.WriteLine($"Error: Could not segment text. Stuck at index {curr}");
                    break;
                }
                segments.Add(textSpan.Slice(prev, curr - prev).ToString());
                curr = prev;
            }
            segments.Reverse();

            // Post Processing - reuse thread-local list
            var pass1Segments = s_pass1Segments ??= new List<string>(64);
            pass1Segments.Clear();

            // Pass 1: Snap Invalid Single Consonants
            for (int j = 0; j < segments.Count; j++)
            {
                string seg = segments[j];
                int segLen = seg.Length;
                char firstChar = seg[0];

                bool isInvalidSingle = segLen == 1
                    && !Constants.IsValidSingleWord(firstChar)
                    && !dictionary.Contains(seg)
                    && !Constants.IsDigit(firstChar)
                    && !Constants.IsSeparator(firstChar);

                if (isInvalidSingle)
                {
                    bool prevIsSep = false;
                    if (pass1Segments.Count > 0)
                    {
                        string prevSeg = pass1Segments[^1];
                        char pChar = prevSeg.Length > 0 ? prevSeg[0] : ' ';
                        if (Constants.IsSeparator(pChar) || prevSeg == " " || prevSeg == "\u200b")
                        {
                            prevIsSep = true;
                        }
                    }
                    else if (j == 0)
                    {
                        prevIsSep = true;
                    }

                    bool nextIsSep = false;
                    if (j + 1 < segments.Count)
                    {
                        string nextSeg = segments[j + 1];
                        char nChar = nextSeg.Length > 0 ? nextSeg[0] : ' ';
                        if (Constants.IsSeparator(nChar) || nextSeg == " " || nextSeg == "\u200b")
                        {
                            nextIsSep = true;
                        }
                    }
                    else
                    {
                        nextIsSep = true;
                    }

                    if (prevIsSep && nextIsSep)
                    {
                        pass1Segments.Add(seg);
                        continue;
                    }

                    if (pass1Segments.Count > 0)
                    {
                        string prevSeg = pass1Segments[^1];
                        char pChar = prevSeg.Length > 0 ? prevSeg[0] : ' ';
                        if (!Constants.IsSeparator(pChar))
                        {
                            pass1Segments[^1] = prevSeg + seg;
                        }
                        else
                        {
                            pass1Segments.Add(seg);
                        }
                    }
                    else
                    {
                        pass1Segments.Add(seg);
                    }
                }
                else
                {
                    pass1Segments.Add(seg);
                }
            }

            var pass2Segments = Heuristics.ApplyHeuristics(pass1Segments, dictionary);
            return Heuristics.PostProcessUnknowns(pass2Segments, dictionary);
        }

        // Helpers using ReadOnlySpan<char>

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static T[] GetOrCreateBuffer<T>(ref T[]? buffer, int minSize)
        {
            if (buffer == null || buffer.Length < minSize)
            {
                buffer = new T[Math.Max(minSize, 4096)];
            }
            return buffer;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static int GetKhmerClusterLength(ReadOnlySpan<char> chars, int startIndex)
        {
            int n = chars.Length;
            if (startIndex >= n) return 0;

            int i = startIndex;
            char c = chars[i];

            // Check for Base Consonant or Independent Vowel
            if (!((c >= (char)0x1780 && c <= (char)0x17B3)))
            {
                return 1;
            }
            i++;

            while (i < n)
            {
                char current = chars[i];

                if (Constants.IsCoeng(current))
                {
                    if (i + 1 < n)
                    {
                        char nextC = chars[i + 1];
                        if (Constants.IsConsonant(nextC))
                        {
                            i += 2;
                            continue;
                        }
                    }
                    break;
                }

                if (Constants.IsDependentVowel(current) || Constants.IsSign(current))
                {
                    i++;
                    continue;
                }

                break;
            }

            return i - startIndex;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static int GetNumberLength(ReadOnlySpan<char> chars, int startIndex)
        {
            int n = chars.Length;
            int i = startIndex;

            if (!Constants.IsDigit(chars[i])) return 0;
            i++;

            while (i < n)
            {
                char c = chars[i];
                if (Constants.IsDigit(c))
                {
                    i++;
                    continue;
                }
                if (c == ',' || c == '.' || c == ' ')
                {
                    if (i + 1 < n && Constants.IsDigit(chars[i + 1]))
                    {
                        i += 2;
                        continue;
                    }
                }
                break;
            }
            return i - startIndex;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static int GetAcronymLength(ReadOnlySpan<char> chars, int startIndex)
        {
            int n = chars.Length;
            int i = startIndex;

            while (true)
            {
                int clusterLen = GetKhmerClusterLength(chars, i);
                if (clusterLen > 0)
                {
                    int dotIndex = i + clusterLen;
                    if (dotIndex < n && chars[dotIndex] == '.')
                    {
                        i = dotIndex + 1;
                        if (i >= n) break;
                        continue;
                    }
                }
                break;
            }
            return i - startIndex;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static bool IsAcronymStart(ReadOnlySpan<char> chars, int index)
        {
            int n = chars.Length;
            if (index + 1 >= n) return false;

            int clusterLen = GetKhmerClusterLength(chars, index);
            if (clusterLen == 0) return false;

            int dotIndex = index + clusterLen;
            return dotIndex < n && chars[dotIndex] == '.';
        }
    }
}
