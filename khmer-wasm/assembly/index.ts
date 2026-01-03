
import { globalDict } from "./dictionary";
import { segment as segmentInternal, segmentBatch as segmentBatchInternal } from "./segmenter";

// Exported functions for the host

export function addWord(word: string, cost: f32): void {
  globalDict.add(word, cost);
}

export function segment(text: string): string {
  return segmentInternal(text);
}

export function segmentBatch(content: string): string {
  return segmentBatchInternal(content);
}

// Optional: specific init if needed, but globals are init on instantiation
export function init(): void {
  // Reset if needed, or just let new instance handle it
}
