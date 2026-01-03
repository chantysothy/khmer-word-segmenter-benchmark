use crate::constants::*;
use crate::dictionary::Dictionary;
use crate::heuristics::{apply_heuristics_string, post_process_unknowns_string};

pub struct KhmerSegmenter {
    dictionary: Dictionary,
}

impl KhmerSegmenter {
    pub fn new(dictionary: Dictionary) -> Self {
        KhmerSegmenter { dictionary }
    }

    pub fn segment(&self, text: &str) -> Vec<String> {
        if !text.contains('\u{200b}') {
            return self.segment_raw(text);
        }
        let text_cleaned = text.replace('\u{200b}', "");
        self.segment_raw(&text_cleaned)
    }

    fn segment_raw(&self, text_raw: &str) -> Vec<String> {
        if text_raw.is_empty() {
            return Vec::new();
        }

        // Convert to codepoints for DP processing
        let cps: Vec<char> = text_raw.chars().collect();
        let n = cps.len();

        // DP Array: (cost, parent_index)
        let mut dp: Vec<(f32, isize)> = vec![(f32::INFINITY, -1); n + 1];
        dp[0] = (0.0, -1);

        for i in 0..n {
            // Check valid path to here
            if dp[i].0 == f32::INFINITY {
                continue;
            }

            let c = cps[i];

            // --- Constraint Checks & Fallback (Repair Mode) ---
            let mut force_repair = false;

            // 1. Previous char was Coeng (\u{17D2})
            if i > 0 && cps[i - 1] == '\u{17D2}' {
                force_repair = true;
            }

            // 2. Current char is Dependent Vowel
            if is_dependent_vowel(c) {
                force_repair = true;
            }

            if force_repair {
                // Recovery Mode: Consume 1 char with high penalty
                let next_idx = i + 1;
                let new_cost = dp[i].0 + self.dictionary.unknown_cost + 50.0;
                if next_idx <= n {
                    if new_cost < dp[next_idx].0 {
                        dp[next_idx] = (new_cost, i as isize);
                    }
                }
                continue;
            }

            // --- Normal Processing ---

            // 1. Number / Digit Grouping (and Currency)
            let is_digit_char = is_digit(c);
            let is_curr = if is_currency_symbol(c) {
                // Check next char
                if i + 1 < n {
                    is_digit(cps[i + 1])
                } else { false }
            } else { false };

            if is_digit_char || is_curr {
                let len_cps = get_number_length_cps(&cps, i);
                let next_idx = i + len_cps;
                let step_cost = 1.0;
                if next_idx <= n && dp[i].0 + step_cost < dp[next_idx].0 {
                    dp[next_idx] = (dp[i].0 + step_cost, i as isize);
                }
            }

            // 2. Separators
            if is_separator(c) {
                let next_idx = i + 1;
                let step_cost = 0.1;
                if next_idx <= n && dp[i].0 + step_cost < dp[next_idx].0 {
                    dp[next_idx] = (dp[i].0 + step_cost, i as isize);
                }
            }

            // 3. Acronyms
            if is_acronym_start_cps(&cps, i) {
                let len_cps = get_acronym_length_cps(&cps, i);
                let next_idx = i + len_cps;
                let step_cost = 1.0;
                if next_idx <= n && dp[i].0 + step_cost < dp[next_idx].0 {
                    dp[next_idx] = (dp[i].0 + step_cost, i as isize);
                }
            }

            // 4. Dictionary Match - Use trie lookup
            let end_limit = (i + self.dictionary.max_word_length).min(n);
            for j in (i + 1)..=end_limit {
                if let Some(word_cost) = self.dictionary.lookup_codepoints(&cps, i, j) {
                    let new_cost = dp[i].0 + word_cost;
                    if new_cost < dp[j].0 {
                        dp[j] = (new_cost, i as isize);
                    }
                }
            }

            // 5. Unknown Cluster Fallback
            if is_khmer_char(c) {
                let len_cps = get_khmer_cluster_length_cps(&cps, i);
                let mut step_cost = self.dictionary.unknown_cost;

                // Penalty for invalid single consonants
                if len_cps == 1 {
                    if !is_valid_single_word(c) {
                        step_cost += 10.0;
                    }
                }

                let next_idx = i + len_cps;
                if next_idx <= n {
                    if dp[i].0 + step_cost < dp[next_idx].0 {
                        dp[next_idx] = (dp[i].0 + step_cost, i as isize);
                    }
                }
            } else {
                // Non-Khmer (Symbol, English, etc)
                let step_cost = self.dictionary.unknown_cost;
                let next_idx = i + 1;
                if next_idx <= n {
                    if dp[i].0 + step_cost < dp[next_idx].0 {
                        dp[next_idx] = (dp[i].0 + step_cost, i as isize);
                    }
                }
            }
        }

        // Backtrack using codepoint indices
        let mut segments: Vec<String> = Vec::new();
        let mut curr = n;
        while curr > 0 {
            let (_, prev) = dp[curr];
            if prev == -1 {
                // Error case
                break;
            }
            let prev_idx = prev as usize;
            let segment: String = cps[prev_idx..curr].iter().collect();
            segments.push(segment);
            curr = prev_idx;
        }
        segments.reverse();

        // Post Processing
        // Pass 1: Snap Invalid Single Consonants
        let mut pass1_segments = Vec::new();
        for (j, seg) in segments.iter().enumerate() {
            let seg_chars: Vec<char> = seg.chars().collect();
            let seg_len = seg_chars.len();
            let first_char = if seg_len > 0 { seg_chars[0] } else { ' ' };

            let is_invalid_single = seg_len == 1
                && !is_valid_single_word(first_char)
                && !self.dictionary.contains(seg)
                && !is_digit(first_char)
                && !is_separator(first_char);

            if is_invalid_single {
                // Check Valid Context (surrounded by separators?)
                let mut prev_is_sep = false;
                if !pass1_segments.is_empty() {
                    let prev_seg: &String = pass1_segments.last().unwrap();
                    let p_char = prev_seg.chars().next().unwrap_or(' ');
                    if is_separator(p_char) || prev_seg == " " || prev_seg == "\u{200b}" {
                        prev_is_sep = true;
                    }
                } else if j == 0 {
                    prev_is_sep = true;
                }

                let mut next_is_sep = false;
                if j + 1 < segments.len() {
                    let next_seg = &segments[j+1];
                    let n_char = next_seg.chars().next().unwrap_or(' ');
                    if is_separator(n_char) || next_seg == " " || next_seg == "\u{200b}" {
                        next_is_sep = true;
                    }
                } else {
                    next_is_sep = true;
                }

                if prev_is_sep && next_is_sep {
                    pass1_segments.push(seg.clone());
                    continue;
                }

                if !pass1_segments.is_empty() {
                    let prev_seg: &String = pass1_segments.last().unwrap();
                    let p_char = prev_seg.chars().next().unwrap_or(' ');
                    if !is_separator(p_char) {
                        let prev = pass1_segments.pop().unwrap();
                        pass1_segments.push(format!("{}{}", prev, seg));
                    } else {
                        pass1_segments.push(seg.clone());
                    }
                } else {
                    pass1_segments.push(seg.clone());
                }
            } else {
                pass1_segments.push(seg.clone());
            }
        }

        let pass2_segments = apply_heuristics_string(pass1_segments, &self.dictionary);
        post_process_unknowns_string(pass2_segments, &self.dictionary)
    }
}

// Helpers - Codepoint-based versions

fn get_khmer_cluster_length_cps(cps: &[char], start: usize) -> usize {
    if start >= cps.len() {
        return 0;
    }

    let first_char = cps[start];
    let code = first_char as u32;

    // Must start with Base Consonant (1780-17A2) or Indep Vowel (17A3-17B3)
    if !((code >= 0x1780 && code <= 0x17B3)) {
        return 1;
    }

    let mut len = 1;
    let mut i = start + 1;

    while i < cps.len() {
        let c = cps[i];

        // Coeng
        if is_coeng(c) {
            // Check if next is consonant
            if i + 1 < cps.len() && is_consonant(cps[i + 1]) {
                len += 2;
                i += 2;
                continue;
            }
            break;
        }

        if is_dependent_vowel(c) || is_sign(c) {
            len += 1;
            i += 1;
            continue;
        }

        break;
    }

    len
}

fn get_number_length_cps(cps: &[char], start: usize) -> usize {
    if start >= cps.len() {
        return 0;
    }

    if !is_digit(cps[start]) {
        return 0;
    }

    let mut last_valid_len = 1;
    let mut i = start + 1;

    while i < cps.len() {
        let c = cps[i];

        if is_digit(c) {
            last_valid_len = i - start + 1;
            i += 1;
            continue;
        }

        // Separators: , . space
        if c == ',' || c == '.' || c == ' ' {
            if i + 1 < cps.len() && is_digit(cps[i + 1]) {
                last_valid_len = i - start + 2;
                i += 2;
                continue;
            }
        }
        break;
    }

    last_valid_len
}

fn get_acronym_length_cps(cps: &[char], start: usize) -> usize {
    let mut current = start;

    loop {
        let cluster_len = get_khmer_cluster_length_cps(cps, current);
        if cluster_len > 0 {
            let dot_index = current + cluster_len;
            if dot_index < cps.len() && cps[dot_index] == '.' {
                current = dot_index + 1;
                if current >= cps.len() {
                    break;
                }
                continue;
            }
        }
        break;
    }

    current - start
}

fn is_acronym_start_cps(cps: &[char], start: usize) -> bool {
    if start >= cps.len() {
        return false;
    }

    let cluster_len = get_khmer_cluster_length_cps(cps, start);
    if cluster_len == 0 {
        return false;
    }

    let dot_index = start + cluster_len;
    if dot_index >= cps.len() {
        return false;
    }

    cps[dot_index] == '.'
}
