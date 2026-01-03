
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Worker } from 'worker_threads';
import { addWord, segment, segmentBatch } from "./build/release.js";

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

function generateVariants(word) {
  const variants = new Set();

  if (word.includes(COENG_TA)) {
    variants.add(word.replaceAll(COENG_TA, COENG_DA));
  }
  if (word.includes(COENG_DA)) {
    variants.add(word.replaceAll(COENG_DA, COENG_TA));
  }

  const baseSet = new Set([word, ...variants]);

  for (const w of baseSet) {
    if (PATTERN_RO_OTHER.test(w)) {
      PATTERN_RO_OTHER.lastIndex = 0;
      variants.add(w.replace(PATTERN_RO_OTHER, '$2$1'));
    }

    if (PATTERN_OTHER_RO.test(w)) {
      PATTERN_OTHER_RO.lastIndex = 0;
      variants.add(w.replace(PATTERN_OTHER_RO, '$2$1'));
    }
  }

  return variants;
}

// Fast JSON escape (avoid regex)
function escapeJson(s) {
  let result = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    switch (c) {
      case '"': result += '\\"'; break;
      case '\\': result += '\\\\'; break;
      case '\n': result += '\\n'; break;
      case '\r': result += '\\r'; break;
      case '\t': result += '\\t'; break;
      default:
        const code = s.charCodeAt(i);
        if (code < 32) {
          result += '\\u' + code.toString(16).padStart(4, '0');
        } else {
          result += c;
        }
    }
  }
  return result;
}

// Fast JSON builder
function toJson(id, input, segments) {
  let result = '{"id":' + id + ',"input":"' + escapeJson(input) + '","segments":[';
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) result += ',';
    result += '"' + escapeJson(segments[i]) + '"';
  }
  result += ']}';
  return result;
}

async function runParallel(dictPath, freqPath, lines, numWorkers) {
  console.log(`Using ${numWorkers} worker threads...`);

  const workerPath = path.join(import.meta.dirname, 'worker.js');
  const results = new Array(lines.length);
  const workerPromises = [];

  const chunkSize = Math.ceil(lines.length / numWorkers);

  for (let w = 0; w < numWorkers; w++) {
    const startIdx = w * chunkSize;
    const endIdx = Math.min(startIdx + chunkSize, lines.length);

    if (startIdx >= lines.length) break;

    const chunk = lines.slice(startIdx, endIdx);

    const workerPromise = new Promise((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: { dictPath, freqPath }
      });

      worker.on('message', (msg) => {
        if (msg.type === 'ready') {
          worker.postMessage({
            type: 'segment',
            lines: chunk,
            startId: startIdx
          });
        } else if (msg.type === 'results') {
          for (let i = 0; i < msg.results.length; i++) {
            results[startIdx + i] = msg.results[i];
          }
          worker.terminate();
          resolve();
        }
      });

      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
      });
    });

    workerPromises.push(workerPromise);
  }

  await Promise.all(workerPromises);
  return results;
}

async function runSingleThreaded(inputContent, lines, words, effectiveCounts, totalTokens, defaultCost) {
  console.log('Processing in single-threaded batch mode...');

  // Add words to WASM dictionary
  for (const w of words) {
    let cost;
    if (effectiveCounts.has(w)) {
      cost = -Math.log10(effectiveCounts.get(w) / totalTokens);
    } else {
      cost = defaultCost;
    }
    addWord(w, cost);
  }

  // Use batch processing
  const batchResult = segmentBatch(inputContent);
  const resultLines = batchResult.split("\n");

  const results = [];
  for (let i = 0; i < lines.length; i++) {
    results.push(resultLines[i] ? resultLines[i].split('|') : []);
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  let dictPath = "";
  let freqPath = "";
  let inputPath = "";
  let outputPath = "";
  let threads = 0; // 0 = auto

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dict' || args[i] === '-d') dictPath = args[++i];
    else if (args[i] === '--freq' || args[i] === '-f') freqPath = args[++i];
    else if (args[i] === '--input' || args[i] === '-i') inputPath = args[++i];
    else if (args[i] === '--output' || args[i] === '-o') outputPath = args[++i];
    else if (args[i] === '--threads' || args[i] === '-t') threads = parseInt(args[++i], 10);
  }

  if (!inputPath) {
    console.error("Usage: node runner.js --dict <path> --freq <path> --input <path> [--output <path>] [--threads <n>]");
    console.error("Options:");
    console.error("  --output, -o <path>  Output file (optional, skip to benchmark only)");
    console.error("  --threads, -t <n>    Number of worker threads (0 = auto, 1 = single-threaded)");
    process.exit(1);
  }

  console.log("Initializing WASM Segmenter...");
  const startLoad = performance.now();

  // Load dictionary and build word set
  const words = new Set();
  if (fs.existsSync(dictPath)) {
    const content = fs.readFileSync(dictPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const w = line.trim();
      if (!w) continue;
      if (w.includes("\u17D7")) continue;
      if (w.startsWith("\u17D2")) continue;
      if (w.includes("\u17D4") && w.length > 1) continue;
      if (w.length === 1 && !VALID_SINGLE_WORDS.has(w)) continue;
      words.add(w);

      const variants = generateVariants(w);
      for (const variant of variants) {
        if (variant !== w) {
          words.add(variant);
        }
      }
    }

    // Post-filter
    const wordsToRemove = new Set();
    for (const word of words) {
      if (word.includes('ឬ') && word.length > 1) {
        if (word.startsWith('ឬ')) {
          const suffix = word.slice(1);
          if (words.has(suffix)) wordsToRemove.add(word);
        } else if (word.endsWith('ឬ')) {
          const prefix = word.slice(0, -1);
          if (words.has(prefix)) wordsToRemove.add(word);
        } else {
          const parts = word.split('ឬ');
          if (parts.every(p => words.has(p) || p === '')) wordsToRemove.add(word);
        }
      }
      if (word.includes('ៗ')) wordsToRemove.add(word);
      if (word.startsWith('\u17D2')) wordsToRemove.add(word);
    }
    for (const w of wordsToRemove) words.delete(w);
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

  // Calculate costs
  const MIN_FREQ_FLOOR = 5.0;
  const effectiveCounts = new Map();
  let totalTokens = 0;

  for (const [word, count] of Object.entries(freqs)) {
    const eff = Math.max(count, MIN_FREQ_FLOOR);
    effectiveCounts.set(word, eff);
    const variants = generateVariants(word);
    for (const v of variants) {
      if (!effectiveCounts.has(v)) effectiveCounts.set(v, eff);
    }
    totalTokens += eff;
  }

  if (totalTokens <= 0) totalTokens = 1;
  const defaultCost = -Math.log10(MIN_FREQ_FLOOR / totalTokens);

  const loadTime = (performance.now() - startLoad) / 1000;
  console.log(`Model loaded in ${loadTime.toFixed(2)}s (${words.size} words)`);

  // Load input
  const inputContent = fs.readFileSync(inputPath, 'utf-8');
  const lines = inputContent.split(/\r?\n/).filter(line => line.trim().length > 0);

  console.log(`Processing ${lines.length} lines...`);
  const startProc = performance.now();

  let results;

  // Use parallel processing if we have enough work and multiple CPUs
  const numWorkers = threads > 0 ? threads : Math.min(os.cpus().length, 8);
  const useParallel = lines.length >= 100 && numWorkers > 1;

  if (useParallel) {
    results = await runParallel(dictPath, freqPath, lines, numWorkers);
  } else {
    results = await runSingleThreaded(inputContent, lines, words, effectiveCounts, totalTokens, defaultCost);
  }

  const procTime = (performance.now() - startProc) / 1000;

  // Write output
  if (outputPath) {
    const outputStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });
    for (let i = 0; i < lines.length; i++) {
      outputStream.write(toJson(i, lines[i], results[i]) + '\n');
    }
    outputStream.end();
    console.log(`Done. Saved to ${outputPath}`);
  }

  console.log(`Time taken: ${procTime.toFixed(2)}s`);
  console.log(`Speed: ${(lines.length / procTime).toFixed(2)} lines/sec`);
}


main().catch(err => {
  console.error(err);
  process.exit(1);
});
