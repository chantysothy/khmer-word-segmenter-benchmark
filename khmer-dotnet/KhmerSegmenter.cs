using System;
using System.Collections.Generic;

namespace KhmerSegmenter
{
    public class KhmerSegmenter
    {
        private Dictionary dictionary;

        public KhmerSegmenter(Dictionary dictionary)
        {
            this.dictionary = dictionary;
        }

        public List<string> Segment(string text)
        {
            // 1. Strip ZWS
            string textRaw = text.Replace("\u200b", "");
            if (string.IsNullOrEmpty(textRaw)) return new List<string>();

            int n = textRaw.Length;

            // DP Arrays
            float[] dpCost = new float[n + 1];
            int[] dpParent = new int[n + 1];

            Array.Fill(dpCost, float.PositiveInfinity);
            Array.Fill(dpParent, -1);

            dpCost[0] = 0.0f;
            dpParent[0] = -1;

            for (int i = 0; i < n; i++)
            {
                if (float.IsInfinity(dpCost[i])) continue;

                float currentCost = dpCost[i];

                // --- Constraint Checks & Fallback (Repair Mode) ---
                bool forceRepair = false;

                // 1. Previous char was Coeng (\u17D2)
                if (i > 0 && textRaw[i - 1] == '\u17D2')
                {
                    forceRepair = true;
                }

                // 2. Current char is Dependent Vowel
                if (Constants.IsDependentVowel(textRaw[i]))
                {
                    forceRepair = true;
                }

                if (forceRepair)
                {
                    // Recovery Mode: Consume 1 char with high penalty
                    int nextIdx = i + 1;
                    float newCost = currentCost + dictionary.UnknownCost + 50.0f;
                    if (nextIdx <= n)
                    {
                        if (newCost < dpCost[nextIdx])
                        {
                            dpCost[nextIdx] = newCost;
                            dpParent[nextIdx] = i;
                        }
                    }
                    continue;
                }

                // --- Normal Processing ---

                // 1. Number / Digit Grouping (and Currency)
                char charI = textRaw[i];
                bool isDigitChar = Constants.IsDigit(charI);
                bool isCurrencyStart = false;

                if (Constants.IsCurrencySymbol(charI))
                {
                    if (i + 1 < n && Constants.IsDigit(textRaw[i + 1]))
                    {
                        isCurrencyStart = true;
                    }
                }

                if (isDigitChar || isCurrencyStart)
                {
                    int numLen = GetNumberLength(textRaw, i);
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
                if (IsAcronymStart(textRaw, i))
                {
                    int acrLen = GetAcronymLength(textRaw, i);
                    int nextIdx = i + acrLen;
                    float stepCost = 1.0f;
                    if (nextIdx <= n && currentCost + stepCost < dpCost[nextIdx])
                    {
                        dpCost[nextIdx] = currentCost + stepCost;
                        dpParent[nextIdx] = i;
                    }
                }

                // 4. Dictionary Match
                int endLimit = Math.Min(n, i + dictionary.MaxWordLength);
                for (int j = i + 1; j <= endLimit; j++)
                {
                    // Substring optimization:
                    // In C#, Substring allocates. For max speed, we might want Span lookup,
                    // but Dictionary<string> requires string.
                    // If .NET 9+, we could use AlternateLookup with ReadOnlySpan<char>.
                    // For now, let's stick to Substring for compatibility/port simplicity.
                    string word = textRaw.Substring(i, j - i);

                    if (dictionary.Contains(word))
                    {
                        float wordCost = dictionary.GetWordCost(word);
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
                    int clusterLen = GetKhmerClusterLength(textRaw, i);
                    float stepCost = dictionary.UnknownCost;

                    if (clusterLen == 1)
                    {
                        if (!Constants.IsValidSingleWord(charI))
                        {
                            stepCost += 10.0f;
                        }
                    }

                    int nextIdx = i + clusterLen;
                    if (nextIdx <= n)
                    {
                        if (currentCost + stepCost < dpCost[nextIdx])
                        {
                            dpCost[nextIdx] = currentCost + stepCost;
                            dpParent[nextIdx] = i;
                        }
                    }
                }
                else
                {
                    // Non-Khmer
                    int clusterLen = 1;
                    float stepCost = dictionary.UnknownCost;
                    int nextIdx = i + clusterLen;
                    if (nextIdx <= n)
                    {
                        if (currentCost + stepCost < dpCost[nextIdx])
                        {
                            dpCost[nextIdx] = currentCost + stepCost;
                            dpParent[nextIdx] = i;
                        }
                    }
                }
            }

            // Backtrack
            var segments = new List<string>();
            int curr = n;
            while (curr > 0)
            {
                int prev = dpParent[curr];
                if (prev == -1)
                {
                    Console.Error.WriteLine($"Error: Could not segment text. Stuck at index {curr}");
                    break;
                }
                segments.Add(textRaw.Substring(prev, curr - prev));
                curr = prev;
            }
            segments.Reverse();

            // Post Processing
            // Pass 1: Snap Invalid Single Consonants
            var pass1Segments = new List<string>();
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
                        string prevSeg = pass1Segments[pass1Segments.Count - 1];
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
                        string prevSeg = pass1Segments[pass1Segments.Count - 1];
                        char pChar = prevSeg.Length > 0 ? prevSeg[0] : ' ';
                        if (!Constants.IsSeparator(pChar))
                        {
                            pass1Segments[pass1Segments.Count - 1] = prevSeg + seg;
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

        // Helpers

        private int GetKhmerClusterLength(string text, int startIndex)
        {
            int n = text.Length;
            if (startIndex >= n) return 0;

            int i = startIndex;
            char c = text[i];

            // Check for Base Consonant or Independent Vowel
            if (!((c >= 0x1780 && c <= 0x17B3)))
            {
                return 1;
            }
            i++;

            while (i < n)
            {
                char current = text[i];

                if (Constants.IsCoeng(current))
                {
                    if (i + 1 < n)
                    {
                        char nextC = text[i + 1];
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

        private int GetNumberLength(string text, int startIndex)
        {
            int n = text.Length;
            int i = startIndex;

            if (!Constants.IsDigit(text[i])) return 0;
            i++;

            while (i < n)
            {
                char c = text[i];
                if (Constants.IsDigit(c))
                {
                    i++;
                    continue;
                }
                if (c == ',' || c == '.' || c == ' ')
                {
                    if (i + 1 < n && Constants.IsDigit(text[i + 1]))
                    {
                        i += 2;
                        continue;
                    }
                }
                break;
            }
            return i - startIndex;
        }

        private int GetAcronymLength(string text, int startIndex)
        {
            int n = text.Length;
            int i = startIndex;

            while (true)
            {
                int clusterLen = GetKhmerClusterLength(text, i);
                if (clusterLen > 0)
                {
                    int dotIndex = i + clusterLen;
                    if (dotIndex < n && text[dotIndex] == '.')
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

        private bool IsAcronymStart(string text, int index)
        {
            int n = text.Length;
            if (index + 1 >= n) return false;

            int clusterLen = GetKhmerClusterLength(text, index);
            if (clusterLen == 0) return false;

            int dotIndex = index + clusterLen;
            return dotIndex < n && text[dotIndex] == '.';
        }
    }
}
