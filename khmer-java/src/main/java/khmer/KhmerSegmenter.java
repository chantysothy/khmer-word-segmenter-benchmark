package khmer;

import java.util.ArrayList;
import java.util.List;

/**
 * Khmer word segmenter using Viterbi algorithm.
 * Optimized version with codepoint-based processing and trie lookups.
 */
public class KhmerSegmenter {

    private final Dictionary dictionary;

    // Pre-allocated DP buffers (not thread-safe, but faster for single-threaded use)
    private float[] dpCost;
    private int[] dpParent;

    public KhmerSegmenter(Dictionary dictionary) {
        this.dictionary = dictionary;
        // Pre-allocate reasonable buffer sizes
        this.dpCost = new float[1024];
        this.dpParent = new int[1024];
    }

    /**
     * Segment Khmer text into words using the Viterbi algorithm.
     */
    public List<String> segment(String text) {
        // 1. Strip Zero-Width Spaces
        String textRaw = text.replace("\u200b", "");
        if (textRaw.isEmpty()) {
            return new ArrayList<>();
        }

        // Convert to codepoints for proper Unicode handling
        int[] cps = textRaw.codePoints().toArray();
        int n = cps.length;

        // Ensure buffers are large enough
        if (dpCost.length < n + 1) {
            dpCost = new float[n + 1];
            dpParent = new int[n + 1];
        }

        // Reset DP arrays
        for (int i = 0; i <= n; i++) {
            dpCost[i] = Float.POSITIVE_INFINITY;
            dpParent[i] = -1;
        }
        dpCost[0] = 0.0f;

        // Cache frequently accessed values
        int maxWordLen = dictionary.maxWordLength;
        float unknownCost = dictionary.unknownCost;

        for (int i = 0; i < n; i++) {
            if (Float.isInfinite(dpCost[i])) continue;

            float currentCost = dpCost[i];
            int charI = cps[i];

            // --- Constraint Checks & Fallback (Repair Mode) ---
            boolean forceRepair = false;

            // 1. Previous char was Coeng (U+17D2)
            if (i > 0 && cps[i - 1] == 0x17D2) {
                forceRepair = true;
            }

            // 2. Current char is Dependent Vowel
            if (Constants.isDependentVowel(charI)) {
                forceRepair = true;
            }

            if (forceRepair) {
                // Recovery Mode: Consume 1 char with high penalty
                int nextIdx = i + 1;
                float newCost = currentCost + unknownCost + 50.0f;
                if (nextIdx <= n && newCost < dpCost[nextIdx]) {
                    dpCost[nextIdx] = newCost;
                    dpParent[nextIdx] = i;
                }
                continue;
            }

            // --- Normal Processing ---

            // 1. Number / Digit Grouping (and Currency)
            boolean isDigitChar = Constants.isDigit(charI);
            boolean isCurrencyStart = false;
            if (Constants.isCurrencySymbol(charI)) {
                if (i + 1 < n && Constants.isDigit(cps[i + 1])) {
                    isCurrencyStart = true;
                }
            }

            if (isDigitChar || isCurrencyStart) {
                int numLen = getNumberLength(cps, i, n);
                int nextIdx = i + numLen;
                float stepCost = 1.0f;
                float newCost = currentCost + stepCost;
                if (nextIdx <= n && newCost < dpCost[nextIdx]) {
                    dpCost[nextIdx] = newCost;
                    dpParent[nextIdx] = i;
                }
            }
            // 2. Separators
            else if (Constants.isSeparator(charI)) {
                int nextIdx = i + 1;
                float stepCost = 0.1f;
                float newCost = currentCost + stepCost;
                if (nextIdx <= n && newCost < dpCost[nextIdx]) {
                    dpCost[nextIdx] = newCost;
                    dpParent[nextIdx] = i;
                }
            }

            // 3. Acronyms
            if (isAcronymStart(cps, i, n)) {
                int acrLen = getAcronymLength(cps, i, n);
                int nextIdx = i + acrLen;
                float stepCost = 1.0f;
                float newCost = currentCost + stepCost;
                if (nextIdx <= n && newCost < dpCost[nextIdx]) {
                    dpCost[nextIdx] = newCost;
                    dpParent[nextIdx] = i;
                }
            }

            // 4. Dictionary Match - OPTIMIZED: use trie lookup on codepoints
            int endLimit = Math.min(n, i + maxWordLen);
            for (int j = i + 1; j <= endLimit; j++) {
                Float wordCost = dictionary.lookupCodepoints(cps, i, j);
                if (wordCost != null) {
                    float newCost = currentCost + wordCost;
                    if (newCost < dpCost[j]) {
                        dpCost[j] = newCost;
                        dpParent[j] = i;
                    }
                }
            }

            // 5. Unknown Cluster Fallback
            if (Constants.isKhmerChar(charI)) {
                int clusterLen = getKhmerClusterLength(cps, i, n);
                float stepCost = unknownCost;

                if (clusterLen == 1 && !Constants.isValidSingleWord(charI)) {
                    stepCost += 10.0f;
                }

                int nextIdx = i + clusterLen;
                float newCost = currentCost + stepCost;
                if (nextIdx <= n && newCost < dpCost[nextIdx]) {
                    dpCost[nextIdx] = newCost;
                    dpParent[nextIdx] = i;
                }
            } else {
                // Non-Khmer
                int nextIdx = i + 1;
                float newCost = currentCost + unknownCost;
                if (nextIdx <= n && newCost < dpCost[nextIdx]) {
                    dpCost[nextIdx] = newCost;
                    dpParent[nextIdx] = i;
                }
            }
        }

        // Backtrack - build in reverse, then reverse once
        List<String> segments = new ArrayList<>(n / 4);
        int curr = n;
        while (curr > 0) {
            int prev = dpParent[curr];
            if (prev == -1) {
                System.err.println("Error: Could not segment text. Stuck at index " + curr);
                break;
            }
            segments.add(codepointsToString(cps, prev, curr));
            curr = prev;
        }

        // Reverse in-place
        int left = 0, right = segments.size() - 1;
        while (left < right) {
            String temp = segments.get(left);
            segments.set(left, segments.get(right));
            segments.set(right, temp);
            left++;
            right--;
        }

        // Post-Processing Pass 1: Snap Invalid Single Consonants
        List<String> pass1Segments = snapInvalidSingleConsonants(segments);

        // Apply heuristics and post-process unknowns
        List<String> pass2Segments = Heuristics.applyHeuristics(pass1Segments, dictionary);
        return Heuristics.postProcessUnknowns(pass2Segments, dictionary);
    }

    /**
     * Convert codepoint range to String.
     */
    private String codepointsToString(int[] cps, int start, int end) {
        return new String(cps, start, end - start);
    }

    /**
     * Merge invalid single consonants with neighbors.
     */
    private List<String> snapInvalidSingleConsonants(List<String> segments) {
        List<String> pass1Segments = new ArrayList<>(segments.size());

        for (int j = 0; j < segments.size(); j++) {
            String seg = segments.get(j);
            int firstCp = seg.codePointAt(0);
            int segLen = seg.codePointCount(0, seg.length());

            boolean isInvalidSingle = segLen == 1
                && !Constants.isValidSingleWord(firstCp)
                && !dictionary.contains(seg)
                && !Constants.isDigit(firstCp)
                && !Constants.isSeparator(firstCp);

            if (isInvalidSingle) {
                boolean prevIsSep = false;
                if (!pass1Segments.isEmpty()) {
                    String prevSeg = pass1Segments.get(pass1Segments.size() - 1);
                    int pChar = prevSeg.codePointAt(0);
                    if (Constants.isSeparator(pChar) || prevSeg.equals(" ") || prevSeg.equals("\u200b")) {
                        prevIsSep = true;
                    }
                } else if (j == 0) {
                    prevIsSep = true;
                }

                boolean nextIsSep = false;
                if (j + 1 < segments.size()) {
                    String nextSeg = segments.get(j + 1);
                    int nChar = nextSeg.codePointAt(0);
                    if (Constants.isSeparator(nChar) || nextSeg.equals(" ") || nextSeg.equals("\u200b")) {
                        nextIsSep = true;
                    }
                } else {
                    nextIsSep = true;
                }

                if (prevIsSep && nextIsSep) {
                    pass1Segments.add(seg);
                    continue;
                }

                if (!pass1Segments.isEmpty()) {
                    String prevSeg = pass1Segments.get(pass1Segments.size() - 1);
                    int pChar = prevSeg.codePointAt(0);
                    if (!Constants.isSeparator(pChar)) {
                        pass1Segments.set(pass1Segments.size() - 1, prevSeg + seg);
                    } else {
                        pass1Segments.add(seg);
                    }
                } else {
                    pass1Segments.add(seg);
                }
            } else {
                pass1Segments.add(seg);
            }
        }

        return pass1Segments;
    }

    // --- Helper Methods (now using codepoints) ---

    private int getKhmerClusterLength(int[] cps, int startIndex, int n) {
        if (startIndex >= n) return 0;

        int c = cps[startIndex];

        // Must start with Base Consonant or Independent Vowel
        if (!(c >= 0x1780 && c <= 0x17B3)) {
            return 1;
        }

        int i = startIndex + 1;

        while (i < n) {
            int current = cps[i];

            if (Constants.isCoeng(current)) {
                if (i + 1 < n && Constants.isConsonant(cps[i + 1])) {
                    i += 2;
                    continue;
                }
                break;
            }

            if (Constants.isDependentVowel(current) || Constants.isSign(current)) {
                i++;
                continue;
            }

            break;
        }

        return i - startIndex;
    }

    private int getNumberLength(int[] cps, int startIndex, int n) {
        int i = startIndex;

        if (!Constants.isDigit(cps[i])) return 0;
        i++;

        while (i < n) {
            int c = cps[i];
            if (Constants.isDigit(c)) {
                i++;
                continue;
            }
            if (c == ',' || c == '.' || c == ' ') {
                if (i + 1 < n && Constants.isDigit(cps[i + 1])) {
                    i += 2;
                    continue;
                }
            }
            break;
        }

        return i - startIndex;
    }

    private int getAcronymLength(int[] cps, int startIndex, int n) {
        int i = startIndex;

        while (true) {
            int clusterLen = getKhmerClusterLength(cps, i, n);
            if (clusterLen > 0) {
                int dotIndex = i + clusterLen;
                if (dotIndex < n && cps[dotIndex] == '.') {
                    i = dotIndex + 1;
                    if (i >= n) break;
                    continue;
                }
            }
            break;
        }

        return i - startIndex;
    }

    private boolean isAcronymStart(int[] cps, int index, int n) {
        if (index + 1 >= n) return false;

        int clusterLen = getKhmerClusterLength(cps, index, n);
        if (clusterLen == 0) return false;

        int dotIndex = index + clusterLen;
        return dotIndex < n && cps[dotIndex] == '.';
    }
}
