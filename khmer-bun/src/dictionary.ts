import * as Constants from './constants';

// Coeng characters for variant generation
const COENG_TA = '\u17D2\u178F';
const COENG_DA = '\u17D2\u178D';
const COENG_RO = '\u17D2\u179A';

// Pattern for Coeng Ro swaps
const PATTERN_RO_OTHER = /(\u17D2\u179A)(\u17D2[^\u179A])/g;
const PATTERN_OTHER_RO = /(\u17D2[^\u179A])(\u17D2\u179A)/g;

// Valid single-character words
const VALID_SINGLE_WORDS = new Set([
  'ក', 'ខ', 'គ', 'ង', 'ច', 'ឆ', 'ញ', 'ដ', 'ត', 'ទ', 'ព', 'រ', 'ល', 'ស', 'ឡ',
  'ឬ', 'ឮ', 'ឪ', 'ឯ', 'ឱ', 'ឦ', 'ឧ', 'ឳ'
]);

// Trie node for efficient prefix lookup
class TrieNode {
  children: Map<number, TrieNode> = new Map();
  cost: number = -1;
  isWord: boolean = false;
}

export class Dictionary {
  private root: TrieNode = new TrieNode();
  private words: Set<string> = new Set();
  public maxWordLength: number = 0;
  public unknownCost: number = 10.0;

  /**
   * Generates interchangeable variants for a word
   */
  private generateVariants(word: string): Set<string> {
    const variants = new Set<string>();

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
      PATTERN_RO_OTHER.lastIndex = 0;
      if (PATTERN_RO_OTHER.test(w)) {
        PATTERN_RO_OTHER.lastIndex = 0;
        variants.add(w.replace(PATTERN_RO_OTHER, '$2$1'));
      }

      // Apply Swap 2: Other -> Ro ==> Ro -> Other
      PATTERN_OTHER_RO.lastIndex = 0;
      if (PATTERN_OTHER_RO.test(w)) {
        PATTERN_OTHER_RO.lastIndex = 0;
        variants.add(w.replace(PATTERN_OTHER_RO, '$2$1'));
      }
    }

    return variants;
  }

  /**
   * Load dictionary from file content
   */
  loadDictionary(content: string): void {
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const w = line.trim();
      if (!w) continue;

      // Filter single-character words that are NOT valid single consonants
      if (w.length === 1 && !VALID_SINGLE_WORDS.has(w)) continue;

      this.words.add(w);

      // Generate and add variants
      const variants = this.generateVariants(w);
      for (const variant of variants) {
        if (variant !== w) {
          this.words.add(variant);
        }
      }
    }

    // Post-filter: Remove compound ORs
    this.postFilterCompoundOrs();

    // Remove standalone ៗ
    this.words.delete('ៗ');
  }

  /**
   * Post-filter compound OR words
   */
  private postFilterCompoundOrs(): void {
    const wordsToRemove = new Set<string>();

    for (const word of this.words) {
      if (word.includes('ឬ') && word.length > 1) {
        if (word.startsWith('ឬ')) {
          const suffix = word.slice(1);
          if (this.words.has(suffix)) {
            wordsToRemove.add(word);
          }
        } else if (word.endsWith('ឬ')) {
          const prefix = word.slice(0, -1);
          if (this.words.has(prefix)) {
            wordsToRemove.add(word);
          }
        } else {
          const parts = word.split('ឬ');
          if (parts.every(p => this.words.has(p) || p === '')) {
            wordsToRemove.add(word);
          }
        }
      }

      if (word.includes('ៗ')) {
        wordsToRemove.add(word);
      }

      if (word.startsWith('\u17D2')) {
        wordsToRemove.add(word);
      }
    }

    for (const w of wordsToRemove) {
      this.words.delete(w);
    }
  }

  /**
   * Load frequencies and build Trie
   */
  loadFrequencies(freqData: Record<string, number>): void {
    const MIN_FREQ_FLOOR = 5.0;

    // Build effective counts with variants
    const effectiveCounts = new Map<string, number>();
    let totalTokens = 0;

    for (const [word, count] of Object.entries(freqData)) {
      const eff = Math.max(count, MIN_FREQ_FLOOR);
      effectiveCounts.set(word, eff);

      // Add variants with SAME frequency
      const variants = this.generateVariants(word);
      for (const v of variants) {
        if (!effectiveCounts.has(v)) {
          effectiveCounts.set(v, eff);
        }
      }

      // Total tokens from primary words only
      totalTokens += eff;
    }

    if (totalTokens <= 0) totalTokens = 1;

    // Calculate default cost for words without frequency data
    const defaultCost = -Math.log10(MIN_FREQ_FLOOR / totalTokens);

    // Build Trie from words
    for (const word of this.words) {
      let cost: number;
      if (effectiveCounts.has(word)) {
        const count = effectiveCounts.get(word)!;
        cost = -Math.log10(count / totalTokens);
      } else {
        cost = defaultCost;
      }

      this.addWord(word, cost);
    }
  }

  /**
   * Add a word to the Trie
   */
  addWord(word: string, cost: number): void {
    let node = this.root;
    for (let i = 0; i < word.length; i++) {
      const c = word.charCodeAt(i);
      let child = node.children.get(c);
      if (!child) {
        child = new TrieNode();
        node.children.set(c, child);
      }
      node = child;
    }
    node.isWord = true;
    node.cost = cost;

    if (word.length > this.maxWordLength) {
      this.maxWordLength = word.length;
    }
  }

  /**
   * Lookup word cost by range (no substring allocation)
   */
  lookupRange(text: string, start: number, end: number): number {
    let node = this.root;
    for (let i = start; i < end; i++) {
      const c = text.charCodeAt(i);
      const child = node.children.get(c);
      if (!child) return -1;
      node = child;
    }
    return node.isWord ? node.cost : -1;
  }

  /**
   * Check if word exists in dictionary
   */
  hasWord(word: string): boolean {
    return this.words.has(word);
  }

  get size(): number {
    return this.words.size;
  }
}
