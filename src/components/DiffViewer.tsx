// ============================================================
// src/components/DiffViewer.tsx
// Renders a unified diff (patch string) with colored lines.
// Added lines → green, removed → red, context → grey.
// No native dependencies — pure React Native.
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';

interface DiffLine {
  type:    'added' | 'removed' | 'context' | 'hunk';
  content: string;
  lineNum?: number;
}

interface FileDiff {
  filename:  string;
  status:    string;
  additions: number;
  deletions: number;
  patch:     string | null;
}

// ── Parse unified diff patch into typed lines ─────────────────

function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let newLineNum = 0;

  for (const raw of patch.split('\n')) {
    if (raw.startsWith('@@')) {
      // Hunk header: @@ -a,b +c,d @@
      const match = raw.match(/\+(\d+)/);
      newLineNum = match ? parseInt(match[1]) - 1 : 0;
      lines.push({ type: 'hunk', content: raw });
    } else if (raw.startsWith('+')) {
      newLineNum++;
      lines.push({ type: 'added',   content: raw.slice(1), lineNum: newLineNum });
    } else if (raw.startsWith('-')) {
      lines.push({ type: 'removed', content: raw.slice(1) });
    } else {
      newLineNum++;
      lines.push({ type: 'context', content: raw.slice(1), lineNum: newLineNum });
    }
  }

  return lines;
}

// ── Single diff line ──────────────────────────────────────────

function DiffLine({ line }: { line: DiffLine }) {
  if (line.type === 'hunk') {
    return (
      <View style={styles.hunkLine}>
        <Text style={styles.hunkText}>{line.content}</Text>
      </View>
    );
  }

  const bg = line.type === 'added'   ? styles.addedLine
           : line.type === 'removed' ? styles.removedLine
           : styles.contextLine;

  const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
  const textStyle = line.type === 'added'   ? styles.addedText
                  : line.type === 'removed' ? styles.removedText
                  : styles.contextText;

  return (
    <View style={[styles.diffLine, bg]}>
      <Text style={styles.lineNum}>
        {line.lineNum != null ? String(line.lineNum).padStart(4) : '    '}
      </Text>
      <Text style={styles.prefix}>{prefix}</Text>
      <Text style={[styles.lineContent, textStyle]} numberOfLines={1}>
        {line.content}
      </Text>
    </View>
  );
}

// ── Single file diff ──────────────────────────────────────────

function FileDiffBlock({ file }: { file: FileDiff }) {
  const [expanded, setExpanded] = useState(true);

  const statusColor = file.status === 'added'    ? '#3fb950'
                    : file.status === 'removed'   ? '#f85149'
                    : file.status === 'modified'  ? '#d29922'
                    : '#8b949e';

  const lines = file.patch ? parsePatch(file.patch) : [];

  return (
    <View style={styles.fileBlock}>
      {/* File header */}
      <TouchableOpacity style={styles.fileHeader} onPress={() => setExpanded(e => !e)}>
        <Text style={[styles.fileStatus, { color: statusColor }]}>
          {file.status.toUpperCase()[0]}
        </Text>
        <Text style={styles.fileName} numberOfLines={1}>{file.filename}</Text>
        <Text style={styles.additions}>+{file.additions}</Text>
        <Text style={styles.deletions}>-{file.deletions}</Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* Diff lines */}
      {expanded && (
        file.patch
          ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                {lines.map((line, i) => <DiffLine key={i} line={line} />)}
              </View>
            </ScrollView>
          : <View style={styles.noPatch}>
              <Text style={styles.noPatchText}>Binary file or no patch available</Text>
            </View>
      )}
    </View>
  );
}

// ── Main DiffViewer ───────────────────────────────────────────

interface DiffViewerProps {
  files: FileDiff[];
  title?: string;
}

export function DiffViewer({ files, title }: DiffViewerProps) {
  const totalAdd = files.reduce((s, f) => s + f.additions, 0);
  const totalDel = files.reduce((s, f) => s + f.deletions, 0);

  return (
    <View style={styles.container}>
      {/* Summary bar */}
      <View style={styles.summary}>
        {title && <Text style={styles.summaryTitle}>{title}</Text>}
        <Text style={styles.summaryStats}>
          {files.length} file{files.length !== 1 ? 's' : ''} changed ·{' '}
          <Text style={styles.additions}>+{totalAdd}</Text>{' '}
          <Text style={styles.deletions}>-{totalDel}</Text>
        </Text>
      </View>

      {files.map((f, i) => <FileDiffBlock key={i} file={f} />)}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const FONT = 'monospace';

const styles = StyleSheet.create({
  container:    { backgroundColor: '#0d1117', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#30363d' },

  summary:      { padding: 10, borderBottomWidth: 1, borderBottomColor: '#30363d', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryTitle: { color: '#e6edf3', fontSize: 13, fontWeight: '600' },
  summaryStats: { color: '#8b949e', fontSize: 12 },

  fileBlock:    { borderBottomWidth: 1, borderBottomColor: '#21262d' },
  fileHeader:   { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: '#161b22' },
  fileStatus:   { fontSize: 12, fontWeight: '700', marginRight: 8, width: 14 },
  fileName:     { color: '#e6edf3', fontSize: 12, flex: 1, fontFamily: FONT },
  additions:    { color: '#3fb950', fontSize: 12, marginHorizontal: 4 },
  deletions:    { color: '#f85149', fontSize: 12, marginHorizontal: 4 },
  chevron:      { color: '#8b949e', fontSize: 10, marginLeft: 4 },

  diffLine:     { flexDirection: 'row', alignItems: 'flex-start', minHeight: 20 },
  addedLine:    { backgroundColor: '#0d2b1b' },
  removedLine:  { backgroundColor: '#2b0d0d' },
  contextLine:  { backgroundColor: 'transparent' },
  hunkLine:     { backgroundColor: '#1c2333', paddingVertical: 2 },

  lineNum:      { color: '#6e7681', fontSize: 11, fontFamily: FONT, width: 40, textAlign: 'right', paddingRight: 8, paddingTop: 1 },
  prefix:       { color: '#6e7681', fontSize: 12, fontFamily: FONT, width: 14 },
  lineContent:  { fontSize: 12, fontFamily: FONT, flex: 1, paddingRight: 8 },
  addedText:    { color: '#3fb950' },
  removedText:  { color: '#f85149' },
  contextText:  { color: '#e6edf3' },
  hunkText:     { color: '#58a6ff', fontSize: 11, fontFamily: FONT, padding: 4 },

  noPatch:      { padding: 12 },
  noPatchText:  { color: '#6e7681', fontSize: 12, fontStyle: 'italic' },
});
