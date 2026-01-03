package khmer;

import java.util.ArrayList;
import java.util.List;

/**
 * Post-processing heuristics for Khmer word segmentation.
 */
public final class Heuristics {

    private Heuristics() {} // Utility class

    /**
     * Apply heuristic rules to merge specific segment patterns.
     * Rule 1: Consonant + [់/៍ /៌] -> Merge with PREVIOUS
     * Rule 2: Consonant + ័ -> Merge with NEXT
     */
    public static List<String> applyHeuristics(List<String> segments, Dictionary dictionary) {
        List<String> merged = new ArrayList<>(segments.size());
        int n = segments.size();
        int i = 0;

        while (i < n) {
            String curr = segments.get(i);

            // If known word, don't merge
            if (dictionary.contains(curr)) {
                merged.add(curr);
                i++;
                continue;
            }

            // Rule 1: Consonant + [់/៍/៌] -> Merge with PREVIOUS
            boolean mergedRule1 = false;
            if (!merged.isEmpty() && curr.length() == 2) {
                char c0 = curr.charAt(0);
                char c1 = curr.charAt(1);

                if (Constants.isConsonant(c0) &&
                    (c1 == '\u17CB' || c1 == '\u17CE' || c1 == '\u17CF')) {

                    String prev = merged.remove(merged.size() - 1);
                    merged.add(prev + curr);
                    i++;
                    mergedRule1 = true;
                }
            }

            // Special case for 3-char (Consonant + ិ + ៍)
            if (!mergedRule1 && !merged.isEmpty() && curr.length() == 3) {
                char c0 = curr.charAt(0);
                char c1 = curr.charAt(1);
                char c2 = curr.charAt(2);

                if (Constants.isConsonant(c0) && c1 == '\u17B7' && c2 == '\u17CD') {
                    String prev = merged.remove(merged.size() - 1);
                    merged.add(prev + curr);
                    i++;
                    mergedRule1 = true;
                }
            }

            if (mergedRule1) continue;

            // Rule 2: Consonant + ័ (0x17D0) -> Merge with NEXT
            if (i + 1 < n && curr.length() == 2) {
                char c0 = curr.charAt(0);
                char c1 = curr.charAt(1);

                if (Constants.isConsonant(c0) && c1 == '\u17D0') {
                    String nextSeg = segments.get(i + 1);
                    merged.add(curr + nextSeg);
                    i += 2;
                    continue;
                }
            }

            merged.add(curr);
            i++;
        }

        return merged;
    }

    /**
     * Merge consecutive unknown segments.
     * Separators break the merge chain.
     */
    public static List<String> postProcessUnknowns(List<String> segments, Dictionary dictionary) {
        List<String> finalSegments = new ArrayList<>();
        StringBuilder unknownBuffer = new StringBuilder();

        for (String seg : segments) {
            boolean isKnown = false;

            if (!seg.isEmpty()) {
                char firstChar = seg.charAt(0);

                if (Constants.isDigit(firstChar)) {
                    isKnown = true;
                } else if (dictionary.contains(seg)) {
                    isKnown = true;
                } else if (seg.length() == 1 && Constants.isValidSingleWord(firstChar)) {
                    isKnown = true;
                } else if (Constants.isSeparator(firstChar)) {
                    isKnown = true;
                } else if (seg.contains(".") && seg.length() >= 2) {
                    // Acronym pattern
                    isKnown = true;
                }
            }

            if (isKnown) {
                if (unknownBuffer.length() > 0) {
                    finalSegments.add(unknownBuffer.toString());
                    unknownBuffer.setLength(0);
                }
                finalSegments.add(seg);
            } else {
                unknownBuffer.append(seg);
            }
        }

        if (unknownBuffer.length() > 0) {
            finalSegments.add(unknownBuffer.toString());
        }

        return finalSegments;
    }
}
