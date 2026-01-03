# Khmer Word Segmenter - Java Port

Viterbi-based word segmentation for Khmer language, ported from Python.

## Requirements

- Java 17+
- Maven 3.6+

## Build

```bash
cd khmer-java
mvn clean package
```

## Run

```bash
java -jar target/khmer-segmenter-1.0.0.jar \
    --dict ../data/khmer_dictionary_words.txt \
    --freq ../data/khmer_word_frequencies.json \
    --input ../data/input.txt \
    --output ../data/java_output.json
```

## Options

| Option | Description |
|--------|-------------|
| `--dict, -d` | Path to dictionary file |
| `--freq, -f` | Path to frequency file |
| `--input, -i` | Input text file |
| `--output, -o` | Output JSON file |
| `--limit, -l` | Limit number of lines |

## API Usage

```java
import khmer.*;

Dictionary dictionary = new Dictionary();
dictionary.load("khmer_dictionary_words.txt", "khmer_word_frequencies.json");

KhmerSegmenter segmenter = new KhmerSegmenter(dictionary);
List<String> segments = segmenter.segment("ខ្ញុំទៅសាលារៀន");
// ["ខ្ញុំ", "ទៅ", "សាលារៀន"]
```
