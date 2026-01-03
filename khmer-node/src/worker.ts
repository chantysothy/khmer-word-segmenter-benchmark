import { parentPort, workerData } from 'worker_threads';
import { Dictionary } from './dictionary';
import { KhmerSegmenter } from './segmenter';

interface WorkerData {
    dictPath: string;
    freqPath: string;
}

interface WorkerMessage {
    type: 'segment';
    lines: string[];
    startId: number;
}

interface WorkerResult {
    type: 'results';
    results: string[];
}

async function main() {
    const { dictPath, freqPath } = workerData as WorkerData;

    // Load dictionary in worker
    const dictionary = new Dictionary();
    await dictionary.load(dictPath, freqPath);
    const segmenter = new KhmerSegmenter(dictionary);

    // Signal ready
    parentPort!.postMessage({ type: 'ready' });

    // Handle messages
    parentPort!.on('message', (msg: WorkerMessage) => {
        if (msg.type === 'segment') {
            const results: string[] = [];
            for (let i = 0; i < msg.lines.length; i++) {
                const line = msg.lines[i];
                const segments = segmenter.segment(line);
                const record = JSON.stringify({
                    id: msg.startId + i,
                    input: line,
                    segments: segments
                });
                results.push(record);
            }
            const response: WorkerResult = { type: 'results', results };
            parentPort!.postMessage(response);
        }
    });
}

main().catch(err => {
    console.error('Worker error:', err);
    process.exit(1);
});
