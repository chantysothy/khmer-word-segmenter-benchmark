use std::borrow::Cow;
use crate::dictionary::Dictionary;
use crate::constants::{is_valid_single_word, is_separator, is_digit};

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
            let chars: Vec<char> = curr.chars().collect();
            if chars.len() == 2 {
                let c0 = chars[0];
                let c1 = chars[1];
                let is_cons = (c0 as u32) >= 0x1780 && (c0 as u32) <= 0x17A2;
                if is_cons && matches!(c1, '\u{17CB}' | '\u{17CE}' | '\u{17CF}') {
                    let prev = merged.pop().unwrap();
                    let new_word = format!("{}{}", prev, curr);
                    merged.push(Cow::Owned(new_word));
                    i += 1;
                    continue;
                }
            }
            if chars.len() == 3 {
                 let c0 = chars[0];
                 let is_cons = (c0 as u32) >= 0x1780 && (c0 as u32) <= 0x17A2;
                 if is_cons && chars[1] == '\u{17B7}' && chars[2] == '\u{17CD}' {
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
             let chars: Vec<char> = curr.chars().collect();
             if chars.len() == 2 {
                 let c0 = chars[0];
                 let c1 = chars[1];
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
            let chars: Vec<char> = curr.chars().collect();
            if chars.len() == 2 {
                let c0 = chars[0];
                let c1 = chars[1];
                let is_cons = (c0 as u32) >= 0x1780 && (c0 as u32) <= 0x17A2;
                if is_cons && matches!(c1, '\u{17CB}' | '\u{17CE}' | '\u{17CF}') {
                    let prev = merged.pop().unwrap();
                    let new_word = format!("{}{}", prev, curr);
                    merged.push(new_word);
                    i += 1;
                    continue;
                }
            }
            if chars.len() == 3 {
                 let c0 = chars[0];
                 let is_cons = (c0 as u32) >= 0x1780 && (c0 as u32) <= 0x17A2;
                 if is_cons && chars[1] == '\u{17B7}' && chars[2] == '\u{17CD}' {
                    let prev = merged.pop().unwrap();
                    let new_word = format!("{}{}", prev, curr);
                    merged.push(new_word);
                    i += 1;
                    continue;
                 }
            }
        }

        // Rule 2: Consonant + ័ (\u17D0) -> Merge with NEXT
        if i + 1 < n {
             let chars: Vec<char> = curr.chars().collect();
             if chars.len() == 2 {
                 let c0 = chars[0];
                 let c1 = chars[1];
                 let is_cons = (c0 as u32) >= 0x1780 && (c0 as u32) <= 0x17A2;
                 if is_cons && c1 == '\u{17D0}' {
                     let next_seg = &segments[i+1];
                     let new_word = format!("{}{}", curr, next_seg);
                     merged.push(new_word);
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
        let is_known = if is_digit(seg.chars().next().unwrap_or(' ')) {
            true
        } else if dictionary.contains(&seg) {
            true
        } else if seg.chars().count() == 1 && is_valid_single_word(seg.chars().next().unwrap()) {
            true
        } else if seg.chars().count() == 1 && is_separator(seg.chars().next().unwrap()) {
            true
        } else if seg.contains('.') && seg.chars().count() >= 2 {
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
        let is_known = if is_digit(seg.chars().next().unwrap_or(' ')) {
            true
        } else if dictionary.contains(&seg) {
            true
        } else if seg.chars().count() == 1 && is_valid_single_word(seg.chars().next().unwrap()) {
            true
        } else if seg.chars().count() == 1 && is_separator(seg.chars().next().unwrap()) {
            true
        } else if seg.contains('.') && seg.chars().count() >= 2 {
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
