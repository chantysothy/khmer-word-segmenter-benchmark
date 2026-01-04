/**
 * Unit tests for Khmer Word Segmenter.
 * Tests against the shared test cases to ensure 100% match with Python baseline.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Dictionary } from '../src/dictionary';
import { KhmerSegmenter } from '../src/segmenter';

interface TestCase {
    id: number;
    input: string;
    description: string;
    expected: string[];
}

describe('KhmerSegmenter', () => {
    let segmenter: KhmerSegmenter;
    let testCases: TestCase[];

    beforeAll(() => {
        // Find data directory
        let dataDir = path.join(__dirname, '..', '..', 'data');
        if (!fs.existsSync(dataDir)) {
            dataDir = path.join(__dirname, '..', 'data');
        }

        const dictPath = path.join(dataDir, 'khmer_dictionary_words.txt');
        const freqPath = path.join(dataDir, 'khmer_word_frequencies.json');
        const testCasesPath = path.join(dataDir, 'test_cases.json');

        // Initialize segmenter
        const dictionary = new Dictionary(dictPath, freqPath);
        segmenter = new KhmerSegmenter(dictionary);

        // Load test cases
        testCases = JSON.parse(fs.readFileSync(testCasesPath, 'utf-8'));
    });

    it('should match all expected outputs', () => {
        const failures: string[] = [];

        for (const tc of testCases) {
            const result = segmenter.segment(tc.input);
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
        expect(segmenter.segment('សួស្តី')).toEqual(['សួស្តី']);
        expect(segmenter.segment('កម្ពុជា')).toEqual(['កម្ពុជា']);
    });

    it('should segment multiple words', () => {
        expect(segmenter.segment('ខ្ញុំស្រលាញ់កម្ពុជា')).toEqual(['ខ្ញុំ', 'ស្រលាញ់', 'កម្ពុជា']);
    });

    it('should preserve spaces', () => {
        expect(segmenter.segment('សួស្តី បង')).toEqual(['សួស្តី', ' ', 'បង']);
    });

    it('should handle numbers', () => {
        expect(segmenter.segment('១២៣៤៥')).toEqual(['១២៣៤៥']);
    });

    it('should handle empty string', () => {
        expect(segmenter.segment('')).toEqual([]);
    });

    it('should handle space before sign pattern (regression)', () => {
        expect(segmenter.segment('សម្រា ប់ការ')).toEqual(['ស', 'ម្រា ប់', 'ការ']);
    });

    it('should handle punctuation', () => {
        expect(segmenter.segment('សួស្តី។')).toEqual(['សួស្តី', '។']);
    });
});
