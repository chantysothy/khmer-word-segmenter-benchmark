package khmer;

import java.util.ArrayList;
import java.util.List;

/**
 * Khmer word segmenter using Viterbi algorithm.
 * 1BRC optimized: uses char[] instead of codepoints (Khmer is entirely in BMP).
 */
public class KhmerSegmenter {

    private final Dictionary dictionary;

    // 1BRC: Pre-allocated DP buffers per instance (used with ThreadLocal)
    private float[] dpCost;
    private int[] dpParent;
    // 1BRC: Pre-allocated char buffer to avoid repeated allocation
    private char[] charBuffer;
    // 1BRC: Pre-allocated segment list to reduce allocation
    private final ArrayList<String> segments;
    private final ArrayList<String> pass1Segments;

    public KhmerSegmenter(Dictionary dictionary) {
        this.dictionary = dictionary;
        // Pre-allocate reasonable buffer sizes
        this.dpCost = new float[1024];
        this.dpParent = new int[1024];
        this.charBuffer = new char[1024];
        this.segments = new ArrayList<>(64);
        this.pass1Segments = new ArrayList<>(64);
    }

    /**
     * Segment Khmer text into words using the Viterbi algorithm.
     * 1BRC: Uses char[] directly instead of codepoints for BMP text.
     */
    public List<String> segment(String text) {
        // 1. Strip Zero-Width Spaces
        // 1BRC: Only create new string if ZWS present
        if (text.indexOf('\u200b') >= 0) {
            text = text.replace("\u200b", "");
        }

        int n = text.length();
        if (n == 0) {
            return new ArrayList<>();
        }

        // 1BRC: Copy to char buffer for faster indexed access
        if (charBuffer.length < n) {
            charBuffer = new char[n + 128];
        }
        text.getChars(0, n, charBuffer, 0);
        char[] chars = charBuffer;

        // Ensure DP buffers are large enough
        if (dpCost.length < n + 1) {
            dpCost = new float[n + 128];
            dpParent = new int[n + 128];
        }

        // 1BRC: Manual fill is faster for hot paths than Arrays.fill
        for (int i = 0; i <= n; i++) {
            dpCost[i] = Float.POSITIVE_INFINITY;
            dpParent[i] = -1;
        }
        dpCost[0] = 0.0f;

        // Cache frequently accessed values
        int maxWordLen = dictionary.maxWordLength;
        float unknownCost = dictionary.unknownCost;

        for (int i = 0; i < n; i++) {
            float currentCost = dpCost[i];
            if (currentCost == Float.POSITIVE_INFINITY) continue;

            char charI = chars[i];

            // --- Constraint Checks & Fallback (Repair Mode) ---
            boolean forceRepair = false;

            // 1. Previous char was Coeng (U+17D2)
            if (i > 0 && chars[i - 1] == '\u17D2') {
                forceRepair = true;
            }

            // 2. Current char is Dependent Vowel (inline check for speed)
            // isDependentVowel: 0x17B6 - 0x17C5
            if (charI >= '\u17B6' && charI <= '\u17C5') {
                forceRepair = true;
            }

            if (forceRepair) {
                // Recovery Mode: Consume 1 char with high penalty
                int nextIdx = i + 1;
                float newCost = currentCost + unknownCost + 50.0f;
                if (newCost < dpCost[nextIdx]) {
                    dpCost[nextIdx] = newCost;
                    dpParent[nextIdx] = i;
                }
                continue;
            }

            // --- Normal Processing ---

            // 1. Number / Digit Grouping (and Currency)
            // 1BRC: Inline digit check
            boolean isDigitChar = (charI >= '0' && charI <= '9') || (charI >= '\u17E0' && charI <= '\u17E9');
            boolean isCurrencyStart = false;
            // 1BRC: Inline currency check
            if (charI == '$' || charI == '\u17DB' || charI == '\u20AC' || charI == '\u00A3' || charI == '\u00A5') {
                if (i + 1 < n) {
                    char next = chars[i + 1];
                    if ((next >= '0' && next <= '9') || (next >= '\u17E0' && next <= '\u17E9')) {
                        isCurrencyStart = true;
                    }
                }
            }

            if (isDigitChar || isCurrencyStart) {
                int numLen = getNumberLength(chars, i, n);
                int nextIdx = i + numLen;
                float newCost = currentCost + 1.0f;
                if (nextIdx <= n && newCost < dpCost[nextIdx]) {
                    dpCost[nextIdx] = newCost;
                    dpParent[nextIdx] = i;
                }
            }
            // 2. Separators
            else if (isSeparatorInline(charI)) {
                int nextIdx = i + 1;
                float newCost = currentCost + 0.1f;
                if (nextIdx <= n && newCost < dpCost[nextIdx]) {
                    dpCost[nextIdx] = newCost;
                    dpParent[nextIdx] = i;
                }
            }

            // 3. Acronyms
            if (isAcronymStart(chars, i, n)) {
                int acrLen = getAcronymLength(chars, i, n);
                int nextIdx = i + acrLen;
                float newCost = currentCost + 1.0f;
                if (nextIdx <= n && newCost < dpCost[nextIdx]) {
                    dpCost[nextIdx] = newCost;
                    dpParent[nextIdx] = i;
                }
            }

            // 4. Dictionary Match - 1BRC: use char-based trie lookup
            int endLimit = Math.min(n, i + maxWordLen);
            for (int j = i + 1; j <= endLimit; j++) {
                float wordCost = dictionary.lookupChars(chars, i, j);
                if (wordCost >= 0) {
                    float newCost = currentCost + wordCost;
                    if (newCost < dpCost[j]) {
                        dpCost[j] = newCost;
                        dpParent[j] = i;
                    }
                }
            }

            // 5. Unknown Cluster Fallback
            // 1BRC: Inline isKhmerChar
            boolean isKhmer = (charI >= '\u1780' && charI <= '\u17FF') || (charI >= '\u19E0' && charI <= '\u19FF');
            if (isKhmer) {
                int clusterLen = getKhmerClusterLength(chars, i, n);
                float stepCost = unknownCost;

                // 1BRC: Inline isValidSingleWord check
                if (clusterLen == 1 && !isValidSingleWordInline(charI)) {
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

        // Backtrack - reuse pre-allocated list
        segments.clear();
        int curr = n;
        while (curr > 0) {
            int prev = dpParent[curr];
            if (prev == -1) {
                System.err.println("Error: Could not segment text. Stuck at index " + curr);
                break;
            }
            segments.add(new String(chars, prev, curr - prev));
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
        List<String> pass1 = snapInvalidSingleConsonants(segments);

        // Apply heuristics and post-process unknowns
        List<String> pass2 = Heuristics.applyHeuristics(pass1, dictionary);
        return Heuristics.postProcessUnknowns(pass2, dictionary);
    }

    // 1BRC: Inline separator check for hot path
    private static boolean isSeparatorInline(char c) {
        // Khmer punctuation range
        if (c >= '\u17D4' && c <= '\u17DA') return true;
        // Currency Riel
        if (c == '\u17DB') return true;
        // Common ASCII separators
        switch (c) {
            case '!': case '?': case '.': case ',': case ';': case ':':
            case '"': case '\'': case '(': case ')': case '[': case ']':
            case '{': case '}': case '-': case '/': case ' ': case '$':
            case '%':
                return true;
        }
        // Extended punctuation
        return c == '\u00AB' || c == '\u00BB' || c == '\u201C' || c == '\u201D' || c == '\u02DD';
    }

    // 1BRC: Inline valid single word check
    private static boolean isValidSingleWordInline(char c) {
        switch (c) {
            // Consonants that can stand alone
            case '\u1780': case '\u1781': case '\u1782': case '\u1784':
            case '\u1785': case '\u1786': case '\u1789': case '\u178A':
            case '\u178F': case '\u1791': case '\u1796': case '\u179A':
            case '\u179B': case '\u179F': case '\u17A1':
            // Independent Vowels
            case '\u17AC': case '\u17AE': case '\u17AA': case '\u17AF':
            case '\u17B1': case '\u17A6': case '\u17A7': case '\u17B3':
                return true;
            default:
                return false;
        }
    }

    /**
     * Merge invalid single consonants with neighbors.
     */
    private List<String> snapInvalidSingleConsonants(List<String> segs) {
        pass1Segments.clear();

        for (int j = 0; j < segs.size(); j++) {
            String seg = segs.get(j);
            char firstChar = seg.charAt(0);
            int segLen = seg.length();

            boolean isInvalidSingle = segLen == 1
                && !isValidSingleWordInline(firstChar)
                && !dictionary.contains(seg)
                && !((firstChar >= '0' && firstChar <= '9') || (firstChar >= '\u17E0' && firstChar <= '\u17E9'))
                && !isSeparatorInline(firstChar);

            if (isInvalidSingle) {
                boolean prevIsSep = false;
                if (!pass1Segments.isEmpty()) {
                    String prevSeg = pass1Segments.get(pass1Segments.size() - 1);
                    char pChar = prevSeg.charAt(0);
                    if (isSeparatorInline(pChar) || prevSeg.equals(" ") || prevSeg.equals("\u200b")) {
                        prevIsSep = true;
                    }
                } else if (j == 0) {
                    prevIsSep = true;
                }

                boolean nextIsSep = false;
                if (j + 1 < segs.size()) {
                    String nextSeg = segs.get(j + 1);
                    char nChar = nextSeg.charAt(0);
                    if (isSeparatorInline(nChar) || nextSeg.equals(" ") || nextSeg.equals("\u200b")) {
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
                    char pChar = prevSeg.charAt(0);
                    if (!isSeparatorInline(pChar)) {
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

        return new ArrayList<>(pass1Segments);
    }

    // --- Helper Methods (now using char[]) ---

    private static int getKhmerClusterLength(char[] chars, int startIndex, int n) {
        if (startIndex >= n) return 0;

        char c = chars[startIndex];

        // Must start with Base Consonant or Independent Vowel (0x1780-0x17B3)
        if (!(c >= '\u1780' && c <= '\u17B3')) {
            return 1;
        }

        int i = startIndex + 1;

        while (i < n) {
            char current = chars[i];

            // isCoeng: U+17D2
            if (current == '\u17D2') {
                if (i + 1 < n) {
                    char next = chars[i + 1];
                    // isConsonant: 0x1780-0x17A2
                    if (next >= '\u1780' && next <= '\u17A2') {
                        i += 2;
                        continue;
                    }
                }
                break;
            }

            // isDependentVowel: 0x17B6-0x17C5 or isSign: 0x17C6-0x17D1, 0x17D3, 0x17DD
            if ((current >= '\u17B6' && current <= '\u17D1') || current == '\u17D3' || current == '\u17DD') {
                i++;
                continue;
            }

            break;
        }

        return i - startIndex;
    }

    private static int getNumberLength(char[] chars, int startIndex, int n) {
        int i = startIndex;
        char c = chars[i];

        // isDigit inline
        if (!((c >= '0' && c <= '9') || (c >= '\u17E0' && c <= '\u17E9'))) return 0;
        i++;

        while (i < n) {
            c = chars[i];
            if ((c >= '0' && c <= '9') || (c >= '\u17E0' && c <= '\u17E9')) {
                i++;
                continue;
            }
            if (c == ',' || c == '.' || c == ' ') {
                if (i + 1 < n) {
                    char next = chars[i + 1];
                    if ((next >= '0' && next <= '9') || (next >= '\u17E0' && next <= '\u17E9')) {
                        i += 2;
                        continue;
                    }
                }
            }
            break;
        }

        return i - startIndex;
    }

    private static int getAcronymLength(char[] chars, int startIndex, int n) {
        int i = startIndex;

        while (true) {
            int clusterLen = getKhmerClusterLength(chars, i, n);
            if (clusterLen > 0) {
                int dotIndex = i + clusterLen;
                if (dotIndex < n && chars[dotIndex] == '.') {
                    i = dotIndex + 1;
                    if (i >= n) break;
                    continue;
                }
            }
            break;
        }

        return i - startIndex;
    }

    private static boolean isAcronymStart(char[] chars, int index, int n) {
        if (index + 1 >= n) return false;

        int clusterLen = getKhmerClusterLength(chars, index, n);
        if (clusterLen == 0) return false;

        int dotIndex = index + clusterLen;
        return dotIndex < n && chars[dotIndex] == '.';
    }
}
