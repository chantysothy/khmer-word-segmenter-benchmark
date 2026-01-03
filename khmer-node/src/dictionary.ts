import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { isValidSingleWord } from './constants';

// Khmer Unicode range constants for Trie optimization
const KHMER_START = 0x1780;
const KHMER_END = 0x17FF;
const KHMER_RANGE = KHMER_END - KHMER_START + 1; // 128

// Trie node with flat array optimization for Khmer range
class TrieNode {
    // Flat array for O(1) Khmer character lookup (0x1780-0x17FF)
    khmerChildren: (TrieNode | null)[] | null = null;
    // Fallback map for non-Khmer characters
    otherChildren: Map<number, TrieNode> | null = null;
    isWord: boolean = false;
    cost: number = 0;

    getChild(charCode: number): TrieNode | null {
        if (charCode >= KHMER_START && charCode <= KHMER_END) {
            if (!this.khmerChildren) return null;
            return this.khmerChildren[charCode - KHMER_START];
        }
        if (!this.otherChildren) return null;
        return this.otherChildren.get(charCode) || null;
    }

    getOrCreateChild(charCode: number): TrieNode {
        if (charCode >= KHMER_START && charCode <= KHMER_END) {
            if (!this.khmerChildren) {
                this.khmerChildren = new Array(KHMER_RANGE).fill(null);
            }
            const idx = charCode - KHMER_START;
            if (!this.khmerChildren[idx]) {
                this.khmerChildren[idx] = new TrieNode();
            }
            return this.khmerChildren[idx]!;
        }
        // Non-Khmer: use map
        if (!this.otherChildren) {
            this.otherChildren = new Map();
        }
        let child = this.otherChildren.get(charCode);
        if (!child) {
            child = new TrieNode();
            this.otherChildren.set(charCode, child);
        }
        return child;
    }
}

export class Dictionary {
    words: Map<string, number>; // Maps word -> cost
    maxWordLength: number;
    defaultCost: number;
    unknownCost: number;
    // Optimized Trie for fast lookups
    private trie: TrieNode;

    constructor() {
        this.words = new Map();
        this.maxWordLength = 0;
        this.defaultCost = 10.0;
        this.unknownCost = 20.0;
        this.trie = new TrieNode();
    }

    async load(dictPath: string, freqPath: string): Promise<void> {
        // Temporary storage
        const tempWords = new Set<string>();
        let maxLen = 0;

        // 1. Load Words
        await this.loadWords(dictPath, tempWords);

        // Update max length from loaded words
        for (const w of tempWords) {
            if (w.length > maxLen) maxLen = w.length;
        }
        this.maxWordLength = maxLen;

        // 2. Load Frequencies & Calculate Costs
        await this.calculateCosts(freqPath, tempWords);

        // 3. Build Trie from dictionary
        this.buildTrie();
    }

    private async loadWords(filePath: string, wordsSet: Set<string>): Promise<void> {
        if (!fs.existsSync(filePath)) {
            console.error(`Dictionary file not found: ${filePath}`);
            return;
        }

        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        const wordsToRemove = new Set<string>();

        for await (const line of rl) {
            const word = line.trim();
            if (!word) continue;

            // Filter single chars
            if ([...word].length === 1) {
                if (!isValidSingleWord(word)) continue;
            }

            wordsSet.add(word);

            // Generate variants
            const variants = this.generateVariants(word);
            for (const v of variants) {
                wordsSet.add(v);
            }
        }

        // Filter logic (porting from Rust/Python)
        // Note: Iterating over a Set while modifying it is tricky in some languages,
        // but JS Sets iterate over insertion order. New items are added to end.
        // Here we just want to find items to remove.
        for (const word of wordsSet) {
             if (word.includes('ឬ') && [...word].length > 1) {
                if (word.startsWith('ឬ')) {
                    const suffix = [...word].slice(1).join('');
                    if (wordsSet.has(suffix)) wordsToRemove.add(word);
                } else if (word.endsWith('ឬ')) {
                    const chars = [...word];
                    chars.pop();
                    const prefix = chars.join('');
                    if (wordsSet.has(prefix)) wordsToRemove.add(word);
                } else {
                    const parts = word.split('ឬ');
                    if (parts.every(p => wordsSet.has(p) || p === '')) {
                         wordsToRemove.add(word);
                    }
                }
             }
             if (word.includes('ៗ')) wordsToRemove.add(word);
             if (word.startsWith('\u17D2')) wordsToRemove.add(word);
        }

        for (const w of wordsToRemove) {
            wordsSet.delete(w);
        }
        if (wordsSet.has("ៗ")) wordsSet.delete("ៗ");
    }

    private async calculateCosts(freqPath: string, wordsSet: Set<string>): Promise<void> {
        if (!fs.existsSync(freqPath)) {
            console.log("Frequency file not found. Using defaults.");
            // Fill dictionary with default costs
            for (const word of wordsSet) {
                this.words.set(word, this.defaultCost);
            }
            return;
        }

        const rawData = await fs.promises.readFile(freqPath, 'utf-8');
        const data: Record<string, number> = JSON.parse(rawData);

        const minFreqFloor = 5.0;
        let totalTokens = 0.0;
        const effectiveCounts = new Map<string, number>();

        for (const [word, count] of Object.entries(data)) {
            const eff = Math.max(count, minFreqFloor);
            effectiveCounts.set(word, eff);

            const variants = this.generateVariants(word);
            for (const v of variants) {
                if (!effectiveCounts.has(v)) {
                    effectiveCounts.set(v, eff);
                }
            }

            // Note: In logic, we should probably only sum unique words, but the Python logic
            // summed as it iterated. We'll stick to a simple sum loop.
        }

        // Recalculate total tokens correctly based on effective counts
        for (const count of effectiveCounts.values()) {
            totalTokens += count;
        }

        if (totalTokens > 0.0) {
            const minProb = minFreqFloor / totalTokens;
            this.defaultCost = -Math.log10(minProb);
            this.unknownCost = this.defaultCost + 5.0;

            for (const word of wordsSet) {
                if (effectiveCounts.has(word)) {
                    const count = effectiveCounts.get(word)!;
                    const prob = count / totalTokens;
                    if (prob > 0.0) {
                        this.words.set(word, -Math.log10(prob));
                    } else {
                         this.words.set(word, this.defaultCost);
                    }
                } else {
                    this.words.set(word, this.defaultCost);
                }
            }
        } else {
             for (const word of wordsSet) {
                this.words.set(word, this.defaultCost);
            }
        }
    }

    contains(word: string): boolean {
        return this.words.has(word);
    }

    getWordCost(word: string): number {
        const cost = this.words.get(word);
        return cost !== undefined ? cost : this.unknownCost;
    }

    private generateVariants(word: string): Set<string> {
        const variants = new Set<string>();
        const coengTa = "\u17D2\u178F";
        const coengDa = "\u17D2\u178D";

        // 1. Ta/Da Swapping
        if (word.includes(coengTa)) {
            variants.add(word.replaceAll(coengTa, coengDa));
        }
        if (word.includes(coengDa)) {
            variants.add(word.replaceAll(coengDa, coengTa));
        }

        // 2. Coeng Ro Ordering
        const baseSet = new Set(variants);
        baseSet.add(word);

        const coeng = '\u17D2';
        const ro = '\u179A';

        for (const w of baseSet) {
            const chars = [...w]; // Array of chars (handling surrogate pairs properly if any, though Khmer is mostly BMP, but spread syntax is safe)
            const n = chars.length;
            if (n < 4) continue;

            // Pass 1: Ro + Other -> Other + Ro
            const newChars1 = [...chars];
            let modified1 = false;
            let i = 0;
            while (i + 3 < newChars1.length) {
                const c0 = newChars1[i];
                const c1 = newChars1[i+1];
                const c2 = newChars1[i+2];
                const c3 = newChars1[i+3];

                if (c0 === coeng && c1 === ro && c2 === coeng && c3 !== ro) {
                    newChars1[i] = c2;
                    newChars1[i+1] = c3;
                    newChars1[i+2] = c0;
                    newChars1[i+3] = c1;
                    modified1 = true;
                    i += 4;
                } else {
                    i += 1;
                }
            }
            if (modified1) variants.add(newChars1.join(''));

            // Pass 2: Other + Ro -> Ro + Other
            const newChars2 = [...chars];
            let modified2 = false;
            i = 0;
            while (i + 3 < newChars2.length) {
                const c0 = newChars2[i];
                const c1 = newChars2[i+1];
                const c2 = newChars2[i+2];
                const c3 = newChars2[i+3];

                if (c0 === coeng && c1 !== ro && c2 === coeng && c3 === ro) {
                    newChars2[i] = c2;
                    newChars2[i+1] = c3;
                    newChars2[i+2] = c0;
                    newChars2[i+3] = c1;
                    modified2 = true;
                    i += 4;
                } else {
                    i += 1;
                }
            }
            if (modified2) variants.add(newChars2.join(''));
        }

        return variants;
    }

    // Build Trie from dictionary words
    private buildTrie(): void {
        for (const [word, cost] of this.words) {
            this.insertIntoTrie(word, cost);
        }
    }

    // Insert word into Trie
    private insertIntoTrie(word: string, cost: number): void {
        let node = this.trie;
        for (let i = 0; i < word.length; i++) {
            const charCode = word.charCodeAt(i);
            node = node.getOrCreateChild(charCode);
        }
        node.isWord = true;
        node.cost = cost;
    }

    // Lookup text range in Trie (zero allocation) - returns cost or -1 if not found
    lookupRange(text: string, start: number, end: number): number {
        let node: TrieNode | null = this.trie;
        for (let i = start; i < end; i++) {
            const charCode = text.charCodeAt(i);
            node = node.getChild(charCode);
            if (!node) return -1;
        }
        return node.isWord ? node.cost : -1;
    }
}
