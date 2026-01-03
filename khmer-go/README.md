# Khmer Word Segmenter - Go Port

Viterbi-based word segmentation for Khmer language, ported from Python.

## Requirements

- Go 1.21+

## Build

```bash
cd khmer-go
go build -o khmer ./cmd/khmer
```

## Run

```bash
./khmer \
    --dict ../data/khmer_dictionary_words.txt \
    --freq ../data/khmer_word_frequencies.json \
    --input ../data/input.txt \
    --output ../data/go_output.json
```

## Options

| Option | Description |
|--------|-------------|
| `--dict, -d` | Path to dictionary file |
| `--freq, -f` | Path to frequency file |
| `--input, -i` | Input text file |
| `--output, -o` | Output JSON file |
| `--limit, -l` | Limit number of lines |

## Library Usage

```go
package main

import (
    "fmt"
    "github.com/khmer-segmenter/pkg/khmer"
)

func main() {
    dictionary := khmer.NewDictionary()
    dictionary.Load("khmer_dictionary_words.txt", "khmer_word_frequencies.json")

    segmenter := khmer.NewKhmerSegmenter(dictionary)
    segments := segmenter.Segment("ខ្ញុំទៅសាលារៀន")
    fmt.Println(segments) // [ខ្ញុំ ទៅ សាលារៀន]
}
```

## Performance

Go's efficient memory management and goroutine support make this port suitable for:
- High-throughput batch processing
- Concurrent segmentation tasks
- Memory-efficient large corpus processing
