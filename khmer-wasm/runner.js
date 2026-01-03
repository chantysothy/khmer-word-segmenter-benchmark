
import fs from 'fs';
import { addWord, segment, segmentBatch } from "./build/release.js";
import path from 'path';

// Valid single-character words (matching Python's valid_single_words)
const VALID_SINGLE_WORDS = new Set([
  'ក', 'ខ', 'គ', 'ង', 'ច', 'ឆ', 'ញ', 'ដ', 'ត', 'ទ', 'ព', 'រ', 'ល', 'ស', 'ឡ', // Consonants
  'ឬ', 'ឮ', 'ឪ', 'ឯ', 'ឱ', 'ឦ', 'ឧ', 'ឳ' // Independent Vowels
]);

// Coeng characters for variant generation (matching Python's _generate_variants)
const COENG_TA = '\u17D2\u178F';
const COENG_DA = '\u17D2\u178D';
const COENG_RO = '\u17D2\u179A';

// Pattern 1: Coeng Ro followed by Other Coeng
const PATTERN_RO_OTHER = /(\u17D2\u179A)(\u17D2[^\u179A])/g;
// Pattern 2: Other Coeng followed by Coeng Ro
const PATTERN_OTHER_RO = /(\u17D2[^\u179A])(\u17D2\u179A)/g;

/**
 * Generates interchangeable variants for a word (matching Python's _generate_variants).
 * 1. Coeng Ta ↔ Coeng Da
 * 2. Coeng Ro ordering with other Coengs
 */
function generateVariants(word) {
  const variants = new Set();

  // 1. Coeng Ta <-> Coeng Da
  if (word.includes(COENG_TA)) {
    variants.add(word.replaceAll(COENG_TA, COENG_DA));
  }
  if (word.includes(COENG_DA)) {
    variants.add(word.replaceAll(COENG_DA, COENG_TA));
  }

  // 2. Coeng Ro Ordering
  const baseSet = new Set([word, ...variants]);

  for (const w of baseSet) {
    // Apply Swap 1: Ro -> Other ==> Other -> Ro
    if (PATTERN_RO_OTHER.test(w)) {
      PATTERN_RO_OTHER.lastIndex = 0; // Reset regex state
      variants.add(w.replace(PATTERN_RO_OTHER, '$2$1'));
    }

    // Apply Swap 2: Other -> Ro ==> Ro -> Other
    if (PATTERN_OTHER_RO.test(w)) {
      PATTERN_OTHER_RO.lastIndex = 0; // Reset regex state
      variants.add(w.replace(PATTERN_OTHER_RO, '$2$1'));
    }
  }

  return variants;
}

// Usage: node runner.js --dict <dict_path> --freq <freq_path> --input <input_path> --output <output_path>

async function main() {
  const args = process.argv.slice(2);
  let dictPath = "";
  let freqPath = "";
  let inputPath = "";
  let outputPath = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dict' || args[i] === '-d') dictPath = args[++i];
    else if (args[i] === '--freq' || args[i] === '-f') freqPath = args[++i];
    else if (args[i] === '--input' || args[i] === '-i') inputPath = args[++i];
    else if (args[i] === '--output' || args[i] === '-o') outputPath = args[++i];
  }

  if (!inputPath) {
    console.error("Usage: node runner.js --dict <path> --freq <path> --input <path> [--output <path>]");
    console.error("Options:");
    console.error("  --output, -o <path>  Output file (optional, skip to benchmark only)");
    process.exit(1);
  }

  // 1. Load Dictionary and Frequencies (JS side)
  // We need to calculate costs and push them to WASM.
  // This might be slow (cross-boundary calls), but happens only once.

  console.log("Initializing WASM Segmenter...");
  const startLoad = performance.now();

  const words = new Set();
  if (fs.existsSync(dictPath)) {
    const content = fs.readFileSync(dictPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const w = line.trim();
      if (!w) continue;
      // Filter (simplified matching C#/Node)
      if (w.includes("\u17D7")) continue;  // ៗ Repetition Mark
      if (w.startsWith("\u17D2")) continue;
      if (w.includes("\u17D4") && w.length > 1) continue;
      // Filter single-character words not in valid_single_words (matching Python)
      if (w.length === 1 && !VALID_SINGLE_WORDS.has(w)) continue;
      words.add(w);

      // Generate variants (matching Python's _generate_variants)
      const variants = generateVariants(w);
      for (const variant of variants) {
        if (variant !== w) {
          words.add(variant);
        }
      }
    }

    // Post-filter: Remove compound ORs (matching Python's _load_dictionary post-processing)
    // Words containing ឬ that can be split into valid subwords
    const wordsToRemove = new Set();
    for (const word of words) {
      if (word.includes('ឬ') && word.length > 1) {
        // Case 1: Starts with ឬ (e.g. ឬហៅ)
        if (word.startsWith('ឬ')) {
          const suffix = word.slice(1);
          if (words.has(suffix)) {
            wordsToRemove.add(word);
          }
        }
        // Case 2: Ends with ឬ (e.g. មកឬ)
        else if (word.endsWith('ឬ')) {
          const prefix = word.slice(0, -1);
          if (words.has(prefix)) {
            wordsToRemove.add(word);
          }
        }
        // Case 3: Middle (e.g. មែនឬទេ)
        else {
          const parts = word.split('ឬ');
          if (parts.every(p => words.has(p) || p === '')) {
            wordsToRemove.add(word);
          }
        }
      }

      // Filter words with ៗ
      if (word.includes('ៗ')) {
        wordsToRemove.add(word);
      }

      // Filter words starting with Coeng
      if (word.startsWith('\u17D2')) {
        wordsToRemove.add(word);
      }
    }

    for (const w of wordsToRemove) {
      words.delete(w);
    }

    // Remove standalone ៗ if it somehow got in
    words.delete('ៗ');
  }

  let freqs = {};
  if (fs.existsSync(freqPath)) {
    try {
      freqs = JSON.parse(fs.readFileSync(freqPath, 'utf-8'));
    } catch (e) {
      console.error("Error loading freqs:", e);
    }
  }

  // Calculate costs (matching Python's _load_frequencies logic)
  const MIN_FREQ_FLOOR = 5.0;

  // Build effective_counts with variants (matching Python)
  const effectiveCounts = new Map();
  let totalTokens = 0;

  for (const [word, count] of Object.entries(freqs)) {
    const eff = Math.max(count, MIN_FREQ_FLOOR);
    effectiveCounts.set(word, eff);

    // Add variants with SAME frequency (matching Python)
    const variants = generateVariants(word);
    for (const v of variants) {
      if (!effectiveCounts.has(v)) {
        effectiveCounts.set(v, eff);
      }
    }

    // Total tokens from primary words only (not variants) - matching Python
    totalTokens += eff;
  }

  if (totalTokens <= 0) totalTokens = 1;

  // Calculate default cost for words without frequency data
  const defaultCost = -Math.log10(MIN_FREQ_FLOOR / totalTokens);

  // Add to WASM
  for (const w of words) {
    let cost;
    if (effectiveCounts.has(w)) {
      const count = effectiveCounts.get(w);
      cost = -Math.log10(count / totalTokens);
    } else {
      // Word in dictionary but not in frequency file - use default cost
      cost = defaultCost;
    }
    addWord(w, cost);
  }

  const loadTime = (performance.now() - startLoad) / 1000;
  console.log(`Model loaded in ${loadTime.toFixed(2)}s (${words.size} words)`);

  // 2. Process Input
  const inputContent = fs.readFileSync(inputPath, 'utf-8');
  // We filter to get the expected input lines for the JSON output
  const lines = inputContent.split(/\r?\n/).filter(line => line.trim().length > 0);

  console.log(`Processing ${lines.length} lines (Batch Mode)...`);

  const startProc = performance.now();

  // Use segmentBatch for high performance (minimized boundary crossing)
  const batchResult = segmentBatch(inputContent);
  const resultLines = batchResult.split("\n");

  // Write output only if outputPath is specified
  if (outputPath) {
    const outputStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });

    // Note: segmentBatch logic for skipping empty lines should match our filter above
    // for the workload generated by benchmark_battle.py (which has no empty lines inside).

    const len = Math.min(lines.length, resultLines.length);

    for (let i = 0; i < len; i++) {
      const line = lines[i];
      const segmentedStr = resultLines[i];
      // Split back to array for JSON format matching other runners
      // The WASM returns pipe separated
      const segments = segmentedStr.split("|");

      const record = {
        id: i,
        input: line,
        segments: segments
      };
      outputStream.write(JSON.stringify(record) + "\n");
    }

    outputStream.end();
  }

  const procTime = (performance.now() - startProc) / 1000;

  if (outputPath) {
    console.log(`Done. Saved to ${outputPath}`);
  }
  console.log(`Time taken: ${procTime.toFixed(2)}s`);
  console.log(`Speed: ${(lines.length / procTime).toFixed(2)} lines/sec`);
}


main().catch(err => {
  console.error(err);
  process.exit(1);
});
