// ============================================================
// src/screens/RepoScreen.tsx  (FIXED)
// Fixes:
//   - Replaced atob() with cross-platform decodeBase64()
//   - Added SyntaxHighlighter for code files
//   - Added loading state when switching between views
// ============================================================

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';

import { getOctokit, isGitHubClientReady } from '../../github-tools/lib/githubClient';
import { decodeBase64 }                    from '../utils/base64';
import { SyntaxHighlighter }               from '../components/SyntaxHighlighter';

// ── Types ─────────────────────────────────────────────────────

interface RepoItem {
  full_name:        string;
  name:             string;
  description:      string | null;
  language:         string | null;
  default_branch:   string;
  stargazers_count: number;
  private:          boolean;
}

interface TreeItem {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

// ── Detect language from file extension ───────────────────────

function detectLanguage(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', go: 'go', rs: 'rust', rb: 'ruby', java: 'java',
    json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown',
    sh: 'bash', bash: 'bash', zsh: 'bash',
    css: 'css', html: 'html', xml: 'xml',
    c: 'c', cpp: 'cpp', h: 'c',
    swift: 'swift', kt: 'kotlin',
  };
  return ext ? map[ext] : undefined;
}

// ── Repo Card ─────────────────────────────────────────────────

function RepoCard({ repo, onPress }: { repo: RepoItem; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.repoCard} onPress={onPress}>
      <View style={styles.repoCardHeader}>
        <Text style={styles.repoName}>{repo.name}</Text>
        {repo.private && <Text style={styles.privateBadge}>Private</Text>}
      </View>
      {repo.description && (
        <Text style={styles.repoDesc} numberOfLines={2}>{repo.description}</Text>
      )}
      <View style={styles.repoMeta}>
        {repo.language && <Text style={styles.repoLang}>● {repo.language}</Text>}
        <Text style={styles.repoStars}>⭐ {repo.stargazers_count}</Text>
        <Text style={styles.repoBranch}>🌿 {repo.default_branch}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── File Tree Item ────────────────────────────────────────────

function FileTreeItem({ item, onPress }: { item: TreeItem; onPress: () => void }) {
  const isDir = item.type === 'tree';
  const parts = item.path.split('/');
  const name  = parts[parts.length - 1];
  const depth = parts.length - 1;

  return (
    <TouchableOpacity
      style={[styles.treeItem, { paddingLeft: 12 + depth * 16 }]}
      onPress={onPress}
    >
      <Text style={styles.treeIcon}>{isDir ? '📁' : '📄'}</Text>
      <Text style={[styles.treeName, isDir && styles.treeNameDir]} numberOfLines={1}>
        {name}
      </Text>
      {!isDir && item.size !== undefined && (
        <Text style={styles.treeSize}>
          {item.size < 1024 ? `${item.size}B` : `${(item.size / 1024).toFixed(1)}KB`}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────

export default function RepoScreen() {
  const [repos,        setRepos]    = useState<RepoItem[]>([]);
  const [filtered,     setFiltered] = useState<RepoItem[]>([]);
  const [search,       setSearch]   = useState('');
  const [selectedRepo, setSelected] = useState<RepoItem | null>(null);
  const [tree,         setTree]     = useState<TreeItem[]>([]);
  const [fileContent,  setContent]  = useState<string | null>(null);
  const [selectedFile, setSelFile]  = useState<string | null>(null);
  const [loading,      setLoading]  = useState(false);
  const [ready,        setReady]    = useState(false);

  // Load repos on mount
  useEffect(() => {
    if (!isGitHubClientReady()) { setReady(false); return; }
    setReady(true);
    setLoading(true);
    getOctokit()
      .repos.listForAuthenticatedUser({ per_page: 100, sort: 'pushed' })
      .then(({ data }) => {
        const r = data.map(d => ({
          full_name:        d.full_name,
          name:             d.name,
          description:      d.description ?? null,
          language:         d.language ?? null,
          default_branch:   d.default_branch,
          stargazers_count: d.stargazers_count,
          private:          d.private,
        }));
        setRepos(r);
        setFiltered(r);
      })
      .catch(e => Alert.alert('Error loading repos', String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Filter by search
  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(repos.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q)
    ));
  }, [search, repos]);

  // Load file tree
  const loadTree = useCallback(async (repo: RepoItem) => {
    setSelected(repo);
    setTree([]);
    setContent(null);
    setSelFile(null);
    setLoading(true);
    try {
      const [owner, name] = repo.full_name.split('/');
      const { data } = await getOctokit().git.getTree({
        owner, repo: name,
        tree_sha: repo.default_branch,
        recursive: '1',
      });
      const items = (data.tree ?? [])
        .filter(i => i.path && i.type)
        .map(i => ({ path: i.path!, type: i.type as 'blob' | 'tree', size: i.size }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
          return a.path.localeCompare(b.path);
        });
      setTree(items);
    } catch (e) {
      Alert.alert('Error loading tree', String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Read file — FIX: use decodeBase64 instead of atob()
  const readFile = useCallback(async (item: TreeItem) => {
    if (item.type === 'tree' || !selectedRepo) return;
    setLoading(true);
    setSelFile(item.path);
    try {
      const [owner, name] = selectedRepo.full_name.split('/');
      const { data } = await getOctokit().repos.getContent({
        owner, repo: name,
        path: item.path,
        ref: selectedRepo.default_branch,
      });
      if (!Array.isArray(data) && data.type === 'file') {
        // FIX: decodeBase64 works on iOS AND Android
        const content = decodeBase64(data.content);
        setContent(content);
      }
    } catch (e) {
      Alert.alert('Error reading file', String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedRepo]);

  // ── No PAT ───────────────────────────────────────────────────
  if (!ready) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.noPatIcon}>🔑</Text>
          <Text style={styles.noPatTitle}>No GitHub PAT set</Text>
          <Text style={styles.noPatSub}>Go to Settings → GitHub to add your token</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── File content view with SyntaxHighlighter ──────────────────
  if (fileContent !== null && selectedFile) {
    const lang = detectLanguage(selectedFile);
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.fileHeader}>
          <TouchableOpacity onPress={() => { setContent(null); setSelFile(null); }}>
            <Text style={styles.backBtn}>← Tree</Text>
          </TouchableOpacity>
          <Text style={styles.filePath} numberOfLines={1}>{selectedFile}</Text>
        </View>
        {loading
          ? <ActivityIndicator style={{ marginTop: 40 }} color="#58a6ff" />
          : <SyntaxHighlighter code={fileContent} language={lang} maxLines={300} />
        }
      </SafeAreaView>
    );
  }

  // ── File tree view ────────────────────────────────────────────
  if (selectedRepo) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.fileHeader}>
          <TouchableOpacity onPress={() => { setSelected(null); setTree([]); }}>
            <Text style={styles.backBtn}>← Repos</Text>
          </TouchableOpacity>
          <Text style={styles.filePath} numberOfLines={1}>{selectedRepo.full_name}</Text>
        </View>
        {loading
          ? <ActivityIndicator style={{ marginTop: 40 }} color="#58a6ff" />
          : (
            <FlatList
              data={tree}
              keyExtractor={i => i.path}
              renderItem={({ item }) => (
                <FileTreeItem item={item} onPress={() => readFile(item)} />
              )}
            />
          )
        }
      </SafeAreaView>
    );
  }

  // ── Repo list ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search repos..."
          placeholderTextColor="#8b949e"
          autoCapitalize="none"
        />
      </View>
      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} color="#58a6ff" />
        : (
          <FlatList
            data={filtered}
            keyExtractor={r => r.full_name}
            renderItem={({ item }) => (
              <RepoCard repo={item} onPress={() => loadTree(item)} />
            )}
            contentContainerStyle={{ padding: 12 }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No repos found</Text>
            }
          />
        )
      }
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#0d1117' },
  centered:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  noPatIcon:     { fontSize: 48, marginBottom: 12 },
  noPatTitle:    { color: '#e6edf3', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  noPatSub:      { color: '#8b949e', fontSize: 14, textAlign: 'center' },
  emptyText:     { color: '#6e7681', textAlign: 'center', marginTop: 40, fontSize: 14 },

  searchBar:     { padding: 12, borderBottomWidth: 1, borderBottomColor: '#30363d' },
  searchInput:   { backgroundColor: '#161b22', borderRadius: 8, borderWidth: 1, borderColor: '#30363d', color: '#e6edf3', padding: 10, fontSize: 14 },

  repoCard:      { backgroundColor: '#161b22', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#30363d' },
  repoCardHeader:{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  repoName:      { color: '#58a6ff', fontSize: 15, fontWeight: '700', flex: 1 },
  privateBadge:  { backgroundColor: '#21262d', color: '#8b949e', fontSize: 11, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#30363d' },
  repoDesc:      { color: '#8b949e', fontSize: 13, marginBottom: 8 },
  repoMeta:      { flexDirection: 'row', gap: 12 },
  repoLang:      { color: '#3fb950', fontSize: 12 },
  repoStars:     { color: '#d29922', fontSize: 12 },
  repoBranch:    { color: '#8b949e', fontSize: 12 },

  fileHeader:    { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#30363d', backgroundColor: '#161b22' },
  backBtn:       { color: '#58a6ff', fontSize: 14, marginRight: 12 },
  filePath:      { color: '#e6edf3', fontSize: 13, flex: 1, fontFamily: 'monospace' },

  treeItem:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#21262d' },
  treeIcon:      { fontSize: 14, marginRight: 8 },
  treeName:      { color: '#e6edf3', fontSize: 14, flex: 1 },
  treeNameDir:   { color: '#58a6ff', fontWeight: '600' },
  treeSize:      { color: '#6e7681', fontSize: 11 },
});
