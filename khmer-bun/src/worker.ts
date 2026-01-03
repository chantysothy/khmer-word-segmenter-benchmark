// Worker script for parallel segmentation
import { Dictionary } from './dictionary';
import { segment } from './segmenter';

declare const self: Worker;

interface WorkerMessage {
  type: 'init' | 'segment';
  dictPath?: string;
  freqPath?: string;
  lines?: string[];
  startId?: number;
}

let dict: Dictionary | null = null;

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    // Initialize dictionary
    dict = new Dictionary();

    if (msg.dictPath) {
      const dictFile = Bun.file(msg.dictPath);
      const dictContent = await dictFile.text();
      dict.loadDictionary(dictContent);
    }

    if (msg.freqPath) {
      const freqFile = Bun.file(msg.freqPath);
      const freqContent = await freqFile.text();
      const freqData = JSON.parse(freqContent);
      dict.loadFrequencies(freqData);
    }

    self.postMessage({ type: 'ready' });
  } else if (msg.type === 'segment') {
    if (!dict || !msg.lines) {
      self.postMessage({ type: 'error', error: 'Not initialized' });
      return;
    }

    const results: string[][] = [];
    for (const line of msg.lines) {
      results.push(segment(line, dict));
    }

    self.postMessage({ type: 'results', results, startId: msg.startId });
  }
};
