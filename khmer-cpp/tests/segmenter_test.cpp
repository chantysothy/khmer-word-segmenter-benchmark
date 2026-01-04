/**
 * Unit tests for Khmer Word Segmenter.
 * Tests against the shared test cases to ensure 100% match with Python baseline.
 */

#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <cassert>
#include "../include/segmenter.h"
#include "../include/dictionary.h"
#include "../libs/json.hpp"

using json = nlohmann::json;

struct TestCase {
    int id;
    std::string input;
    std::string description;
    std::vector<std::string> expected;
};

class SegmenterTest {
private:
    khmer::Dictionary* dictionary;
    khmer::Segmenter* segmenter;
    std::vector<TestCase> testCases;
    int passCount = 0;
    int failCount = 0;

public:
    SegmenterTest() {
        // Find data directory
        std::string dataDir = "../data";
        std::ifstream testFile(dataDir + "/test_cases.json");
        if (!testFile.good()) {
            dataDir = "../../data";
        }

        std::string dictPath = dataDir + "/khmer_dictionary_words.txt";
        std::string freqPath = dataDir + "/khmer_word_frequencies.json";
        std::string testCasesPath = dataDir + "/test_cases.json";

        // Initialize dictionary and segmenter
        dictionary = new khmer::Dictionary(dictPath, freqPath);
        segmenter = new khmer::Segmenter(dictionary);

        // Load test cases
        std::ifstream file(testCasesPath);
        if (!file.is_open()) {
            throw std::runtime_error("Failed to open test cases file: " + testCasesPath);
        }
        json j;
        file >> j;

        for (const auto& tc : j) {
            TestCase testCase;
            testCase.id = tc["id"];
            testCase.input = tc["input"];
            testCase.description = tc["description"];
            for (const auto& exp : tc["expected"]) {
                testCase.expected.push_back(exp);
            }
            testCases.push_back(testCase);
        }
    }

    ~SegmenterTest() {
        delete segmenter;
        delete dictionary;
    }

    void runTest(const std::string& name, std::function<bool()> test) {
        std::cout << "  " << name << "... ";
        try {
            if (test()) {
                std::cout << "PASSED" << std::endl;
                passCount++;
            } else {
                std::cout << "FAILED" << std::endl;
                failCount++;
            }
        } catch (const std::exception& e) {
            std::cout << "FAILED (exception: " << e.what() << ")" << std::endl;
            failCount++;
        }
    }

    bool vectorsEqual(const std::vector<std::string>& a, const std::vector<std::string>& b) {
        if (a.size() != b.size()) return false;
        for (size_t i = 0; i < a.size(); i++) {
            if (a[i] != b[i]) return false;
        }
        return true;
    }

    void testAllCasesMatchExpected() {
        runTest("All cases match expected", [this]() {
            std::vector<std::string> failures;
            for (const auto& tc : testCases) {
                auto result = segmenter->segment(tc.input);
                if (!vectorsEqual(result, tc.expected)) {
                    std::ostringstream oss;
                    oss << "[" << tc.id << "] " << tc.description;
                    failures.push_back(oss.str());
                }
            }
            if (!failures.empty()) {
                std::cerr << "\n    " << failures.size() << "/" << testCases.size() << " test cases failed" << std::endl;
                for (const auto& f : failures) {
                    std::cerr << "      " << f << std::endl;
                }
                return false;
            }
            return true;
        });
    }

    void testSingleKnownWord() {
        runTest("Single known word", [this]() {
            auto result = segmenter->segment("សួស្តី");
            return vectorsEqual(result, {"សួស្តី"});
        });
    }

    void testMultipleWords() {
        runTest("Multiple words", [this]() {
            auto result = segmenter->segment("ខ្ញុំស្រលាញ់កម្ពុជា");
            return vectorsEqual(result, {"ខ្ញុំ", "ស្រលាញ់", "កម្ពុជា"});
        });
    }

    void testWithSpaces() {
        runTest("With spaces", [this]() {
            auto result = segmenter->segment("សួស្តី បង");
            return vectorsEqual(result, {"សួស្តី", " ", "បង"});
        });
    }

    void testNumbers() {
        runTest("Numbers", [this]() {
            auto result = segmenter->segment("១២៣៤៥");
            return vectorsEqual(result, {"១២៣៤៥"});
        });
    }

    void testEmptyString() {
        runTest("Empty string", [this]() {
            auto result = segmenter->segment("");
            return result.empty();
        });
    }

    void testSpaceBeforeSignPattern() {
        runTest("Space before sign pattern (regression)", [this]() {
            auto result = segmenter->segment("សម្រា ប់ការ");
            return vectorsEqual(result, {"ស", "ម្រា ប់", "ការ"});
        });
    }

    void testPunctuation() {
        runTest("Punctuation", [this]() {
            auto result = segmenter->segment("សួស្តី។");
            return vectorsEqual(result, {"សួស្តី", "។"});
        });
    }

    void runAll() {
        std::cout << "\nRunning Khmer Segmenter Tests..." << std::endl;
        std::cout << "================================" << std::endl;

        testAllCasesMatchExpected();
        testSingleKnownWord();
        testMultipleWords();
        testWithSpaces();
        testNumbers();
        testEmptyString();
        testSpaceBeforeSignPattern();
        testPunctuation();

        std::cout << "================================" << std::endl;
        std::cout << "Results: " << passCount << " passed, " << failCount << " failed" << std::endl;
    }

    int getFailCount() const { return failCount; }
};

int main() {
    try {
        SegmenterTest tests;
        tests.runAll();
        return tests.getFailCount() > 0 ? 1 : 0;
    } catch (const std::exception& e) {
        std::cerr << "Test setup failed: " << e.what() << std::endl;
        return 1;
    }
}
