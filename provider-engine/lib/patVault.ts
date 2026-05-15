// ============================================================
// lib/patVault.ts
// Dual-mode secure storage:
//   - Expo Go            → AsyncStorage (dev only, NOT encrypted)
//   - Dev Build / Prod   → expo-secure-store (Keychain / Keystore)
//
// Auto-detects environment at runtime via Constants.appOwnership.
// No code changes needed when graduating from Expo Go to dev build.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// ── Detect Expo Go at runtime ─────────────────────────────────
// appOwnership === 'expo'  →  running inside Expo Go sandbox
// appOwnership === null    →  standalone dev build or production

function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

// ── Key names ─────────────────────────────────────────────────

const KEYS = {
  GITHUB_PAT:    'vault.github.pat',
  ANTHROPIC_KEY: 'vault.anthropic.key',
  OPENAI_KEY:    'vault.openai.key',
  OLLAMA_KEY:    'vault.ollama.key',
} as const;

// ── Storage backend — dynamic import prevents native crash ────
// expo-secure-store is only imported when NOT in Expo Go.
// Dynamic import means the native module is never resolved
// in the Expo Go JS bundle.

async function saveItem(key: string, value: string): Promise<void> {
  if (isExpoGo()) {
    console.warn(
      `[PatVault] Expo Go detected — storing "${key}" in AsyncStorage. ` +
      `NOT encrypted. Use a dev build for production security.`
    );
    await AsyncStorage.setItem(key, value);
  } else {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
}

async function loadItem(key: string): Promise<string | null> {
  if (isExpoGo()) {
    return AsyncStorage.getItem(key);
  }
  const SecureStore = await import('expo-secure-store');
  return SecureStore.getItemAsync(key);
}

async function removeItem(key: string): Promise<void> {
  if (isExpoGo()) {
    await AsyncStorage.removeItem(key);
  } else {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(key);
  }
}

// ── Vault mode (use in Settings UI to show warning) ───────────

export type VaultMode = 'secure' | 'insecure-dev';

export function getVaultMode(): VaultMode {
  return isExpoGo() ? 'insecure-dev' : 'secure';
}

export function getVaultModeLabel(): string {
  return isExpoGo()
    ? '⚠️  Dev Mode — AsyncStorage (not encrypted)'
    : '🔒  Secure — iOS Keychain / Android Keystore';
}

// ── Public API ────────────────────────────────────────────────

export const PatVault = {

  // GitHub
  async saveGitHubPAT(token: string)  { await saveItem(KEYS.GITHUB_PAT, token); },
  async getGitHubPAT()                { return loadItem(KEYS.GITHUB_PAT); },
  async clearGitHubPAT()              { await removeItem(KEYS.GITHUB_PAT); },

  // Anthropic / Claude
  async saveAnthropicKey(key: string) { await saveItem(KEYS.ANTHROPIC_KEY, key); },
  async getAnthropicKey()             { return loadItem(KEYS.ANTHROPIC_KEY); },
  async clearAnthropicKey()           { await removeItem(KEYS.ANTHROPIC_KEY); },

  // OpenAI
  async saveOpenAIKey(key: string)    { await saveItem(KEYS.OPENAI_KEY, key); },
  async getOpenAIKey()                { return loadItem(KEYS.OPENAI_KEY); },
  async clearOpenAIKey()              { await removeItem(KEYS.OPENAI_KEY); },

  // Ollama
  async saveOllamaKey(key: string)    { await saveItem(KEYS.OLLAMA_KEY, key); },
  async getOllamaKey()                { return loadItem(KEYS.OLLAMA_KEY); },
  async clearOllamaKey()              { await removeItem(KEYS.OLLAMA_KEY); },

  // Load all keys at once — used by ProviderManager bootstrap
  async loadAll(): Promise<{
    githubPAT:    string | null;
    anthropicKey: string | null;
    openaiKey:    string | null;
    ollamaKey:    string | null;
  }> {
    const [githubPAT, anthropicKey, openaiKey, ollamaKey] = await Promise.all([
      loadItem(KEYS.GITHUB_PAT),
      loadItem(KEYS.ANTHROPIC_KEY),
      loadItem(KEYS.OPENAI_KEY),
      loadItem(KEYS.OLLAMA_KEY),
    ]);
    return { githubPAT, anthropicKey, openaiKey, ollamaKey };
  },

  // Wipe everything — logout / reset
  async clearAll(): Promise<void> {
    await Promise.all(Object.values(KEYS).map(k => removeItem(k)));
  },

  // Check if a specific key exists
  async has(key: keyof typeof KEYS): Promise<boolean> {
    const val = await loadItem(KEYS[key]);
    return val !== null && val.length > 0;
  },
};
