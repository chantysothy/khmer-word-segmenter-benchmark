use std::collections::{HashSet, HashMap};
use std::fs::File;
use std::io::{self, BufRead, BufReader};
use std::path::Path;
use fxhash::FxHashMap;

use crate::constants::is_valid_single_word;

#[derive(Default)]
pub struct TrieNode {
    children: FxHashMap<char, Box<TrieNode>>,
    is_word: bool,
    cost: f32,
}

impl TrieNode {
    #[inline]
    fn get_child(&self, c: char) -> Option<&TrieNode> {
        self.children.get(&c).map(|b| b.as_ref())
    }

    fn get_or_create_child(&mut self, c: char) -> &mut TrieNode {
        self.children.entry(c).or_insert_with(|| Box::new(TrieNode::default()))
    }
}

pub struct Dictionary {
    pub words: FxHashMap<String, usize>, // Maps word -> index
    pub costs: Vec<f32>,                 // Maps index -> cost
    pub trie: TrieNode,                  // Trie for fast codepoint-based lookups
    pub max_word_length: usize,          // Max word length in codepoints
    pub default_cost: f32,
    pub unknown_cost: f32,
}

impl Dictionary {
    pub fn new(dict_path: &Path, freq_path: &Path) -> io::Result<Self> {
        // Temporary storage for building
        let mut temp_words: HashSet<String> = HashSet::new();
        let mut max_word_length = 0;

        // 1. Load Words
        Dictionary::load_words(dict_path, &mut temp_words, &mut max_word_length)?;

        // 2. Load Frequencies & Calculate Costs
        let (word_costs_map, default_cost, unknown_cost) = Dictionary::calculate_costs(freq_path, &temp_words)?;

        // 3. Build HashMap and Trie
        let mut words_map = FxHashMap::default();
        let mut costs_vec = Vec::with_capacity(temp_words.len());
        let mut trie = TrieNode::default();

        for (i, word) in temp_words.into_iter().enumerate() {
            let cost = *word_costs_map.get(&word).unwrap_or(&default_cost);
            words_map.insert(word.clone(), i);
            costs_vec.push(cost);

            // Build trie
            let chars: Vec<char> = word.chars().collect();
            let mut node = &mut trie;
            for &c in &chars {
                node = node.get_or_create_child(c);
            }
            node.is_word = true;
            node.cost = cost;
        }

        Ok(Dictionary {
            words: words_map,
            costs: costs_vec,
            trie,
            max_word_length,
            default_cost,
            unknown_cost,
        })
    }

    fn load_words(path: &Path, words_set: &mut HashSet<String>, max_len: &mut usize) -> io::Result<()> {
        let file = File::open(path)?;
        let reader = BufReader::new(file);

        let mut words_to_remove = HashSet::new();

        for line in reader.lines() {
            let word = line?.trim().to_string();
            if word.is_empty() { continue; }

            // Filter single chars
            if word.chars().count() == 1 {
                let c = word.chars().next().unwrap();
                if !is_valid_single_word(c) { continue; }
            }

            words_set.insert(word.clone());
            let word_char_len = word.chars().count();
            if word_char_len > *max_len { *max_len = word_char_len; }

            // Generate variants
            let variants = Dictionary::generate_variants(&word);
            for v in variants {
                words_set.insert(v.clone());
                let v_char_len = v.chars().count();
                if v_char_len > *max_len { *max_len = v_char_len; }
            }
        }

        // Filter logic
        for word in words_set.iter() {
             if word.contains('ឬ') && word.chars().count() > 1 {
                if word.starts_with('ឬ') {
                    let suffix: String = word.chars().skip(1).collect();
                    if words_set.contains(&suffix) { words_to_remove.insert(word.clone()); }
                } else if word.ends_with('ឬ') {
                    let mut chars: Vec<char> = word.chars().collect();
                    chars.pop();
                    let prefix: String = chars.into_iter().collect();
                    if words_set.contains(&prefix) { words_to_remove.insert(word.clone()); }
                } else {
                    let parts: Vec<&str> = word.split('ឬ').collect();
                    if parts.iter().all(|p| words_set.contains(*p) || p.is_empty()) {
                         words_to_remove.insert(word.clone());
                    }
                }
             }
             if word.contains('ៗ') { words_to_remove.insert(word.clone()); }
             if word.starts_with('\u{17D2}') { words_to_remove.insert(word.clone()); }
        }

        for w in words_to_remove {
            words_set.remove(&w);
        }
        if words_set.contains("ៗ") { words_set.remove("ៗ"); }

        // Recalculate max length in codepoints
        *max_len = 0;
        for word in words_set.iter() {
            let word_char_len = word.chars().count();
            if word_char_len > *max_len { *max_len = word_char_len; }
        }

        Ok(())
    }

    fn calculate_costs(path: &Path, words_set: &HashSet<String>) -> io::Result<(HashMap<String, f32>, f32, f32)> {
        let mut word_costs = HashMap::new();
        let mut default_cost = 10.0;
        let mut unknown_cost = 20.0;

        if !path.exists() {
            println!("Frequency file not found. Using defaults.");
            return Ok((word_costs, default_cost, unknown_cost));
        }

        let file = File::open(path)?;
        let data: HashMap<String, f32> = serde_json::from_reader(file)?;

        let min_freq_floor = 5.0;
        let mut total_tokens = 0.0;
        let mut effective_counts: HashMap<String, f32> = HashMap::new();

        for (word, &count) in &data {
            let eff = count.max(min_freq_floor);
            effective_counts.insert(word.clone(), eff);

            let variants = Dictionary::generate_variants(word);
            for v in variants {
                effective_counts.entry(v).or_insert(eff);
            }

            total_tokens += eff;
        }

        if total_tokens > 0.0 {
            let min_prob = min_freq_floor / total_tokens;
            default_cost = -min_prob.log10();
            unknown_cost = default_cost + 5.0;

            for (word, count) in effective_counts {
                // Only keep costs for words actually in our dictionary
                // (Though some freq words might be missing from dict, we usually only care about the intersection)
                if words_set.contains(&word) {
                    let prob = count / total_tokens;
                    if prob > 0.0 {
                        word_costs.insert(word, -prob.log10());
                    }
                }
            }
        }

        Ok((word_costs, default_cost, unknown_cost))
    }

    fn generate_variants(word: &str) -> HashSet<String> {
        let mut variants = HashSet::new();
        let coeng_ta = "\u{17D2}\u{178F}";
        let coeng_da = "\u{17D2}\u{178D}";

        // 1. Ta/Da Swapping
        if word.contains(coeng_ta) {
            variants.insert(word.replace(coeng_ta, coeng_da));
        }
        if word.contains(coeng_da) {
            variants.insert(word.replace(coeng_da, coeng_ta));
        }

        // 2. Coeng Ro Ordering
        // Pattern: (Coeng Ro)(Other Coeng) <-> (Other Coeng)(Coeng Ro)
        // Coeng Ro: \u17D2\u179A
        // Other Coeng: \u17D2 followed by NOT \u179A

        // Base set for Ro swapping includes original and Ta/Da variants
        let mut base_set = variants.clone();
        base_set.insert(word.to_string());

        let coeng = '\u{17D2}';
        let ro = '\u{179A}';

        for w in base_set {
            let chars: Vec<char> = w.chars().collect();
            let n = chars.len();
            if n < 4 {
                 continue;
            }

            // Pass 1: Ro + Other -> Other + Ro
            // Pattern: [Coeng, Ro, Coeng, NotRo]
            let mut new_chars = chars.clone();
            let mut modified = false;
            let mut i = 0;
            while i + 3 < new_chars.len() {
                let c0 = new_chars[i];
                let c1 = new_chars[i+1];
                let c2 = new_chars[i+2];
                let c3 = new_chars[i+3];

                if c0 == coeng && c1 == ro && c2 == coeng && c3 != ro {
                    // Swap (0,1) with (2,3)
                    new_chars[i] = c2;
                    new_chars[i+1] = c3;
                    new_chars[i+2] = c0;
                    new_chars[i+3] = c1;
                    modified = true;
                    i += 4;
                } else {
                    i += 1;
                }
            }
            if modified {
                variants.insert(new_chars.iter().collect());
            }

            // Pass 2: Other + Ro -> Ro + Other
            // Pattern: [Coeng, NotRo, Coeng, Ro]
            let mut new_chars_2 = chars.clone();
            let mut modified_2 = false;
            let mut i = 0;
            while i + 3 < new_chars_2.len() {
                let c0 = new_chars_2[i];
                let c1 = new_chars_2[i+1];
                let c2 = new_chars_2[i+2];
                let c3 = new_chars_2[i+3];

                if c0 == coeng && c1 != ro && c2 == coeng && c3 == ro {
                    // Swap (0,1) with (2,3)
                    new_chars_2[i] = c2;
                    new_chars_2[i+1] = c3;
                    new_chars_2[i+2] = c0;
                    new_chars_2[i+3] = c1;
                    modified_2 = true;
                    i += 4;
                } else {
                    i += 1;
                }
            }
            if modified_2 {
                variants.insert(new_chars_2.iter().collect());
            }
        }

        variants
    }

    pub fn get_word_cost(&self, word: &str) -> f32 {
        if let Some(&idx) = self.words.get(word) {
            if let Some(&cost) = self.costs.get(idx) {
                return cost;
            }
            return self.default_cost;
        }
        self.unknown_cost
    }

    pub fn contains(&self, word: &str) -> bool {
        self.words.contains_key(word)
    }

    #[inline]
    pub fn lookup_codepoints(&self, cps: &[char], start: usize, end: usize) -> Option<f32> {
        let mut node = &self.trie;
        for i in start..end {
            match node.get_child(cps[i]) {
                Some(child) => node = child,
                None => return None,
            }
        }
        if node.is_word { Some(node.cost) } else { None }
    }
}
