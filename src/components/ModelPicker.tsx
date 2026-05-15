// ============================================================
// src/components/ModelPicker.tsx
// Dropdown model selector that fetches available models
// from the active provider's API at runtime.
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, FlatList,
  ActivityIndicator, StyleSheet, TextInput,
} from 'react-native';
import { useProviderStore } from '../../provider-engine/store/providerStore';
import { PatVault }         from '../../provider-engine/lib/patVault';
import { OllamaProvider }   from '../../provider-engine/providers/OllamaProvider';
import { ClaudeProvider }   from '../../provider-engine/providers/ClaudeProvider';
import { OpenAIProvider }   from '../../provider-engine/providers/OpenAIProvider';

// ── Fallback model lists (used if API call fails) ─────────────

const FALLBACK_MODELS: Record<string, string[]> = {
  ollama: [
    'minimax/minimax-m1',
    'qwen2.5-coder:32b',
    'llama3.3:70b',
    'deepseek-r1:32b',
    'gemma3:27b',
    'mistral:7b',
  ],
  claude: [
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-haiku-4-5-20251001',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'o1',
    'o1-mini',
    'o3-mini',
  ],
};

interface ModelPickerProps {
  provider: 'ollama' | 'claude' | 'openai';
  value:    string;
  onChange: (model: string) => void;
}

export function ModelPicker({ provider, value, onChange }: ModelPickerProps) {
  const { settings } = useProviderStore();
  const [models, setModels]   = useState<string[]>(FALLBACK_MODELS[provider] ?? []);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState('');

  // Fetch models from live API
  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const keys = await PatVault.loadAll();
      let fetched: string[] = [];

      if (provider === 'ollama' && keys.ollamaKey) {
        const p = new OllamaProvider({
          provider: 'ollama',
          baseUrl:  settings.ollama.baseUrl,
          apiKey:   keys.ollamaKey,
          model:    settings.ollama.model,
        });
        fetched = await p.listModels();
      } else if (provider === 'claude' && keys.anthropicKey) {
        const p = new ClaudeProvider({
          provider: 'claude',
          apiKey:   keys.anthropicKey,
          model:    settings.claude.model,
        });
        fetched = await p.listModels?.() ?? [];
      } else if (provider === 'openai' && keys.openaiKey) {
        const p = new OpenAIProvider({
          provider: 'openai',
          apiKey:   keys.openaiKey,
          model:    settings.openai.model,
        });
        fetched = await p.listModels?.() ?? [];
      }

      if (fetched.length > 0) setModels(fetched);
    } catch {
      // Keep fallback list
    } finally {
      setLoading(false);
    }
  }, [provider, settings]);

  useEffect(() => { fetchModels(); }, []);

  const filtered = models.filter(m =>
    m.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {/* Picker button */}
      <TouchableOpacity
        style={styles.pickerBtn}
        onPress={() => { setOpen(true); fetchModels(); }}
      >
        <Text style={styles.pickerValue} numberOfLines={1}>{value || 'Select model...'}</Text>
        {loading
          ? <ActivityIndicator size="small" color="#58a6ff" />
          : <Text style={styles.chevron}>▼</Text>
        }
      </TouchableOpacity>

      {/* Modal dropdown */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>

            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Model</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Search */}
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search models..."
              placeholderTextColor="#8b949e"
              autoCapitalize="none"
            />

            {/* Refresh */}
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchModels}>
              <Text style={styles.refreshText}>
                {loading ? 'Loading...' : '🔄 Refresh from API'}
              </Text>
            </TouchableOpacity>

            {/* Model list */}
            <FlatList
              data={filtered}
              keyExtractor={m => m}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modelItem, item === value && styles.modelItemActive]}
                  onPress={() => { onChange(item); setOpen(false); setSearch(''); }}
                >
                  <Text style={[styles.modelName, item === value && styles.modelNameActive]}>
                    {item}
                  </Text>
                  {item === value && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No models found</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pickerBtn:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161b22', borderRadius: 8, borderWidth: 1, borderColor: '#30363d', padding: 10 },
  pickerValue:    { color: '#e6edf3', fontSize: 14, flex: 1, fontFamily: 'monospace' },
  chevron:        { color: '#8b949e', fontSize: 12, marginLeft: 8 },

  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet:     { backgroundColor: '#161b22', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '75%', borderTopWidth: 1, borderColor: '#30363d' },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#30363d' },
  modalTitle:     { color: '#e6edf3', fontSize: 16, fontWeight: '700' },
  closeBtn:       { color: '#8b949e', fontSize: 18, padding: 4 },

  searchInput:    { margin: 12, backgroundColor: '#0d1117', borderRadius: 8, borderWidth: 1, borderColor: '#30363d', color: '#e6edf3', padding: 10, fontSize: 14 },

  refreshBtn:     { marginHorizontal: 12, marginBottom: 8 },
  refreshText:    { color: '#58a6ff', fontSize: 13 },

  modelItem:      { padding: 14, borderBottomWidth: 1, borderBottomColor: '#21262d', flexDirection: 'row', alignItems: 'center' },
  modelItemActive:{ backgroundColor: '#0d2b1b' },
  modelName:      { color: '#e6edf3', fontSize: 14, fontFamily: 'monospace', flex: 1 },
  modelNameActive:{ color: '#3fb950' },
  checkmark:      { color: '#3fb950', fontSize: 16 },

  emptyText:      { color: '#6e7681', textAlign: 'center', padding: 20 },
});
