// ============================================================
// src/components/OfflineBanner.tsx
// Sticky banner shown when offline or Ollama is unreachable.
// Tapping "Retry" re-pings immediately.
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useProviderStore } from '../../provider-engine/store/providerStore';

export function OfflineBanner() {
  const { status, recheck } = useNetworkStatus();
  const { settings, setPreferred } = useProviderStore();

  if (status === 'online') return null;

  const isOffline     = status === 'offline';
  const isOllamaDown  = status === 'ollama-down';

  const hasClaude = settings.claude.enabled;
  const hasOpenAI = settings.openai.enabled;
  const canFallback = hasClaude || hasOpenAI;

  return (
    <View style={[styles.banner, isOffline ? styles.bannerOffline : styles.bannerOllama]}>
      <View style={styles.left}>
        <Text style={styles.icon}>{isOffline ? '📵' : '🦙'}</Text>
        <View>
          <Text style={styles.title}>
            {isOffline ? 'No internet connection' : 'Ollama unreachable'}
          </Text>
          <Text style={styles.sub}>
            {isOffline
              ? 'Check your network settings'
              : `Cannot reach ${settings.ollama.baseUrl}`}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {isOllamaDown && canFallback && (
          <TouchableOpacity
            style={styles.fallbackBtn}
            onPress={() => setPreferred(hasClaude ? 'claude' : 'openai')}
          >
            <Text style={styles.fallbackText}>
              Use {hasClaude ? 'Claude' : 'OpenAI'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.retryBtn} onPress={recheck}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, paddingHorizontal: 14 },
  bannerOffline: { backgroundColor: '#2d1b00', borderBottomWidth: 1, borderBottomColor: '#d29922' },
  bannerOllama:  { backgroundColor: '#1a1a2e', borderBottomWidth: 1, borderBottomColor: '#58a6ff' },
  left:          { flexDirection: 'row', alignItems: 'center', flex: 1 },
  icon:          { fontSize: 20, marginRight: 10 },
  title:         { color: '#e6edf3', fontSize: 13, fontWeight: '600' },
  sub:           { color: '#8b949e', fontSize: 11 },
  actions:       { flexDirection: 'row', gap: 8 },
  fallbackBtn:   { backgroundColor: '#1f6feb', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  fallbackText:  { color: '#fff', fontSize: 12, fontWeight: '600' },
  retryBtn:      { backgroundColor: '#21262d', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#30363d' },
  retryText:     { color: '#e6edf3', fontSize: 12 },
});
