// Khmer Unicode range for flat array optimization
const KHMER_START: i32 = 0x1780;
const KHMER_END: i32 = 0x17FF;
const KHMER_RANGE: i32 = KHMER_END - KHMER_START + 1; // 128

// Trie node with flat array optimization for Khmer range
class TrieNode {
  // Flat array for O(1) Khmer character lookup (indices 0-127)
  khmerChildren: StaticArray<TrieNode | null> | null = null;
  // Fallback map for non-Khmer characters
  otherChildren: Map<i32, TrieNode> | null = null;
  isWord: boolean = false;
  cost: f32 = 0;

  getChild(charCode: i32): TrieNode | null {
    if (charCode >= KHMER_START && charCode <= KHMER_END) {
      if (this.khmerChildren === null) return null;
      return this.khmerChildren![charCode - KHMER_START];
    }
    if (this.otherChildren === null) return null;
    if (this.otherChildren!.has(charCode)) {
      return this.otherChildren!.get(charCode);
    }
    return null;
  }

  getOrCreateChild(charCode: i32): TrieNode {
    if (charCode >= KHMER_START && charCode <= KHMER_END) {
      if (this.khmerChildren === null) {
        this.khmerChildren = new StaticArray<TrieNode | null>(KHMER_RANGE);
        for (let i = 0; i < KHMER_RANGE; i++) {
          this.khmerChildren![i] = null;
        }
      }
      const idx = charCode - KHMER_START;
      if (this.khmerChildren![idx] === null) {
        this.khmerChildren![idx] = new TrieNode();
      }
      return this.khmerChildren![idx]!;
    }
    // Non-Khmer: use map
    if (this.otherChildren === null) {
      this.otherChildren = new Map<i32, TrieNode>();
    }
    if (!this.otherChildren!.has(charCode)) {
      this.otherChildren!.set(charCode, new TrieNode());
    }
    return this.otherChildren!.get(charCode);
  }
}

export class Dictionary {
  private trie: TrieNode;
  public maxWordLength: i32;
  public unknownCost: f32;

  constructor() {
    this.trie = new TrieNode();
    this.maxWordLength = 0;
    this.unknownCost = 15.0;
  }

  public add(word: string, cost: f32): void {
    let node = this.trie;
    const len = word.length;
    for (let i = 0; i < len; i++) {
      const charCode = word.charCodeAt(i);
      node = node.getOrCreateChild(charCode);
    }
    node.isWord = true;
    node.cost = cost;
    if (len > this.maxWordLength) {
      this.maxWordLength = len;
    }
  }

  // Lookup text range in Trie (zero allocation!) - returns cost or -1 if not found
  public lookupRange(text: string, start: i32, end: i32): f32 {
    let node: TrieNode | null = this.trie;
    for (let i = start; i < end; i++) {
      const charCode = text.charCodeAt(i);
      node = node!.getChild(charCode);
      if (node === null) return -1.0;
    }
    return node!.isWord ? node!.cost : -1.0;
  }

  // Old methods for compatibility
  public contains(word: string): boolean {
    let node: TrieNode | null = this.trie;
    const len = word.length;
    for (let i = 0; i < len; i++) {
      const charCode = word.charCodeAt(i);
      node = node!.getChild(charCode);
      if (node === null) return false;
    }
    return node!.isWord;
  }

  public getCost(word: string): f32 {
    let node: TrieNode | null = this.trie;
    const len = word.length;
    for (let i = 0; i < len; i++) {
      const charCode = word.charCodeAt(i);
      node = node!.getChild(charCode);
      if (node === null) return this.unknownCost;
    }
    return node!.isWord ? node!.cost : this.unknownCost;
  }
}

export const globalDict = new Dictionary();
