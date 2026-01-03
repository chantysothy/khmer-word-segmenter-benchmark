package khmer;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Dictionary and frequency model for Khmer word segmentation.
 * Optimized with Trie for fast codepoint-based lookups.
 */
public class Dictionary {

    private final Set<String> words;
    private final Map<String, Float> wordCosts;

    // Trie for fast codepoint-based lookup
    private final TrieNode trie;

    public int maxWordLength; // in codepoints
    public float defaultCost;
    public float unknownCost;

    private static final float MIN_FREQ_FLOOR = 5.0f;

    // Constants for variant generation
    private static final String COENG_TA = "\u17D2\u178F";
    private static final String COENG_DA = "\u17D2\u178D";

    public Dictionary() {
        this.words = new HashSet<>();
        this.wordCosts = new HashMap<>();
        this.trie = new TrieNode();
        this.maxWordLength = 0;
        this.defaultCost = 10.0f;
        this.unknownCost = 20.0f;
    }

    public void load(String dictionaryPath, String frequencyPath) throws IOException {
        loadDictionary(dictionaryPath);
        loadFrequencies(frequencyPath);
        buildTrie();
    }

    private void loadDictionary(String path) throws IOException {
        Set<String> validSingleWords = Constants.VALID_SINGLE_WORDS
            .stream()
            .map(String::valueOf)
            .collect(java.util.stream.Collectors.toSet());

        try (BufferedReader reader = Files.newBufferedReader(Path.of(path), StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                String word = line.trim();
                if (word.isEmpty()) continue;

                // Filter invalid single-char words (use codepoint count)
                int cpCount = word.codePointCount(0, word.length());
                if (cpCount == 1 && !validSingleWords.contains(word)) {
                    continue;
                }

                addWordWithVariants(word);
            }
        }

        // Post-process: remove compound words with OR, words with repetition mark, words starting with Coeng
        Set<String> toRemove = new HashSet<>();
        for (String word : words) {
            // Contains ឬ (OR)
            if (word.contains("\u17AC") && word.codePointCount(0, word.length()) > 1) {
                if (word.startsWith("\u17AC")) {
                    String suffix = word.substring(1);
                    if (words.contains(suffix)) toRemove.add(word);
                } else if (word.endsWith("\u17AC")) {
                    String prefix = word.substring(0, word.length() - 1);
                    if (words.contains(prefix)) toRemove.add(word);
                } else {
                    String[] parts = word.split("\u17AC");
                    boolean allValid = true;
                    for (String p : parts) {
                        if (!p.isEmpty() && !words.contains(p)) {
                            allValid = false;
                            break;
                        }
                    }
                    if (allValid) toRemove.add(word);
                }
            }

            // Contains repetition mark
            if (word.contains("\u17D7")) {
                toRemove.add(word);
            }

            // Starts with Coeng
            if (word.startsWith("\u17D2")) {
                toRemove.add(word);
            }
        }

        words.removeAll(toRemove);
        words.remove("\u17D7"); // Remove standalone repetition mark

        // Recalculate max word length in codepoints
        maxWordLength = 0;
        for (String word : words) {
            int cpCount = word.codePointCount(0, word.length());
            if (cpCount > maxWordLength) {
                maxWordLength = cpCount;
            }
        }

        System.out.println("Loaded " + words.size() + " words. Max length: " + maxWordLength);
    }

    private void addWordWithVariants(String word) {
        words.add(word);
        int cpCount = word.codePointCount(0, word.length());
        if (cpCount > maxWordLength) {
            maxWordLength = cpCount;
        }

        Set<String> variants = generateVariants(word);
        for (String v : variants) {
            words.add(v);
            int vCpCount = v.codePointCount(0, v.length());
            if (vCpCount > maxWordLength) {
                maxWordLength = vCpCount;
            }
        }
    }

    private Set<String> generateVariants(String word) {
        Set<String> variants = new HashSet<>();

        // 1. Coeng Ta <-> Coeng Da swap
        if (word.contains(COENG_TA)) {
            variants.add(word.replace(COENG_TA, COENG_DA));
        }
        if (word.contains(COENG_DA)) {
            variants.add(word.replace(COENG_DA, COENG_TA));
        }

        // 2. Coeng Ro ordering swaps (without regex for performance)
        Set<String> baseSet = new HashSet<>();
        baseSet.add(word);
        baseSet.addAll(variants);

        for (String w : baseSet) {
            String swapped = swapCoengRoOrder(w);
            if (!swapped.equals(w)) {
                variants.add(swapped);
            }
        }

        return variants;
    }

    /**
     * Swap Coeng+Ro with adjacent Coeng+X patterns (no regex).
     */
    private String swapCoengRoOrder(String word) {
        int[] cps = word.codePoints().toArray();
        int n = cps.length;
        if (n < 4) return word;

        int[] result = new int[n];
        int ri = 0;
        int i = 0;
        boolean changed = false;

        while (i < n) {
            // Look for pattern: Coeng + Ro + Coeng + X
            if (i + 3 < n &&
                cps[i] == 0x17D2 && cps[i+1] == 0x179A &&
                cps[i+2] == 0x17D2 && cps[i+3] != 0x179A) {
                result[ri++] = cps[i+2];
                result[ri++] = cps[i+3];
                result[ri++] = cps[i];
                result[ri++] = cps[i+1];
                i += 4;
                changed = true;
                continue;
            }
            // Look for pattern: Coeng + X + Coeng + Ro
            if (i + 3 < n &&
                cps[i] == 0x17D2 && cps[i+1] != 0x179A &&
                cps[i+2] == 0x17D2 && cps[i+3] == 0x179A) {
                result[ri++] = cps[i+2];
                result[ri++] = cps[i+3];
                result[ri++] = cps[i];
                result[ri++] = cps[i+1];
                i += 4;
                changed = true;
                continue;
            }
            result[ri++] = cps[i++];
        }

        if (changed) {
            return new String(result, 0, ri);
        }
        return word;
    }

    private void loadFrequencies(String path) throws IOException {
        Path freqPath = Path.of(path);
        if (!Files.exists(freqPath)) {
            System.out.println("Frequency file not found at " + path + ". Using default costs.");
            return;
        }

        String json = Files.readString(freqPath, StandardCharsets.UTF_8);
        Map<String, Double> data = parseJsonMap(json);

        Map<String, Float> effectiveCounts = new HashMap<>(data.size());
        float totalTokens = 0;

        for (Map.Entry<String, Double> entry : data.entrySet()) {
            String word = entry.getKey();
            float count = entry.getValue().floatValue();
            float eff = Math.max(count, MIN_FREQ_FLOOR);
            effectiveCounts.put(word, eff);

            // Add variants with same frequency
            Set<String> variants = generateVariants(word);
            for (String v : variants) {
                effectiveCounts.putIfAbsent(v, eff);
            }

            totalTokens += eff;
        }

        if (totalTokens > 0) {
            float minProb = MIN_FREQ_FLOOR / totalTokens;
            this.defaultCost = (float) -Math.log10(minProb);
            this.unknownCost = this.defaultCost + 5.0f;

            for (Map.Entry<String, Float> entry : effectiveCounts.entrySet()) {
                float prob = entry.getValue() / totalTokens;
                if (prob > 0) {
                    wordCosts.put(entry.getKey(), (float) -Math.log10(prob));
                }
            }
        }

        System.out.println("Loaded frequencies for " + wordCosts.size() + " words.");
        System.out.printf("Default cost: %.2f (freq floor=%.0f), Unknown cost: %.2f%n",
            defaultCost, MIN_FREQ_FLOOR, unknownCost);
    }

    /**
     * Build trie from dictionary for fast codepoint-based lookups.
     */
    private void buildTrie() {
        for (String word : words) {
            float cost = getWordCost(word);
            insertIntoTrie(word, cost);
        }
    }

    private void insertIntoTrie(String word, float cost) {
        TrieNode node = trie;
        int[] cps = word.codePoints().toArray();
        for (int cp : cps) {
            node = node.getOrCreateChild(cp);
        }
        node.isWord = true;
        node.cost = cost;
    }

    /**
     * Lookup codepoints in trie. Returns cost if found, null otherwise.
     */
    public Float lookupCodepoints(int[] cps, int start, int end) {
        TrieNode node = trie;
        for (int i = start; i < end; i++) {
            node = node.getChild(cps[i]);
            if (node == null) return null;
        }
        return node.isWord ? node.cost : null;
    }

    /**
     * Simple JSON parser for Map<String, Number> format.
     */
    private Map<String, Double> parseJsonMap(String json) {
        Map<String, Double> result = new HashMap<>();

        json = json.trim();
        if (json.startsWith("{")) json = json.substring(1);
        if (json.endsWith("}")) json = json.substring(0, json.length() - 1);

        StringBuilder keyBuilder = new StringBuilder();
        StringBuilder valueBuilder = new StringBuilder();
        boolean inKey = false;
        boolean inValue = false;
        boolean escaped = false;

        for (int i = 0; i < json.length(); i++) {
            char c = json.charAt(i);

            if (escaped) {
                if (inKey) keyBuilder.append(c);
                escaped = false;
                continue;
            }

            if (c == '\\') {
                escaped = true;
                continue;
            }

            if (c == '"') {
                if (!inKey && !inValue) {
                    inKey = true;
                    keyBuilder.setLength(0);
                } else if (inKey) {
                    inKey = false;
                }
                continue;
            }

            if (inKey) {
                keyBuilder.append(c);
                continue;
            }

            if (c == ':') {
                inValue = true;
                valueBuilder.setLength(0);
                continue;
            }

            if (c == ',' || c == '}') {
                if (inValue && valueBuilder.length() > 0) {
                    String key = keyBuilder.toString();
                    String valStr = valueBuilder.toString().trim();
                    try {
                        double val = Double.parseDouble(valStr);
                        result.put(key, val);
                    } catch (NumberFormatException e) {
                        // Skip invalid entries
                    }
                    inValue = false;
                }
                continue;
            }

            if (inValue) {
                valueBuilder.append(c);
            }
        }

        // Handle last entry
        if (inValue && valueBuilder.length() > 0) {
            String key = keyBuilder.toString();
            String valStr = valueBuilder.toString().trim();
            try {
                double val = Double.parseDouble(valStr);
                result.put(key, val);
            } catch (NumberFormatException e) {
                // Skip
            }
        }

        return result;
    }

    public boolean contains(String word) {
        return words.contains(word);
    }

    public float getWordCost(String word) {
        Float cost = wordCosts.get(word);
        if (cost != null) return cost;
        if (words.contains(word)) return defaultCost;
        return unknownCost;
    }

    /**
     * Trie node for efficient codepoint-based dictionary lookup.
     */
    private static class TrieNode {
        private Map<Integer, TrieNode> children;
        boolean isWord = false;
        float cost = 0;

        TrieNode getChild(int codepoint) {
            return children == null ? null : children.get(codepoint);
        }

        TrieNode getOrCreateChild(int codepoint) {
            if (children == null) {
                children = new HashMap<>();
            }
            return children.computeIfAbsent(codepoint, k -> new TrieNode());
        }
    }
}
