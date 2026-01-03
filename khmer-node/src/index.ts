import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { performance } from 'perf_hooks';
import { Dictionary } from './dictionary';
import { KhmerSegmenter } from './segmenter';

interface Args {
    dict: string;
    freq: string;
    input: string;
    output: string;
    limit: number | null;
}

function parseArgs(): Args {
    const args = process.argv.slice(2);
    const parsed: Args = {
        dict: path.join(__dirname, '../../data/khmer_dictionary_words.txt'),
        freq: path.join(__dirname, '../../data/khmer_word_frequencies.json'),
        input: '',
        output: '',
        limit: null
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
        }
    }

    if (!parsed.input || !parsed.output) {
        console.error("Usage: node dist/index.js --input <file> --output <file> [options]");
        process.exit(1);
    }

    return parsed;
}

async function main() {
    const args = parseArgs();

    console.log("Initializing Node.js Segmenter...");
    console.log(`Dictionary: ${args.dict}`);
    console.log(`Frequencies: ${args.freq}`);

    const startLoad = performance.now();
    const dictionary = new Dictionary();
    await dictionary.load(args.dict, args.freq);
    const segmenter = new KhmerSegmenter(dictionary);
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

    const outputStream = fs.createWriteStream(args.output);

    let count = 0;
    const linesToProcess: string[] = [];

    // We can stream process, but to measure total time including buffering overhead vs processing:
    // We'll read all valid lines first like the Rust version does (it did `lines.collect()`).
    // Or we can process streaming. Rust version loaded all into memory.
    // To match Rust memory profile comparison, loading all is fair, but streaming is "better" engineering.
    // However, for "speed" measurement of the *algorithm*, we usually isolate IO.
    // But end-to-end includes IO.
    // I will buffer all lines first to match Rust logic `let mut lines: Vec<String> = reader.lines()...`.

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

    for (let i = 0; i < linesToProcess.length; i++) {
        const line = linesToProcess[i];
        const segments = segmenter.segment(line);
        const record = JSON.stringify({
            id: i,
            input: line,
            segments: segments
        });
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
