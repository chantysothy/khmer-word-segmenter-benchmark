using System.Text.Json;

namespace KhmerSegmenter.Tests;

/// <summary>
/// Unit tests for Khmer Word Segmenter.
/// Tests against the shared test cases to ensure 100% match with Python baseline.
/// </summary>
public class SegmenterTests
{
    private static Segmenter? _segmenter;
    private static List<TestCase>? _testCases;

    private class TestCase
    {
        public int Id { get; set; }
        public string Input { get; set; } = "";
        public string Description { get; set; } = "";
        public List<string> Expected { get; set; } = new();
    }

    [OneTimeSetUp]
    public void Setup()
    {
        // Find data directory
        var dataDir = Path.Combine("..", "..", "..", "..", "data");
        if (!Directory.Exists(dataDir))
        {
            dataDir = Path.Combine("..", "data");
        }
        if (!Directory.Exists(dataDir))
        {
            dataDir = "data";
        }

        var dictPath = Path.Combine(dataDir, "khmer_dictionary_words.txt");
        var freqPath = Path.Combine(dataDir, "khmer_word_frequencies.json");
        var testCasesPath = Path.Combine(dataDir, "test_cases.json");

        // Initialize segmenter
        var dictionary = new Dictionary(dictPath, freqPath);
        _segmenter = new Segmenter(dictionary);

        // Load test cases
        var json = File.ReadAllText(testCasesPath);
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        _testCases = JsonSerializer.Deserialize<List<TestCase>>(json, options) ?? new List<TestCase>();
    }

    [Test]
    public void AllCasesMatchExpected()
    {
        var failures = new List<string>();

        foreach (var tc in _testCases!)
        {
            var result = _segmenter!.Segment(tc.Input);
            if (!result.SequenceEqual(tc.Expected))
            {
                failures.Add($"[{tc.Id}] {tc.Description}\n" +
                           $"  Input: {tc.Input}\n" +
                           $"  Expected: [{string.Join(", ", tc.Expected.Select(s => $"\"{s}\""))}]\n" +
                           $"  Actual: [{string.Join(", ", result.Select(s => $"\"{s}\""))}]");
            }
        }

        if (failures.Count > 0)
        {
            Assert.Fail($"{failures.Count}/{_testCases.Count} test cases failed:\n{string.Join("\n", failures)}");
        }
    }

    [Test]
    public void SingleKnownWord()
    {
        var result = _segmenter!.Segment("សួស្តី");
        Assert.That(result, Is.EqualTo(new[] { "សួស្តី" }));

        result = _segmenter.Segment("កម្ពុជា");
        Assert.That(result, Is.EqualTo(new[] { "កម្ពុជា" }));
    }

    [Test]
    public void MultipleWords()
    {
        var result = _segmenter!.Segment("ខ្ញុំស្រលាញ់កម្ពុជា");
        Assert.That(result, Is.EqualTo(new[] { "ខ្ញុំ", "ស្រលាញ់", "កម្ពុជា" }));
    }

    [Test]
    public void WithSpaces()
    {
        var result = _segmenter!.Segment("សួស្តី បង");
        Assert.That(result, Is.EqualTo(new[] { "សួស្តី", " ", "បង" }));
    }

    [Test]
    public void Numbers()
    {
        var result = _segmenter!.Segment("១២៣៤៥");
        Assert.That(result, Is.EqualTo(new[] { "១២៣៤៥" }));
    }

    [Test]
    public void EmptyString()
    {
        var result = _segmenter!.Segment("");
        Assert.That(result, Is.Empty);
    }

    [Test]
    public void SpaceBeforeSignPattern()
    {
        // Regression test for the fix
        var result = _segmenter!.Segment("សម្រា ប់ការ");
        Assert.That(result, Is.EqualTo(new[] { "ស", "ម្រា ប់", "ការ" }));
    }

    [Test]
    public void Punctuation()
    {
        var result = _segmenter!.Segment("សួស្តី។");
        Assert.That(result, Is.EqualTo(new[] { "សួស្តី", "។" }));
    }
}
