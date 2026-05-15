// ============================================================
// src/screens/SettingsScreen.tsx  (FIXED)
// Fixes:
//   - Removed duplicate Platform import (was at bottom)
//   - Fixed useProviderStore.getState() anti-pattern in render
//   - Replaced text model inputs with ModelPicker dropdowns
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, Alert, ActivityIndicator,
  Switch, Platform,
} from 'react-native';

import { PatVault, getVaultModeLabel }  from '../../provider-engine/lib/patVault';
import { useProviderStore }             from '../../provider-engine/store/providerStore';
import { useGitHubTools }               from '../../github-tools/tools/ToolRegistry';
import { ModelPicker }                  from '../components/ModelPicker';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function KeyInput({
  label, value, onChange, placeholder, secured = true,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; secured?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.keyInputRow}>
      <Text style={styles.keyLabel}>{label}</Text>
      <View style={styles.keyInputWrap}>
        <TextInput
          style={styles.keyInput}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder ?? 'Paste key here...'}
          placeholderTextColor="#8b949e"
          secureTextEntry={secured && !visible}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {secured && (
          <TouchableOpacity onPress={() => setVisible(v => !v)} style={styles.eyeBtn}>
            <Text>{visible ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function ProviderRow({
  label, enabled, onToggle, isActive, onSetActive,
}: {
  label: string; enabled: boolean; onToggle: (v: boolean) => void;
  isActive: boolean; onSetActive: () => void;
}) {
  return (
    <View style={styles.providerRow}>
      <View style={styles.providerRowLeft}>
        <Switch value={enabled} onValueChange={onToggle} trackColor={{ true: '#238636' }} />
        <Text style={styles.providerLabel}>{label}</Text>
      </View>
      {enabled && (
        <TouchableOpacity
          style={[styles.activeBtn, isActive && styles.activeBtnActive]}
          onPress={onSetActive}
        >
          <Text style={[styles.activeBtnText, isActive && styles.activeBtnTextActive]}>
            {isActive ? '✓ Active' : 'Set Active'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function SettingsScreen() {
  const {
    settings,
    updateOllamaSettings,
    updateClaudeSettings,
    updateOpenAISettings,
    setPreferred,
    updateSettings,   // FIX: use this in render, not getState()
  } = useProviderStore();

  const { status: ghStatus, user: ghUser, reinitialize } = useGitHubTools();

  const [ollamaKey,  setOllamaKey]  = useState('');
  const [claudeKey,  setClaudeKey]  = useState('');
  const [openaiKey,  setOpenaiKey]  = useState('');
  const [githubPAT,  setGithubPAT]  = useState('');
  const [saving,     setSaving]     = useState(false);
  const [vaultLabel, setVaultLabel] = useState('');

  useEffect(() => {
    setVaultLabel(getVaultModeLabel());
    PatVault.loadAll().then(keys => {
      if (keys.ollamaKey)    setOllamaKey(keys.ollamaKey);
      if (keys.anthropicKey) setClaudeKey(keys.anthropicKey);
      if (keys.openaiKey)    setOpenaiKey(keys.openaiKey);
      if (keys.githubPAT)    setGithubPAT(keys.githubPAT);
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await Promise.all([
        ollamaKey ? PatVault.saveOllamaKey(ollamaKey)    : Promise.resolve(),
        claudeKey ? PatVault.saveAnthropicKey(claudeKey) : Promise.resolve(),
        openaiKey ? PatVault.saveOpenAIKey(openaiKey)    : Promise.resolve(),
        githubPAT ? PatVault.saveGitHubPAT(githubPAT)   : Promise.resolve(),
      ]);
      await reinitialize();
      Alert.alert('✅ Saved', 'Keys saved and clients re-initialized.');
    } catch (err) {
      Alert.alert('Error', String(err));
    } finally {
      setSaving(false);
    }
  }, [ollamaKey, claudeKey, openaiKey, githubPAT, reinitialize]);

  const handleClearAll = useCallback(() => {
    Alert.alert('Clear all keys?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive',
        onPress: async () => {
          await PatVault.clearAll();
          setOllamaKey(''); setClaudeKey('');
          setOpenaiKey(''); setGithubPAT('');
        },
      },
    ]);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <View style={styles.vaultBanner}>
          <Text style={styles.vaultText}>{vaultLabel}</Text>
        </View>

        {/* GitHub */}
        <Section title="🐙 GitHub">
          <View style={styles.ghStatus}>
            {ghStatus === 'ready'   && ghUser && <Text style={styles.statusOk}>✅ Connected as @{ghUser.login}</Text>}
            {ghStatus === 'no-pat'  && <Text style={styles.statusWarn}>⚠️ No PAT set</Text>}
            {ghStatus === 'error'   && <Text style={styles.statusErr}>❌ Auth failed — check your PAT</Text>}
            {ghStatus === 'loading' && <ActivityIndicator color="#58a6ff" />}
          </View>
          <KeyInput label="Personal Access Token" value={githubPAT} onChange={setGithubPAT} placeholder="github_pat_..." />
          <Text style={styles.hint}>Scopes needed: repo, workflow, read:user</Text>
        </Section>

        {/* Ollama */}
        <Section title="🦙 Ollama">
          <ProviderRow label="Ollama" enabled={settings.ollama.enabled}
            onToggle={v => updateOllamaSettings({ enabled: v })}
            isActive={settings.preferred === 'ollama'}
            onSetActive={() => setPreferred('ollama')} />
          <KeyInput label="API Key" value={ollamaKey} onChange={setOllamaKey} placeholder="8b0e8e2f..." />
          <KeyInput label="Server URL" value={settings.ollama.baseUrl}
            onChange={v => updateOllamaSettings({ baseUrl: v })}
            placeholder="https://ollama.com/v1" secured={false} />
          <Text style={styles.keyLabel}>Model</Text>
          <ModelPicker provider="ollama" value={settings.ollama.model}
            onChange={v => updateOllamaSettings({ model: v })} />
        </Section>

        {/* Claude */}
        <Section title="🟣 Anthropic Claude">
          <ProviderRow label="Claude" enabled={settings.claude.enabled}
            onToggle={v => updateClaudeSettings({ enabled: v })}
            isActive={settings.preferred === 'claude'}
            onSetActive={() => setPreferred('claude')} />
          <KeyInput label="API Key" value={claudeKey} onChange={setClaudeKey} placeholder="sk-ant-api03-..." />
          <Text style={styles.keyLabel}>Model</Text>
          <ModelPicker provider="claude" value={settings.claude.model}
            onChange={v => updateClaudeSettings({ model: v })} />
        </Section>

        {/* OpenAI */}
        <Section title="🟢 OpenAI">
          <ProviderRow label="OpenAI" enabled={settings.openai.enabled}
            onToggle={v => updateOpenAISettings({ enabled: v })}
            isActive={settings.preferred === 'openai'}
            onSetActive={() => setPreferred('openai')} />
          <KeyInput label="API Key" value={openaiKey} onChange={setOpenaiKey} placeholder="sk-proj-..." />
          <Text style={styles.keyLabel}>Model</Text>
          <ModelPicker provider="openai" value={settings.openai.model}
            onChange={v => updateOpenAISettings({ model: v })} />
        </Section>

        {/* Fallback — FIX: updateSettings from hook, not getState() */}
        <Section title="⚙️ Fallback">
          <View style={styles.providerRow}>
            <Text style={styles.providerLabel}>Auto-fallback on error</Text>
            <Switch
              value={settings.fallbackOnError}
              onValueChange={v => updateSettings({ fallbackOnError: v })}
              trackColor={{ true: '#238636' }}
            />
          </View>
          <Text style={styles.hint}>Order: {settings.fallbackOrder.join(' → ')}</Text>
        </Section>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save All Keys</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.clearBtn} onPress={handleClearAll}>
          <Text style={styles.clearBtnText}>Clear All Keys</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#0d1117' },
  scroll:             { padding: 16 },
  vaultBanner:        { backgroundColor: '#161b22', borderRadius: 8, padding: 10, marginBottom: 16, borderWidth: 1, borderColor: '#30363d' },
  vaultText:          { color: '#8b949e', fontSize: 12, textAlign: 'center' },
  section:            { marginBottom: 24 },
  sectionTitle:       { color: '#e6edf3', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  ghStatus:           { marginBottom: 8 },
  statusOk:           { color: '#3fb950', fontSize: 13 },
  statusWarn:         { color: '#d29922', fontSize: 13 },
  statusErr:          { color: '#f85149', fontSize: 13 },
  keyInputRow:        { marginBottom: 10 },
  keyLabel:           { color: '#8b949e', fontSize: 12, marginBottom: 4 },
  keyInputWrap:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161b22', borderRadius: 8, borderWidth: 1, borderColor: '#30363d' },
  keyInput:           { flex: 1, color: '#e6edf3', fontSize: 14, padding: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  eyeBtn:             { padding: 10 },
  providerRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  providerRowLeft:    { flexDirection: 'row', alignItems: 'center' },
  providerLabel:      { color: '#e6edf3', fontSize: 14, marginLeft: 8 },
  activeBtn:          { backgroundColor: '#21262d', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#30363d' },
  activeBtnActive:    { backgroundColor: '#0d4a1f', borderColor: '#238636' },
  activeBtnText:      { color: '#8b949e', fontSize: 12 },
  activeBtnTextActive:{ color: '#3fb950' },
  hint:               { color: '#6e7681', fontSize: 11, marginTop: 4 },
  saveBtn:            { backgroundColor: '#238636', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  saveBtnDisabled:    { backgroundColor: '#21262d' },
  saveBtnText:        { color: '#fff', fontSize: 16, fontWeight: '700' },
  clearBtn:           { backgroundColor: 'transparent', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: '#f85149' },
  clearBtnText:       { color: '#f85149', fontSize: 14 },
});
