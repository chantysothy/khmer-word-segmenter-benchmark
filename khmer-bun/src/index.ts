import { Dictionary } from './dictionary';
import { segment } from './segmenter';

interface OutputRecord {
  id: number;
  input: string;
  segments: string[];
}

async function main() {
  const args = Bun.argv.slice(2);
  let dictPath = '';
  let freqPath = '';
  let inputPath = '';
  let outputPath = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dict' || args[i] === '-d') dictPath = args[++i];
    else if (args[i] === '--freq' || args[i] === '-f') freqPath = args[++i];
    else if (args[i] === '--input' || args[i] === '-i') inputPath = args[++i];
    else if (args[i] === '--output' || args[i] === '-o') outputPath = args[++i];
  }

  if (!inputPath) {
    console.error('Usage: bun run src/index.ts --dict <path> --freq <path> --input <path> [--output <path>]');
    console.error('Options:');
    console.error('  --output, -o <path>  Output file (optional, skip to benchmark only)');
    process.exit(1);
  }

  console.log('Initializing Bun Segmenter...');
  const startLoad = performance.now();

  // Initialize dictionary
  const dict = new Dictionary();

  // Load dictionary using Bun.file (fast native file I/O)
  if (dictPath) {
    try {
      const dictFile = Bun.file(dictPath);
      const dictContent = await dictFile.text();
      dict.loadDictionary(dictContent);
    } catch (e) {
      console.error(`Error loading dictionary: ${e}`);
    }
  }

  // Load frequencies
  if (freqPath) {
    try {
      const freqFile = Bun.file(freqPath);
      const freqContent = await freqFile.text();
      const freqData = JSON.parse(freqContent);
      dict.loadFrequencies(freqData);
    } catch (e) {
      console.error(`Error loading frequencies: ${e}`);
    }
  }

  const loadTime = (performance.now() - startLoad) / 1000;
  console.log(`Model loaded in ${loadTime.toFixed(2)}s (${dict.size} words)`);

  // Load input
  const inputFile = Bun.file(inputPath);
  const inputContent = await inputFile.text();
  const lines = inputContent.split(/\r?\n/).filter(line => line.trim().length > 0);

  console.log(`Processing ${lines.length} lines...`);
  const startProc = performance.now();

  // Process all lines
  const results: OutputRecord[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const segments = segment(line, dict);
    results.push({
      id: i,
      input: line,
      segments: segments
    });
  }

  const procTime = (performance.now() - startProc) / 1000;

  // Write output if path provided
  if (outputPath) {
    const outputLines = results.map(r => JSON.stringify(r)).join('\n') + '\n';
    await Bun.write(outputPath, outputLines);
    console.log(`Done. Saved to ${outputPath}`);
  }

  console.log(`Time taken: ${procTime.toFixed(2)}s`);
  console.log(`Speed: ${(lines.length / procTime).toFixed(2)} lines/sec`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
