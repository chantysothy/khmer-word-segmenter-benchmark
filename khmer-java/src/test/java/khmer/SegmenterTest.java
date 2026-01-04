package khmer;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for Khmer Word Segmenter.
 * Tests against the shared test cases to ensure 100% match with Python baseline.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
public class SegmenterTest {

    private KhmerSegmenter segmenter;
    private List<TestCase> testCases;

    static class TestCase {
        int id;
        String input;
        String description;
        List<String> expected;
    }

    @BeforeAll
    void setUp() throws IOException {
        // Find data directory
        Path dataDir = Paths.get("../data");
        if (!Files.exists(dataDir)) {
            dataDir = Paths.get("data");
        }

        String dictPath = dataDir.resolve("khmer_dictionary_words.txt").toString();
        String freqPath = dataDir.resolve("khmer_word_frequencies.json").toString();
        Path testCasesPath = dataDir.resolve("test_cases.json");

        // Initialize segmenter
        Dictionary dictionary = new Dictionary(dictPath, freqPath);
        segmenter = new KhmerSegmenter(dictionary);

        // Load test cases
        Gson gson = new Gson();
        Type listType = new TypeToken<List<TestCase>>() {}.getType();
        try (Reader reader = Files.newBufferedReader(testCasesPath, StandardCharsets.UTF_8)) {
            testCases = gson.fromJson(reader, listType);
        }
    }

    @Test
    void testAllCasesMatchExpected() {
        StringBuilder failures = new StringBuilder();
        int failCount = 0;

        for (TestCase tc : testCases) {
            List<String> result = segmenter.segment(tc.input);
            if (!result.equals(tc.expected)) {
                failCount++;
                failures.append(String.format("[%d] %s%n", tc.id, tc.description));
                failures.append(String.format("  Input: %s%n", tc.input));
                failures.append(String.format("  Expected: %s%n", tc.expected));
                failures.append(String.format("  Actual: %s%n", result));
            }
        }

        if (failCount > 0) {
            fail(String.format("%d/%d test cases failed:%n%s", failCount, testCases.size(), failures));
        }
    }

    @Test
    void testSingleKnownWord() {
        List<String> result = segmenter.segment("សួស្តី");
        assertEquals(List.of("សួស្តី"), result);

        result = segmenter.segment("កម្ពុជា");
        assertEquals(List.of("កម្ពុជា"), result);
    }

    @Test
    void testMultipleWords() {
        List<String> result = segmenter.segment("ខ្ញុំស្រលាញ់កម្ពុជា");
        assertEquals(List.of("ខ្ញុំ", "ស្រលាញ់", "កម្ពុជា"), result);
    }

    @Test
    void testWithSpaces() {
        List<String> result = segmenter.segment("សួស្តី បង");
        assertEquals(List.of("សួស្តី", " ", "បង"), result);
    }

    @Test
    void testNumbers() {
        List<String> result = segmenter.segment("១២៣៤៥");
        assertEquals(List.of("១២៣៤៥"), result);
    }

    @Test
    void testEmptyString() {
        List<String> result = segmenter.segment("");
        assertTrue(result.isEmpty());
    }

    @Test
    void testSpaceBeforeSignPattern() {
        // Regression test for the fix
        List<String> result = segmenter.segment("សម្រា ប់ការ");
        assertEquals(List.of("ស", "ម្រា ប់", "ការ"), result);
    }

    @Test
    void testPunctuation() {
        List<String> result = segmenter.segment("សួស្តី។");
        assertEquals(List.of("សួស្តី", "។"), result);
    }
}
