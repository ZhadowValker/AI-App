// ============================================================
// src/components/SyntaxHighlighter.tsx
// Lightweight token-based syntax highlighter.
// No native dependencies — pure regex tokenizer.
// Supports: TypeScript, JavaScript, Python, JSON, Bash, Go, Rust, YAML
// ============================================================

import React, { useMemo } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';

// ── Token types and colors ────────────────────────────────────

type TokenType =
  | 'keyword' | 'string' | 'comment' | 'number'
  | 'function' | 'operator' | 'type' | 'decorator'
  | 'punctuation' | 'plain';

const TOKEN_COLORS: Record<TokenType, string> = {
  keyword:     '#ff7b72',   // red    — if, const, return, def, fn
  string:      '#a5d6ff',   // blue   — "hello", 'world', `template`
  comment:     '#8b949e',   // grey   — // comment, # comment
  number:      '#79c0ff',   // cyan   — 42, 3.14, 0xff
  function:    '#d2a8ff',   // purple — function calls
  operator:    '#ff7b72',   // red    — =>, ===, +, -
  type:        '#ffa657',   // orange — TypeScript types, class names
  decorator:   '#d2a8ff',   // purple — @decorator
  punctuation: '#e6edf3',   // white  — {}[](),;
  plain:       '#e6edf3',   // white  — everything else
};

// ── Token patterns (order matters — first match wins) ─────────

interface TokenPattern {
  type: TokenType;
  regex: RegExp;
}

const PATTERNS: TokenPattern[] = [
  // Comments
  { type: 'comment',   regex: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*/g },
  // Strings (template literals, double, single quoted)
  { type: 'string',    regex: /`[^`]*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g },
  // Decorators
  { type: 'decorator', regex: /@\w+/g },
  // Keywords
  { type: 'keyword',   regex: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|import|export|from|default|new|this|super|typeof|instanceof|in|of|async|await|try|catch|finally|throw|void|delete|yield|static|public|private|protected|abstract|interface|type|enum|namespace|module|declare|implements|readonly|override|as|is|keyof|infer|never|unknown|any|null|undefined|true|false|def|print|lambda|pass|with|raise|except|elif|and|or|not|fn|mut|pub|use|mod|impl|struct|trait|let|match|where|self|Self|go|func|defer|chan|select|map|range|package)\b/g },
  // TypeScript types (capitalized identifiers after : or <)
  { type: 'type',      regex: /(?<=:\s*|<|,\s*|extends\s+|implements\s+)[A-Z]\w*/g },
  // Numbers
  { type: 'number',    regex: /\b(0x[\da-fA-F]+|\d+\.?\d*([eE][+-]?\d+)?)\b/g },
  // Function calls
  { type: 'function',  regex: /\b\w+(?=\s*\()/g },
  // Operators
  { type: 'operator',  regex: /=>|===|!==|==|!=|>=|<=|&&|\|\||[+\-*/%=<>!&|^~?:]/g },
  // Punctuation
  { type: 'punctuation', regex: /[{}[\]();,.]/g },
];

// ── Tokenize a single line ────────────────────────────────────

interface Token { type: TokenType; value: string; }

function tokenizeLine(line: string): Token[] {
  if (!line) return [{ type: 'plain', value: '' }];

  // Build a map of [start, end) ranges for each token
  const ranges: Array<{ start: number; end: number; type: TokenType }> = [];

  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(line)) !== null) {
      const start = match.index;
      const end   = start + match[0].length;
      // Don't overlap with already-claimed ranges
      const overlaps = ranges.some(r => start < r.end && end > r.start);
      if (!overlaps) {
        ranges.push({ start, end, type: pattern.type });
      }
    }
  }

  ranges.sort((a, b) => a.start - b.start);

  const tokens: Token[] = [];
  let pos = 0;

  for (const range of ranges) {
    if (range.start > pos) {
      tokens.push({ type: 'plain', value: line.slice(pos, range.start) });
    }
    tokens.push({ type: range.type, value: line.slice(range.start, range.end) });
    pos = range.end;
  }

  if (pos < line.length) {
    tokens.push({ type: 'plain', value: line.slice(pos) });
  }

  return tokens.length ? tokens : [{ type: 'plain', value: line }];
}

// ── Main component ────────────────────────────────────────────

interface SyntaxHighlighterProps {
  code:      string;
  language?: string;
  maxLines?: number;     // truncate for performance
  fontSize?: number;
}

export function SyntaxHighlighter({
  code,
  language,
  maxLines = 500,
  fontSize = 12,
}: SyntaxHighlighterProps) {
  const lines = useMemo(() => {
    const all = code.split('\n');
    return all.slice(0, maxLines);
  }, [code, maxLines]);

  const truncated = code.split('\n').length > maxLines;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
    >
      <View>
        {language && (
          <View style={styles.langBadge}>
            <Text style={styles.langText}>{language}</Text>
          </View>
        )}

        {lines.map((line, lineIdx) => {
          const tokens = tokenizeLine(line);
          return (
            <View key={lineIdx} style={styles.codeLine}>
              <Text style={[styles.lineNum, { fontSize }]}>
                {String(lineIdx + 1).padStart(3)}
              </Text>
              <Text style={{ fontSize, fontFamily: 'monospace', flexWrap: 'nowrap' }}>
                {tokens.map((tok, i) => (
                  <Text key={i} style={{ color: TOKEN_COLORS[tok.type] }}>
                    {tok.value}
                  </Text>
                ))}
              </Text>
            </View>
          );
        })}

        {truncated && (
          <Text style={styles.truncated}>
            ... {code.split('\n').length - maxLines} more lines
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

// ── Inline code (for chat bubbles) ───────────────────────────

export function InlineCode({ children }: { children: string }) {
  return (
    <Text style={styles.inlineCode}>{children}</Text>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { backgroundColor: '#0d1117', borderRadius: 8, borderWidth: 1, borderColor: '#30363d' },
  langBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#21262d' },
  langText:    { color: '#8b949e', fontSize: 11 },
  codeLine:    { flexDirection: 'row', minHeight: 18, paddingHorizontal: 8 },
  lineNum:     { color: '#6e7681', fontFamily: 'monospace', width: 32, textAlign: 'right', marginRight: 12, paddingTop: 1 },
  truncated:   { color: '#6e7681', fontSize: 11, fontStyle: 'italic', padding: 8 },
  inlineCode:  { backgroundColor: '#161b22', color: '#e6edf3', fontFamily: 'monospace', fontSize: 13, borderRadius: 4, paddingHorizontal: 4 },
});
