// ============================================================
// providers/ProviderManager.ts
// Central router: picks active provider, handles fallback chain,
// normalises stream output from all 3 providers into one interface
// ============================================================

import type {
  AIProvider,
  Message,
  ToolDefinition,
  StreamDelta,
  ProviderConfig,
  ProviderManagerConfig,
  ProviderName,
} from '../types';
import { OllamaProvider } from './OllamaProvider';
import { ClaudeProvider } from './ClaudeProvider';
import { OpenAIProvider } from './OpenAIProvider';

export class ProviderManager {
  private providers: Map<ProviderName, AIProvider> = new Map();
  private config: ProviderManagerConfig;
  private activeProvider: ProviderName;

  constructor(config: ProviderManagerConfig) {
    this.config = config;
    this.activeProvider = config.preferred;
    this.buildProviders(config.providers);
  }

  // ── Instantiate provider objects from configs ──────────────
  private buildProviders(configs: ProviderConfig[]) {
    for (const cfg of configs) {
      switch (cfg.provider) {
        case 'ollama':
          this.providers.set('ollama', new OllamaProvider(cfg));
          break;
        case 'claude':
          this.providers.set('claude', new ClaudeProvider(cfg));
          break;
        case 'openai':
          this.providers.set('openai', new OpenAIProvider(cfg));
          break;
      }
    }
  }

  // ── Update a single provider config at runtime ─────────────
  // Called when user changes API key or model in Settings
  updateProvider(cfg: ProviderConfig) {
    switch (cfg.provider) {
      case 'ollama':
        this.providers.set('ollama', new OllamaProvider(cfg));
        break;
      case 'claude':
        this.providers.set('claude', new ClaudeProvider(cfg));
        break;
      case 'openai':
        this.providers.set('openai', new OpenAIProvider(cfg));
        break;
    }
  }

  setActive(provider: ProviderName) {
    if (!this.providers.has(provider)) {
      throw new Error(`Provider "${provider}" is not configured`);
    }
    this.activeProvider = provider;
  }

  getActive(): ProviderName {
    return this.activeProvider;
  }

  getProvider(name: ProviderName): AIProvider | undefined {
    return this.providers.get(name);
  }

  // ── List models from the active provider ───────────────────
  async listModels(provider?: ProviderName): Promise<string[]> {
    const p = this.providers.get(provider ?? this.activeProvider);
    return p?.listModels?.() ?? [];
  }

  // ── Health check a specific provider ─────────────────────
  async checkAvailability(provider: ProviderName): Promise<boolean> {
    const p = this.providers.get(provider);
    if (!p) return false;
    return p.isAvailable();
  }

  // ── Main chat with fallback ────────────────────────────────
  // Tries activeProvider first. On error or timeout, walks fallbackOrder.
  async *chat(
    messages: Message[],
    tools: ToolDefinition[] = [],
    systemPrompt?: string,
  ): AsyncGenerator<StreamDelta> {

    const order = this.buildFallbackOrder();

    for (let i = 0; i < order.length; i++) {
      const providerName = order[i];
      const provider = this.providers.get(providerName);

      if (!provider) continue;

      const isLast = i === order.length - 1;

      try {
        yield* this.chatWithTimeout(
          provider,
          messages,
          tools,
          systemPrompt,
          this.config.fallbackTimeoutMs,
          isLast,
          providerName,
        );
        return; // success — stop fallback chain

      } catch (err) {
        if (!this.config.fallbackOnError || isLast) {
          yield { type: 'error', message: `All providers failed. Last error: ${String(err)}` };
          return;
        }
        // Continue to next provider in fallback chain
        console.warn(`[ProviderManager] ${providerName} failed, trying next...`, err);
      }
    }
  }

  // ── Wraps provider.chat() with a timeout race ──────────────
  private async *chatWithTimeout(
    provider: AIProvider,
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt: string | undefined,
    timeoutMs: number,
    isLast: boolean,
    providerName: ProviderName,
  ): AsyncGenerator<StreamDelta> {

    // We collect deltas into a queue and race the first chunk vs timeout.
    // If no chunk arrives within timeoutMs → throw (triggers fallback).

    const gen = provider.chat(messages, tools, systemPrompt);
    let firstChunk = true;
    let timedOut = false;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        timedOut = true;
        reject(new Error(`${providerName} timed out after ${timeoutMs}ms`));
      }, timeoutMs)
    );

    // We can't race an async generator directly, so we pull the first value
    // and race it against the timeout
    const firstValuePromise = gen.next();

    // Only apply timeout to the FIRST chunk (connection timeout)
    // Subsequent chunks can take as long as needed
    const first = await (isLast
      ? firstValuePromise   // don't timeout on last provider
      : Promise.race([firstValuePromise, timeoutPromise])
    );

    if (first.done) return;

    const delta = first.value;

    // If first delta is an error, throw so fallback triggers
    if (delta.type === 'error' && !isLast) {
      throw new Error(delta.message);
    }

    yield delta;
    firstChunk = false;

    // Stream the rest
    for await (const d of gen) {
      if (timedOut) break;
      yield d;
    }
  }

  // ── Build the provider order for this request ─────────────
  private buildFallbackOrder(): ProviderName[] {
    if (!this.config.fallbackOnError) {
      return [this.activeProvider];
    }

    // Active provider first, then fallback chain (deduplicated)
    const order: ProviderName[] = [this.activeProvider];
    for (const p of this.config.fallbackOrder) {
      if (p !== this.activeProvider && this.providers.has(p)) {
        order.push(p);
      }
    }
    return order;
  }
}
