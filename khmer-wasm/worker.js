// WASM Worker for parallel processing
import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import { addWord, segmentBatch } from "./build/release.js";

// Valid single-character words
const VALID_SINGLE_WORDS = new Set([
  'ក', 'ខ', 'គ', 'ង', 'ច', 'ឆ', 'ញ', 'ដ', 'ត', 'ទ', 'ព', 'រ', 'ល', 'ស', 'ឡ',
  'ឬ', 'ឮ', 'ឪ', 'ឯ', 'ឱ', 'ឦ', 'ឧ', 'ឳ'
]);

const COENG_TA = '\u17D2\u178F';
const COENG_DA = '\u17D2\u178D';
const PATTERN_RO_OTHER = /(\u17D2\u179A)(\u17D2[^\u179A])/g;
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

// Load dictionary
const { dictPath, freqPath } = workerData;

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
      if (variant !== w) words.add(variant);
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
  } catch (e) {}
}

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

for (const w of words) {
  let cost;
  if (effectiveCounts.has(w)) {
    cost = -Math.log10(effectiveCounts.get(w) / totalTokens);
  } else {
    cost = defaultCost;
  }
  addWord(w, cost);
}

// Signal ready
parentPort.postMessage({ type: 'ready' });

// Handle messages
parentPort.on('message', (msg) => {
  if (msg.type === 'segment') {
    const { lines, startId } = msg;
    const content = lines.join('\n');
    const batchResult = segmentBatch(content);
    const resultLines = batchResult.split('\n');

    const results = [];
    for (let i = 0; i < lines.length; i++) {
      results.push(resultLines[i] ? resultLines[i].split('|') : []);
    }

    parentPort.postMessage({ type: 'results', results, startId });
  }
});
