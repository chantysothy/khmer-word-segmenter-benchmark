/**
 * Unit tests for Khmer Word Segmenter (WASM/AssemblyScript).
 * Tests against the shared test cases to ensure 100% match with Python baseline.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// WASM module exports
let wasmModule: any;
let segmenter: any;

interface TestCase {
    id: number;
    input: string;
    description: string;
    expected: string[];
}

describe('KhmerSegmenter WASM', () => {
    let testCases: TestCase[];

    beforeAll(async () => {
        // Find data directory
        let dataDir = path.join(__dirname, '..', '..', 'data');
        if (!fs.existsSync(dataDir)) {
            dataDir = path.join(__dirname, '..', 'data');
        }

        const dictPath = path.join(dataDir, 'khmer_dictionary_words.txt');
        const freqPath = path.join(dataDir, 'khmer_word_frequencies.json');
        const testCasesPath = path.join(dataDir, 'test_cases.json');

        // Load WASM module
        const wasmPath = path.join(__dirname, '..', 'build', 'release.js');
        wasmModule = await import(wasmPath);

        // Initialize dictionary and segmenter
        const dictContent = fs.readFileSync(dictPath, 'utf-8');
        const freqContent = fs.readFileSync(freqPath, 'utf-8');

        wasmModule.initDictionary(dictContent, freqContent);

        // Load test cases
        testCases = JSON.parse(fs.readFileSync(testCasesPath, 'utf-8'));
    });

    it('should match all expected outputs', () => {
        const failures: string[] = [];

        for (const tc of testCases) {
            const resultJson = wasmModule.segment(tc.input);
            const result = JSON.parse(resultJson);

            if (JSON.stringify(result) !== JSON.stringify(tc.expected)) {
                failures.push(
                    `[${tc.id}] ${tc.description}\n` +
                    `  Input: ${tc.input}\n` +
                    `  Expected: ${JSON.stringify(tc.expected)}\n` +
                    `  Actual: ${JSON.stringify(result)}`
                );
            }
        }

        if (failures.length > 0) {
            throw new Error(
                `${failures.length}/${testCases.length} test cases failed:\n${failures.join('\n')}`
            );
        }
    });

    it('should segment single known word', () => {
        const result = JSON.parse(wasmModule.segment('សួស្តី'));
        expect(result).toEqual(['សួស្តី']);
    });

    it('should segment multiple words', () => {
        const result = JSON.parse(wasmModule.segment('ខ្ញុំស្រលាញ់កម្ពុជា'));
        expect(result).toEqual(['ខ្ញុំ', 'ស្រលាញ់', 'កម្ពុជា']);
    });

    it('should preserve spaces', () => {
        const result = JSON.parse(wasmModule.segment('សួស្តី បង'));
        expect(result).toEqual(['សួស្តី', ' ', 'បង']);
    });

    it('should handle numbers', () => {
        const result = JSON.parse(wasmModule.segment('១២៣៤៥'));
        expect(result).toEqual(['១២៣៤៥']);
    });

    it('should handle empty string', () => {
        const result = JSON.parse(wasmModule.segment(''));
        expect(result).toEqual([]);
    });

    it('should handle space before sign pattern (regression)', () => {
        const result = JSON.parse(wasmModule.segment('សម្រា ប់ការ'));
        expect(result).toEqual(['ស', 'ម្រា ប់', 'ការ']);
    });

    it('should handle punctuation', () => {
        const result = JSON.parse(wasmModule.segment('សួស្តី។'));
        expect(result).toEqual(['សួស្តី', '។']);
    });
});
