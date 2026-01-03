
// Map is available in AssemblyScript stdlib
export class Dictionary {
  private words: Map<string, f32>;
  public maxWordLength: i32;
  public unknownCost: f32;

  constructor() {
    this.words = new Map<string, f32>();
    this.maxWordLength = 0;
    this.unknownCost = 15.0;
  }

  public add(word: string, cost: f32): void {
    this.words.set(word, cost);
    if (word.length > this.maxWordLength) {
      this.maxWordLength = word.length;
    }
  }

  public contains(word: string): boolean {
    return this.words.has(word);
  }

  public getCost(word: string): f32 {
    if (this.words.has(word)) {
      return this.words.get(word);
    }
    return this.unknownCost;
  }
}

export const globalDict = new Dictionary();
