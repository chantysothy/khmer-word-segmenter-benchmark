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

// Fast JSON escape (avoid regex)
function escapeJson(s: string): string {
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

// Fast JSON builder (avoids JSON.stringify overhead)
function toJson(id: number, input: string, segments: string[]): string {
    let result = '{"id":' + id + ',"input":"' + escapeJson(input) + '","segments":[';
    for (let i = 0; i < segments.length; i++) {
        if (i > 0) result += ',';
        result += '"' + escapeJson(segments[i]) + '"';
    }
    result += ']}';
    return result;
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
            const results: string[] = new Array(msg.lines.length);
            for (let i = 0; i < msg.lines.length; i++) {
                const line = msg.lines[i];
                const segments = segmenter.segment(line);
                results[i] = toJson(msg.startId + i, line, segments);
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
