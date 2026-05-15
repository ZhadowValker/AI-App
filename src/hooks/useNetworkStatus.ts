// ============================================================
// src/hooks/useNetworkStatus.ts
// Monitors network connectivity and Ollama reachability.
// Shows a banner when offline or when Ollama is unreachable.
// ============================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useProviderStore } from '../../provider-engine/store/providerStore';
import { PatVault }         from '../../provider-engine/lib/patVault';

export type NetworkStatus =
  | 'online'           // internet connected
  | 'offline'          // no internet
  | 'ollama-down'      // internet ok but Ollama unreachable
  | 'checking';        // initial check

export interface NetworkInfo {
  status:        NetworkStatus;
  isConnected:   boolean;
  ollamaOnline:  boolean;
  lastChecked:   Date | null;
  recheck:       () => void;
}

const OLLAMA_CHECK_INTERVAL = 30_000;   // check Ollama every 30s
const OLLAMA_TIMEOUT        = 4_000;    // 4s timeout for Ollama ping

export function useNetworkStatus(): NetworkInfo {
  const { settings } = useProviderStore();
  const [isConnected,  setConnected]  = useState(true);
  const [ollamaOnline, setOllama]     = useState(true);
  const [lastChecked,  setLastChecked]= useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Check Ollama availability ────────────────────────────────
  const checkOllama = useCallback(async () => {
    if (settings.preferred !== 'ollama') {
      setOllama(true);
      return;
    }
    try {
      const key = await PatVault.getOllamaKey();
      if (!key) { setOllama(false); return; }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

      const res = await fetch(`${settings.ollama.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal:  controller.signal,
      });
      clearTimeout(timer);
      setOllama(res.ok);
    } catch {
      setOllama(false);
    }
    setLastChecked(new Date());
  }, [settings.ollama.baseUrl, settings.preferred]);

  // ── Network connectivity listener ────────────────────────────
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected ?? false;
      setConnected(connected);
      if (connected) checkOllama();
    });

    // Initial check
    NetInfo.fetch().then(state => {
      setConnected(state.isConnected ?? false);
      checkOllama();
    });

    return () => unsubscribe();
  }, [checkOllama]);

  // ── Periodic Ollama ping ──────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(checkOllama, OLLAMA_CHECK_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [checkOllama]);

  // ── Derive status ─────────────────────────────────────────────
  const status: NetworkStatus =
    !isConnected                                 ? 'offline'
    : settings.preferred === 'ollama'
      && !ollamaOnline                           ? 'ollama-down'
    : 'online';

  return {
    status,
    isConnected,
    ollamaOnline,
    lastChecked,
    recheck: checkOllama,
  };
}
