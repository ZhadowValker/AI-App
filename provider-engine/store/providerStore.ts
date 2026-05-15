// ============================================================
// store/providerStore.ts
// Zustand store — manages provider configs, active provider,
// model selection, and key storage bridging
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ProviderName, OllamaConfig, ClaudeConfig, OpenAIConfig } from '../types';
import { ProviderManager } from '../providers/ProviderManager';

// ── Non-sensitive config (stored in AsyncStorage) ─────────────
// API keys are stored separately in PatVault (SecureStore)
export interface ProviderSettings {
  ollama: {
    baseUrl: string;
    model: string;
    enabled: boolean;
  };
  claude: {
    model: string;
    maxTokens: number;
    enabled: boolean;
  };
  openai: {
    model: string;
    baseUrl: string;
    enabled: boolean;
  };
  preferred: ProviderName;
  fallbackOrder: ProviderName[];
  fallbackOnError: boolean;
  fallbackTimeoutMs: number;
}

const DEFAULT_SETTINGS: ProviderSettings = {
  ollama: {
    baseUrl: 'https://ollama.com/v1',
    model: 'minimax/minimax-m1',
    enabled: true,
  },
  claude: {
    model: 'claude-sonnet-4-5',
    maxTokens: 8192,
    enabled: false,
  },
  openai: {
    model: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    enabled: false,
  },
  preferred: 'ollama',
  fallbackOrder: ['claude', 'openai'],
  fallbackOnError: true,
  fallbackTimeoutMs: 5000,
};

// ── Store state ───────────────────────────────────────────────

interface ProviderStoreState {
  settings: ProviderSettings;
  availabilityStatus: Record<ProviderName, 'unknown' | 'online' | 'offline'>;
  availableModels: Record<ProviderName, string[]>;

  // Actions
  updateSettings: (partial: Partial<ProviderSettings>) => void;
  updateOllamaSettings: (partial: Partial<ProviderSettings['ollama']>) => void;
  updateClaudeSettings: (partial: Partial<ProviderSettings['claude']>) => void;
  updateOpenAISettings: (partial: Partial<ProviderSettings['openai']>) => void;
  setPreferred: (provider: ProviderName) => void;
  setAvailability: (provider: ProviderName, status: 'online' | 'offline') => void;
  setAvailableModels: (provider: ProviderName, models: string[]) => void;

  // Build ProviderManager from current settings + keys
  buildManager: (keys: {
    ollamaKey?: string;
    claudeKey?: string;
    openaiKey?: string;
  }) => ProviderManager;
}

export const useProviderStore = create<ProviderStoreState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      availabilityStatus: {
        ollama: 'unknown',
        claude: 'unknown',
        openai: 'unknown',
      },
      availableModels: {
        ollama: [],
        claude: [
          'claude-opus-4-5',
          'claude-sonnet-4-5',
          'claude-haiku-4-5-20251001',
        ],
        openai: [],
      },

      updateSettings: (partial) =>
        set(s => ({ settings: { ...s.settings, ...partial } })),

      updateOllamaSettings: (partial) =>
        set(s => ({
          settings: {
            ...s.settings,
            ollama: { ...s.settings.ollama, ...partial },
          },
        })),

      updateClaudeSettings: (partial) =>
        set(s => ({
          settings: {
            ...s.settings,
            claude: { ...s.settings.claude, ...partial },
          },
        })),

      updateOpenAISettings: (partial) =>
        set(s => ({
          settings: {
            ...s.settings,
            openai: { ...s.settings.openai, ...partial },
          },
        })),

      setPreferred: (provider) =>
        set(s => ({ settings: { ...s.settings, preferred: provider } })),

      setAvailability: (provider, status) =>
        set(s => ({
          availabilityStatus: { ...s.availabilityStatus, [provider]: status },
        })),

      setAvailableModels: (provider, models) =>
        set(s => ({
          availableModels: { ...s.availableModels, [provider]: models },
        })),

      buildManager: ({ ollamaKey, claudeKey, openaiKey }) => {
        const { settings } = get();
        const configs: (OllamaConfig | ClaudeConfig | OpenAIConfig)[] = [];

        if (settings.ollama.enabled && ollamaKey) {
          configs.push({
            provider: 'ollama',
            baseUrl: settings.ollama.baseUrl,
            apiKey: ollamaKey,
            model: settings.ollama.model,
          });
        }

        if (settings.claude.enabled && claudeKey) {
          configs.push({
            provider: 'claude',
            apiKey: claudeKey,
            model: settings.claude.model,
            maxTokens: settings.claude.maxTokens,
          });
        }

        if (settings.openai.enabled && openaiKey) {
          configs.push({
            provider: 'openai',
            apiKey: openaiKey,
            model: settings.openai.model,
            baseUrl: settings.openai.baseUrl,
          });
        }

        return new ProviderManager({
          providers: configs,
          preferred: settings.preferred,
          fallbackOrder: settings.fallbackOrder,
          fallbackOnError: settings.fallbackOnError,
          fallbackTimeoutMs: settings.fallbackTimeoutMs,
        });
      },
    }),
    {
      name: 'provider-settings',     // AsyncStorage key
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist settings, not runtime state
      partialize: (state) => ({ settings: state.settings }),
    },
  ),
);
