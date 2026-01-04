using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;

namespace KhmerSegmenter
{
    /// <summary>
    /// High-performance Trie with flat array optimization for Khmer Unicode range (0x1780-0x17FF).
    /// Uses a 128-element array for O(1) lookups in the Khmer range, with dictionary fallback for other characters.
    /// </summary>
    public sealed class TrieNode
    {
        private const int KHMER_START = 0x1780;
        private const int KHMER_END = 0x17FF;
        private const int KHMER_RANGE = KHMER_END - KHMER_START + 1; // 128

        // Flat array for Khmer range (O(1) lookup)
        private TrieNode[]? _khmerChildren;

        // Fallback dictionary for non-Khmer characters
        private Dictionary<char, TrieNode>? _otherChildren;

        public bool IsWord;
        public float Cost;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public TrieNode? GetChild(char c)
        {
            int code = (int)c;
            if (code >= KHMER_START && code <= KHMER_END)
            {
                if (_khmerChildren == null) return null;
                return _khmerChildren[code - KHMER_START];
            }
            else
            {
                if (_otherChildren == null) return null;
                _otherChildren.TryGetValue(c, out var node);
                return node;
            }
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public TrieNode GetOrCreateChild(char c)
        {
            int code = (int)c;
            if (code >= KHMER_START && code <= KHMER_END)
            {
                _khmerChildren ??= new TrieNode[KHMER_RANGE];
                int idx = code - KHMER_START;
                if (_khmerChildren[idx] == null)
                {
                    _khmerChildren[idx] = new TrieNode();
                }
                return _khmerChildren[idx]!;
            }
            else
            {
                _otherChildren ??= new Dictionary<char, TrieNode>();
                if (!_otherChildren.TryGetValue(c, out var node))
                {
                    node = new TrieNode();
                    _otherChildren[c] = node;
                }
                return node;
            }
        }
    }

    /// <summary>
    /// High-performance Trie for dictionary lookups without string allocation.
    /// </summary>
    public sealed class Trie
    {
        private readonly TrieNode _root = new TrieNode();

        public void Insert(string word, float cost)
        {
            var node = _root;
            foreach (char c in word)
            {
                node = node.GetOrCreateChild(c);
            }
            node.IsWord = true;
            node.Cost = cost;
        }

        /// <summary>
        /// Lookup a word in the trie using a character span (zero allocation).
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public bool TryLookup(ReadOnlySpan<char> word, out float cost)
        {
            cost = 0;
            var node = _root;
            foreach (char c in word)
            {
                node = node.GetChild(c);
                if (node == null) return false;
            }
            if (node.IsWord)
            {
                cost = node.Cost;
                return true;
            }
            return false;
        }

        /// <summary>
        /// Lookup using char array with start/end indices (matches Rust's lookup_codepoints).
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public bool TryLookupRange(char[] chars, int start, int end, out float cost)
        {
            cost = 0;
            var node = _root;
            for (int i = start; i < end; i++)
            {
                node = node.GetChild(chars[i]);
                if (node == null) return false;
            }
            if (node.IsWord)
            {
                cost = node.Cost;
                return true;
            }
            return false;
        }

        /// <summary>
        /// 1BRC: Span-based lookup for zero-allocation dictionary lookups.
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public bool TryLookupSpan(ReadOnlySpan<char> chars, int start, int end, out float cost)
        {
            cost = 0;
            var node = _root;
            for (int i = start; i < end; i++)
            {
                node = node.GetChild(chars[i]);
                if (node == null) return false;
            }
            if (node.IsWord)
            {
                cost = node.Cost;
                return true;
            }
            return false;
        }

        /// <summary>
        /// Check if a word exists in the trie.
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public bool Contains(ReadOnlySpan<char> word)
        {
            var node = _root;
            foreach (char c in word)
            {
                node = node.GetChild(c);
                if (node == null) return false;
            }
            return node.IsWord;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public bool ContainsRange(char[] chars, int start, int end)
        {
            var node = _root;
            for (int i = start; i < end; i++)
            {
                node = node.GetChild(chars[i]);
                if (node == null) return false;
            }
            return node.IsWord;
        }
    }
}
