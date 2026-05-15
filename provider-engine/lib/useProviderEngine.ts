// ============================================================
// lib/useProviderEngine.ts
// React hook that wires PatVault + ProviderStore + ToolLoop
// together. This is what screens actually call.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { PatVault } from './patVault';
import { useProviderStore } from '../store/providerStore';
import { runToolLoop, type Tool, type ToolLoopCallbacks } from './toolLoop';
import type { ProviderManager } from '../providers/ProviderManager';
import type { ProviderName } from '../types';

// ── Types ─────────────────────────────────────────────────────

export type MessageStatus = 'streaming' | 'done' | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status: MessageStatus;
  toolCalls?: ToolCallRecord[];
}

export interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'done' | 'error';
}

// ── Hook ─────────────────────────────────────────────────────

export function useProviderEngine(tools: Tool[] = []) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeProvider, setActiveProviderState] = useState<ProviderName>('ollama');

  const managerRef = useRef<ProviderManager | null>(null);
  const { buildManager, settings, setAvailability, setAvailableModels } = useProviderStore();

  // ── Bootstrap manager on mount and when settings change ───
  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const keys = await PatVault.loadAll();
      const manager = buildManager({
        ollamaKey:  keys.ollamaKey  ?? undefined,
        claudeKey:  keys.anthropicKey ?? undefined,
        openaiKey:  keys.openaiKey  ?? undefined,
      });
      if (mounted) {
        managerRef.current = manager;
        setActiveProviderState(manager.getActive());
      }
    }

    bootstrap();
    return () => { mounted = false; };
  }, [settings]);

  // ── Send a message ─────────────────────────────────────────
  const sendMessage = useCallback(async (
    text: string,
    systemPrompt?: string,
  ) => {
    if (!managerRef.current || isLoading) return;
    setIsLoading(true);

    const userMsgId = `user_${Date.now()}`;
    const assistantMsgId = `assistant_${Date.now()}`;

    // Add user message immediately
    setMessages(prev => [...prev, {
      id: userMsgId,
      role: 'user',
      text,
      status: 'done',
    }]);

    // Add placeholder assistant message
    setMessages(prev => [...prev, {
      id: assistantMsgId,
      role: 'assistant',
      text: '',
      status: 'streaming',
      toolCalls: [],
    }]);

    const callbacks: ToolLoopCallbacks = {
      onTextDelta: (delta) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, text: m.text + delta }
            : m
        ));
      },
      onToolCall: (id, name, input) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? {
                ...m,
                toolCalls: [...(m.toolCalls ?? []), {
                  id, name, input, status: 'pending',
                }],
              }
            : m
        ));
      },
      onToolResult: (id, _name, result) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? {
                ...m,
                toolCalls: (m.toolCalls ?? []).map(tc =>
                  tc.id === id
                    ? { ...tc, result, status: result.type === 'error' ? 'error' : 'done' }
                    : tc
                ),
              }
            : m
        ));
      },
      onTurnStart: (_turn) => { /* could show "thinking..." indicator */ },
      onError: (message) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, text: m.text || message, status: 'error' }
            : m
        ));
      },
    };

    try {
      await runToolLoop(
        text,
        managerRef.current,
        tools,
        callbacks,
        { systemPrompt, maxTurns: 10, parallelTools: true },
      );
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, status: 'done' } : m
      ));
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, text: String(err), status: 'error' }
          : m
      ));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, tools]);

  // ── Switch active provider ────────────────────────────────
  const switchProvider = useCallback((provider: ProviderName) => {
    managerRef.current?.setActive(provider);
    setActiveProviderState(provider);
  }, []);

  // ── Fetch models for a provider ──────────────────────────
  const refreshModels = useCallback(async (provider?: ProviderName) => {
    if (!managerRef.current) return [];
    const models = await managerRef.current.listModels(provider);
    setAvailableModels(provider ?? activeProvider, models);
    return models;
  }, [activeProvider]);

  // ── Check availability ────────────────────────────────────
  const checkAvailability = useCallback(async (provider: ProviderName) => {
    if (!managerRef.current) return false;
    const ok = await managerRef.current.checkAvailability(provider);
    setAvailability(provider, ok ? 'online' : 'offline');
    return ok;
  }, []);

  // ── Clear conversation ────────────────────────────────────
  const clearMessages = useCallback(() => setMessages([]), []);

  return {
    messages,
    isLoading,
    activeProvider,
    sendMessage,
    switchProvider,
    refreshModels,
    checkAvailability,
    clearMessages,
  };
}
