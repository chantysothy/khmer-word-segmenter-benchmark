import { Dictionary } from './dictionary';
import { segment } from './segmenter';
import * as os from 'os';

interface Args {
  dict: string;
  freq: string;
  input: string;
  output: string | null;
  limit: number | null;
  threads: number;
}

function parseArgs(): Args {
  const args = Bun.argv.slice(2);
  const parsed: Args = {
    dict: '',
    freq: '',
    input: '',
    output: null,
    limit: null,
    threads: 0 // 0 = auto
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dict' || arg === '-d') parsed.dict = args[++i];
    else if (arg === '--freq' || arg === '-f') parsed.freq = args[++i];
    else if (arg === '--input' || arg === '-i') parsed.input = args[++i];
    else if (arg === '--output' || arg === '-o') parsed.output = args[++i];
    else if (arg === '--limit' || arg === '-l') parsed.limit = parseInt(args[++i], 10);
    else if (arg === '--threads' || arg === '-t') parsed.threads = parseInt(args[++i], 10);
  }

  if (!parsed.input) {
    console.error('Usage: bun run src/index.ts --dict <path> --freq <path> --input <path> [--output <path>]');
    console.error('Options:');
    console.error('  --output, -o <path>  Output file (optional, skip to benchmark only)');
    console.error('  --limit, -l <n>      Limit number of lines');
    console.error('  --threads, -t <n>    Number of worker threads (0 = auto)');
    process.exit(1);
  }

  return parsed;
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

interface WorkerMessage {
  type: 'ready' | 'results' | 'error';
  results?: string[][];
  startId?: number;
  error?: string;
}

async function runParallel(args: Args, linesToProcess: string[], dict: Dictionary): Promise<string[]> {
  const numWorkers = args.threads > 0 ? args.threads : Math.min(os.cpus().length, 8);
  console.log(`Using ${numWorkers} worker threads...`);

  const workerPath = new URL('./worker.ts', import.meta.url).href;
  const results: string[] = new Array(linesToProcess.length);
  const workerPromises: Promise<void>[] = [];

  // Split work into chunks
  const chunkSize = Math.ceil(linesToProcess.length / numWorkers);

  for (let w = 0; w < numWorkers; w++) {
    const startIdx = w * chunkSize;
    const endIdx = Math.min(startIdx + chunkSize, linesToProcess.length);

    if (startIdx >= linesToProcess.length) break;

    const chunk = linesToProcess.slice(startIdx, endIdx);

    const workerPromise = new Promise<void>((resolve, reject) => {
      const worker = new Worker(workerPath);

      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const msg = event.data;
        if (msg.type === 'ready') {
          // Worker is ready, send work
          worker.postMessage({
            type: 'segment',
            lines: chunk,
            startId: startIdx
          });
        } else if (msg.type === 'results') {
          // Store results with fast JSON builder
          for (let i = 0; i < msg.results!.length; i++) {
            const idx = startIdx + i;
            results[idx] = toJson(idx, linesToProcess[idx], msg.results![i]);
          }
          worker.terminate();
          resolve();
        } else if (msg.type === 'error') {
          reject(new Error(msg.error));
        }
      };

      worker.onerror = (err) => {
        reject(err);
      };

      // Initialize worker with dictionary paths
      worker.postMessage({
        type: 'init',
        dictPath: args.dict,
        freqPath: args.freq
      });
    });

    workerPromises.push(workerPromise);
  }

  await Promise.all(workerPromises);
  return results;
}

async function runSingleThreaded(args: Args, linesToProcess: string[], dict: Dictionary): Promise<string[]> {
  console.log('Running single-threaded...');
  const results: string[] = new Array(linesToProcess.length);
  for (let i = 0; i < linesToProcess.length; i++) {
    const segments = segment(linesToProcess[i], dict);
    results[i] = toJson(i, linesToProcess[i], segments);
  }
  return results;
}

async function main() {
  const args = parseArgs();

  console.log('Initializing Bun Segmenter...');
  const startLoad = performance.now();

  // Initialize dictionary
  const dict = new Dictionary();

  // Load dictionary using Bun.file (fast native file I/O)
  if (args.dict) {
    const dictFile = Bun.file(args.dict);
    const dictContent = await dictFile.text();
    dict.loadDictionary(dictContent);
  }

  // Load frequencies
  if (args.freq) {
    const freqFile = Bun.file(args.freq);
    const freqContent = await freqFile.text();
    const freqData = JSON.parse(freqContent);
    dict.loadFrequencies(freqData);
  }

  const loadTime = (performance.now() - startLoad) / 1000;
  console.log(`Model loaded in ${loadTime.toFixed(2)}s (${dict.size} words)`);

  // Load input
  const inputFile = Bun.file(args.input);
  const inputContent = await inputFile.text();
  // Trim lines to match Python's line.strip() behavior
  let lines = inputContent.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

  if (args.limit && args.limit > 0) {
    lines = lines.slice(0, args.limit);
  }

  console.log(`Processing ${lines.length} lines...`);
  const startProc = performance.now();

  let results: string[];

  // Use parallel processing if we have enough work and multiple CPUs
  const useParallel = lines.length >= 100 && (args.threads === 0 ? os.cpus().length > 1 : args.threads > 1);

  if (useParallel) {
    results = await runParallel(args, lines, dict);
  } else {
    results = await runSingleThreaded(args, lines, dict);
  }

  const procTime = (performance.now() - startProc) / 1000;

  // Write output if path provided
  if (args.output) {
    const outputLines = results.join('\n') + '\n';
    await Bun.write(args.output, outputLines);
    console.log(`Done. Saved to ${args.output}`);
  }

  console.log(`Time taken: ${procTime.toFixed(2)}s`);
  console.log(`Speed: ${(lines.length / procTime).toFixed(2)} lines/sec`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
