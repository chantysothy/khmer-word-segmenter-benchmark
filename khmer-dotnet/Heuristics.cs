using System;
using System.Collections.Generic;
using System.Text;

namespace KhmerSegmenter
{
    public static class Heuristics
    {
        public static List<string> ApplyHeuristics(List<string> segments, Dictionary dictionary)
        {
            var merged = new List<string>();
            int n = segments.Count;
            int i = 0;

            while (i < n)
            {
                string curr = segments[i];

                // If known word, don't merge (unless heuristic matches?)
                // Rust logic checks dictionary.contains(curr) first.
                if (dictionary.Contains(curr))
                {
                    merged.Add(curr);
                    i++;
                    continue;
                }

                // Rule 1: Consonant + [់/ិ៍/៍/៌] -> Merge with PREVIOUS
                // 17CB (Bantoc), 17CE (Kakabat), 17CF (Ahsdja)
                // 17B7 + 17CD (I + Toe)
                if (merged.Count > 0)
                {
                    if (curr.Length == 2)
                    {
                        char c0 = curr[0];
                        char c1 = curr[1];
                        if (Constants.IsConsonant(c0) && (c1 == '\u17CB' || c1 == '\u17CE' || c1 == '\u17CF'))
                        {
                            string prev = merged[merged.Count - 1];
                            merged.RemoveAt(merged.Count - 1);
                            merged.Add(prev + curr);
                            i++;
                            continue;
                        }
                    }
                    if (curr.Length == 3)
                    {
                        char c0 = curr[0];
                        if (Constants.IsConsonant(c0) && curr[1] == '\u17B7' && curr[2] == '\u17CD')
                        {
                            string prev = merged[merged.Count - 1];
                            merged.RemoveAt(merged.Count - 1);
                            merged.Add(prev + curr);
                            i++;
                            continue;
                        }
                    }
                }

                // Rule 2: Consonant + ័ (\u17D0) -> Merge with NEXT
                if (i + 1 < n)
                {
                    if (curr.Length == 2)
                    {
                        char c0 = curr[0];
                        char c1 = curr[1];
                        if (Constants.IsConsonant(c0) && c1 == '\u17D0')
                        {
                            string nextSeg = segments[i + 1];
                            merged.Add(curr + nextSeg);
                            i += 2;
                            continue;
                        }
                    }
                }

                merged.Add(curr);
                i++;
            }

            return merged;
        }

        public static List<string> PostProcessUnknowns(List<string> segments, Dictionary dictionary)
        {
            var finalSegments = new List<string>();
            var unknownBuffer = new StringBuilder();

            foreach (var seg in segments)
            {
                bool isKnown = false;

                if (seg.Length > 0 && Constants.IsDigit(seg[0]))
                {
                    isKnown = true;
                }
                else if (dictionary.Contains(seg))
                {
                    isKnown = true;
                }
                else
                {
                    if (seg.Length == 1 && Constants.IsValidSingleWord(seg[0]))
                    {
                        isKnown = true;
                    }
                    else if (seg.Length == 1 && Constants.IsSeparator(seg[0]))
                    {
                        isKnown = true;
                    }
                    else if (seg.Contains(".") && seg.Length >= 2)
                    {
                        // Acronym check
                        isKnown = true;
                    }
                }

                if (isKnown)
                {
                    if (unknownBuffer.Length > 0)
                    {
                        finalSegments.Add(unknownBuffer.ToString());
                        unknownBuffer.Clear();
                    }
                    finalSegments.Add(seg);
                }
                else
                {
                    unknownBuffer.Append(seg);
                }
            }

            if (unknownBuffer.Length > 0)
            {
                finalSegments.Add(unknownBuffer.ToString());
            }

            return finalSegments;
        }
    }
}
