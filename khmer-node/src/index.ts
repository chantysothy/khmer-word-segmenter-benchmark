import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { performance } from 'perf_hooks';
import { Worker } from 'worker_threads';
import * as os from 'os';
import { Dictionary } from './dictionary';
import { KhmerSegmenter } from './segmenter';

interface Args {
    dict: string;
    freq: string;
    input: string;
    output: string;
    limit: number | null;
    threads: number;
}

function parseArgs(): Args {
    const args = process.argv.slice(2);
    const parsed: Args = {
        dict: path.join(__dirname, '../../data/khmer_dictionary_words.txt'),
        freq: path.join(__dirname, '../../data/khmer_word_frequencies.json'),
        input: '',
        output: '',
        limit: null,
        threads: 0 // 0 = auto (use CPU count)
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--dict' || arg === '-d') {
            parsed.dict = args[++i];
        } else if (arg === '--freq' || arg === '-f') {
            parsed.freq = args[++i];
        } else if (arg === '--input' || arg === '-i') {
            parsed.input = args[++i];
        } else if (arg === '--output' || arg === '-o') {
            parsed.output = args[++i];
        } else if (arg === '--limit' || arg === '-l') {
            parsed.limit = parseInt(args[++i], 10);
        } else if (arg === '--threads' || arg === '-t') {
            parsed.threads = parseInt(args[++i], 10);
        }
    }

    if (!parsed.input || !parsed.output) {
        console.error("Usage: node dist/index.js --input <file> --output <file> [options]");
        console.error("Options:");
        console.error("  --dict, -d <path>   Path to dictionary file");
        console.error("  --freq, -f <path>   Path to frequency file");
        console.error("  --limit, -l <n>     Limit number of lines");
        console.error("  --threads, -t <n>   Number of worker threads (0 = auto)");
        process.exit(1);
    }

    return parsed;
}

async function runParallel(args: Args, linesToProcess: string[]): Promise<string[]> {
    const numWorkers = args.threads > 0 ? args.threads : os.cpus().length;
    console.log(`Using ${numWorkers} worker threads...`);

    const workerPath = path.join(__dirname, 'worker.js');
    const results: string[] = new Array(linesToProcess.length);
    const workers: Worker[] = [];
    const workerPromises: Promise<void>[] = [];

    // Split work into chunks
    const chunkSize = Math.ceil(linesToProcess.length / numWorkers);
    let completedChunks = 0;

    for (let w = 0; w < numWorkers; w++) {
        const startIdx = w * chunkSize;
        const endIdx = Math.min(startIdx + chunkSize, linesToProcess.length);

        if (startIdx >= linesToProcess.length) break;

        const chunk = linesToProcess.slice(startIdx, endIdx);

        const workerPromise = new Promise<void>((resolve, reject) => {
            const worker = new Worker(workerPath, {
                workerData: {
                    dictPath: args.dict,
                    freqPath: args.freq
                }
            });
            workers.push(worker);

            worker.on('message', (msg: any) => {
                if (msg.type === 'ready') {
                    // Worker is ready, send work
                    worker.postMessage({
                        type: 'segment',
                        lines: chunk,
                        startId: startIdx
                    });
                } else if (msg.type === 'results') {
                    // Store results
                    for (let i = 0; i < msg.results.length; i++) {
                        results[startIdx + i] = msg.results[i];
                    }
                    completedChunks++;
                    worker.terminate();
                    resolve();
                }
            });

            worker.on('error', reject);
            worker.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker exited with code ${code}`));
                }
            });
        });

        workerPromises.push(workerPromise);
    }

    await Promise.all(workerPromises);
    return results;
}

async function runSingleThreaded(args: Args, linesToProcess: string[]): Promise<string[]> {
    console.log("Running single-threaded...");
    const dictionary = new Dictionary();
    await dictionary.load(args.dict, args.freq);
    const segmenter = new KhmerSegmenter(dictionary);

    const results: string[] = [];
    for (let i = 0; i < linesToProcess.length; i++) {
        const line = linesToProcess[i];
        const segments = segmenter.segment(line);
        const record = JSON.stringify({
            id: i,
            input: line,
            segments: segments
        });
        results.push(record);
    }
    return results;
}

async function main() {
    const args = parseArgs();

    console.log("Initializing Node.js Segmenter...");
    console.log(`Dictionary: ${args.dict}`);
    console.log(`Frequencies: ${args.freq}`);

    const startLoad = performance.now();

    // Pre-load dictionary to measure load time
    const tempDict = new Dictionary();
    await tempDict.load(args.dict, args.freq);

    const loadTime = (performance.now() - startLoad) / 1000;
    console.log(`Model loaded in ${loadTime.toFixed(2)}s`);

    console.log(`Reading source: ${args.input}`);

    if (!fs.existsSync(args.input)) {
        console.error(`Input file not found: ${args.input}`);
        process.exit(1);
    }

    const fileStream = fs.createReadStream(args.input);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const linesToProcess: string[] = [];

    for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed) {
            linesToProcess.push(trimmed);
        }
        if (args.limit && linesToProcess.length >= args.limit) {
            break;
        }
    }

    console.log(`Processing ${linesToProcess.length} lines...`);
    const startProcess = performance.now();

    let results: string[];

    // Use parallel processing if we have enough work and multiple CPUs
    const useParallel = linesToProcess.length >= 100 && (args.threads === 0 ? os.cpus().length > 1 : args.threads > 1);

    if (useParallel) {
        results = await runParallel(args, linesToProcess);
    } else {
        results = await runSingleThreaded(args, linesToProcess);
    }

    // Write results
    const outputStream = fs.createWriteStream(args.output);
    for (const record of results) {
        outputStream.write(record + '\n');
    }
    outputStream.end();

    const endProcess = performance.now();
    const duration = (endProcess - startProcess) / 1000;

    console.log(`Done. Saved to ${args.output}`);
    console.log(`Time taken: ${duration.toFixed(2)}s`);
    console.log(`Speed: ${(linesToProcess.length / duration).toFixed(2)} lines/sec`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
