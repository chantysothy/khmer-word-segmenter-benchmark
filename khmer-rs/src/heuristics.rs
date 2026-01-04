use std::borrow::Cow;
use crate::dictionary::Dictionary;
use crate::constants::{is_valid_single_word, is_separator, is_digit};

// ============================================================================
// 1BRC Optimization: Fast inline char helpers to avoid .chars().collect()
// ============================================================================

/// Get first and second char without allocating Vec<char>
#[inline]
fn get_chars_2(s: &str) -> (char, char, usize) {
    let mut chars = s.chars();
    let c0 = chars.next().unwrap_or(' ');
    let c1 = chars.next().unwrap_or(' ');
    let mut count = if c0 != ' ' { 1 } else { 0 };
    if c1 != ' ' { count += 1; }
    // Count remaining chars
    for _ in chars {
        count += 1;
    }
    (c0, c1, count)
}

/// Get first three chars without allocating Vec<char>
#[inline]
fn get_chars_3(s: &str) -> (char, char, char, usize) {
    let mut chars = s.chars();
    let c0 = chars.next().unwrap_or(' ');
    let c1 = chars.next().unwrap_or(' ');
    let c2 = chars.next().unwrap_or(' ');
    let mut count = 0;
    if c0 != ' ' { count += 1; }
    if c1 != ' ' { count += 1; }
    if c2 != ' ' { count += 1; }
    // Count remaining chars
    for _ in chars {
        count += 1;
    }
    (c0, c1, c2, count)
}

/// Get char count without allocating
#[inline]
fn char_count(s: &str) -> usize {
    s.chars().count()
}

/// Get first char without allocating
#[inline]
fn first_char(s: &str) -> char {
    s.chars().next().unwrap_or(' ')
}

pub fn apply_heuristics<'a>(segments: Vec<Cow<'a, str>>, dictionary: &Dictionary) -> Vec<Cow<'a, str>> {
    // Pass 1: Rule 1 & 2 (Consonants + Signs)
    let mut merged: Vec<Cow<'a, str>> = Vec::with_capacity(segments.len());
    let n = segments.len();
    let mut i = 0;

    while i < n {
        let curr = &segments[i];

        // If known word, don't merge
        if dictionary.contains(curr) {
            merged.push(curr.clone());
            i += 1;
            continue;
        }

        // Rule 1: Consonant + [់/ិ៍/៍/៌] -> Merge with PREVIOUS
        // 17CB (Bantoc), 17CE (Kakabat), 17CF (Ahsdja)
        // 17B7 + 17CD (I + Toe)
        if !merged.is_empty() {
            // 1BRC: Use fast inline char extraction
            let (c0, c1, c2, len) = get_chars_3(curr);
            if len == 2 {
                let is_cons = (c0 as u32) >= 0x1780 && (c0 as u32) <= 0x17A2;
                if is_cons && matches!(c1, '\u{17CB}' | '\u{17CE}' | '\u{17CF}') {
                    let prev = merged.pop().unwrap();
                    let new_word = format!("{}{}", prev, curr);
                    merged.push(Cow::Owned(new_word));
                    i += 1;
                    continue;
                }
            }
            if len == 3 {
                 let is_cons = (c0 as u32) >= 0x1780 && (c0 as u32) <= 0x17A2;
                 if is_cons && c1 == '\u{17B7}' && c2 == '\u{17CD}' {
                    let prev = merged.pop().unwrap();
                    let new_word = format!("{}{}", prev, curr);
                    merged.push(Cow::Owned(new_word));
                    i += 1;
                    continue;
                 }
            }
        }

        // Rule 2: Consonant + ័ (\u17D0) -> Merge with NEXT
        if i + 1 < n {
             let (c0, c1, len) = get_chars_2(curr);
             if len == 2 {
                 let is_cons = (c0 as u32) >= 0x1780 && (c0 as u32) <= 0x17A2;
                 if is_cons && c1 == '\u{17D0}' {
                     let next_seg = &segments[i+1];
                     let new_word = format!("{}{}", curr, next_seg);
                     merged.push(Cow::Owned(new_word));
                     i += 2;
                     continue;
                 }
             }
        }

        merged.push(curr.clone());
        i += 1;
    }

    merged
}

pub fn apply_heuristics_string(segments: Vec<String>, dictionary: &Dictionary) -> Vec<String> {
    // Pass 1: Rule 1 & 2 (Consonants + Signs)
    let mut merged: Vec<String> = Vec::with_capacity(segments.len());
    let n = segments.len();
    let mut i = 0;

    while i < n {
        let curr = &segments[i];

        // If known word, don't merge
        if dictionary.contains(curr) {
            merged.push(curr.clone());
            i += 1;
            continue;
        }

        // Rule 1: Consonant + [់/ិ៍/៍/៌] -> Merge with PREVIOUS
        if !merged.is_empty() {
            // 1BRC: Use fast inline char extraction
            let (c0, c1, c2, len) = get_chars_3(curr);
            if len == 2 {
                let is_cons = (c0 as u32) >= 0x1780 && (c0 as u32) <= 0x17A2;
                if is_cons && matches!(c1, '\u{17CB}' | '\u{17CE}' | '\u{17CF}') {
                    let prev = merged.pop().unwrap();
                    merged.push(prev + curr);
                    i += 1;
                    continue;
                }
            }
            if len == 3 {
                 let is_cons = (c0 as u32) >= 0x1780 && (c0 as u32) <= 0x17A2;
                 if is_cons && c1 == '\u{17B7}' && c2 == '\u{17CD}' {
                    let prev = merged.pop().unwrap();
                    merged.push(prev + curr);
                    i += 1;
                    continue;
                 }
            }
        }

        // Rule 2: Consonant + ័ (\u17D0) -> Merge with NEXT
        if i + 1 < n {
             let (c0, c1, len) = get_chars_2(curr);
             if len == 2 {
                 let is_cons = (c0 as u32) >= 0x1780 && (c0 as u32) <= 0x17A2;
                 if is_cons && c1 == '\u{17D0}' {
                     let next_seg = &segments[i+1];
                     merged.push(format!("{}{}", curr, next_seg));
                     i += 2;
                     continue;
                 }
             }
        }

        merged.push(curr.clone());
        i += 1;
    }

    merged
}


pub fn post_process_unknowns<'a>(pass2_segments: Vec<Cow<'a, str>>, dictionary: &Dictionary) -> Vec<Cow<'a, str>> {
    let mut final_segments = Vec::with_capacity(pass2_segments.len());
    let mut unknown_buffer = Vec::new();

    for seg in pass2_segments {
        // 1BRC: Use fast inline char helpers
        let first = first_char(&seg);
        let count = char_count(&seg);

        let is_known = if is_digit(first) {
            true
        } else if dictionary.contains(&seg) {
            true
        } else if count == 1 && is_valid_single_word(first) {
            true
        } else if count == 1 && is_separator(first) {
            true
        } else if seg.contains('.') && count >= 2 {
            // Rudimentary acronym check
            true
        } else {
            false
        };

        if is_known {
            if !unknown_buffer.is_empty() {
                final_segments.push(Cow::Owned(unknown_buffer.concat()));
                unknown_buffer.clear();
            }
            final_segments.push(seg);
        } else {
            // For unknowns, we buffer them. We might need to turn them into owned strings if they aren't already
            // but for concat we just need string slices.
            // Actually unknown_buffer needs to store Strings or &strs?
            // simpler to store String to be safe, but we can store Cow.
            unknown_buffer.push(seg.into_owned());
        }
    }

    if !unknown_buffer.is_empty() {
        final_segments.push(Cow::Owned(unknown_buffer.concat()));
    }

    final_segments
}

pub fn post_process_unknowns_string(pass2_segments: Vec<String>, dictionary: &Dictionary) -> Vec<String> {
    let mut final_segments = Vec::with_capacity(pass2_segments.len());
    let mut unknown_buffer = Vec::new();

    for seg in pass2_segments {
        // 1BRC: Use fast inline char helpers
        let first = first_char(&seg);
        let count = char_count(&seg);

        let is_known = if is_digit(first) {
            true
        } else if dictionary.contains(&seg) {
            true
        } else if count == 1 && is_valid_single_word(first) {
            true
        } else if count == 1 && is_separator(first) {
            true
        } else if seg.contains('.') && count >= 2 {
            // Rudimentary acronym check
            true
        } else {
            false
        };

        if is_known {
            if !unknown_buffer.is_empty() {
                final_segments.push(unknown_buffer.concat());
                unknown_buffer.clear();
            }
            final_segments.push(seg);
        } else {
            unknown_buffer.push(seg);
        }
    }

    if !unknown_buffer.is_empty() {
        final_segments.push(unknown_buffer.concat());
    }

    final_segments
}
