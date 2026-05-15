// ============================================================
// providers/ClaudeProvider.ts
// Targets: https://api.anthropic.com/v1/messages
// Protocol: Anthropic native SSE with tool_use content blocks
// ============================================================

import type {
  AIProvider,
  Message,
  ToolDefinition,
  StreamDelta,
  ClaudeConfig,
  ProviderName,
  ContentBlock,
} from '../types';
import { parseSSEStream } from '../lib/streaming';

const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_BETA = 'tools-2024-04-04';
const DEFAULT_MAX_TOKENS = 8192;

export class ClaudeProvider implements AIProvider {
  readonly name: ProviderName = 'claude';
  private config: ClaudeConfig;

  constructor(config: ClaudeConfig) {
    this.config = config;
  }

  // ── Convert our messages to Anthropic format ───────────────
  // Key differences from OpenAI:
  //  - system is a top-level param, not a message
  //  - tool results go as user messages with content blocks
  //  - assistant messages can have mixed text + tool_use blocks
  private toAnthropicMessages(messages: Message[]): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content });
        continue;
      }

      // Claude uses content blocks directly — our internal format matches
      // but we need to ensure no 'system' role sneaks through
      if (msg.role === 'system') continue;   // system is handled separately

      result.push({
        role: msg.role,
        content: msg.content as ContentBlock[],
      });
    }

    return result;
  }

  // ── Convert tool definitions to Anthropic format ───────────
  private toAnthropicTools(tools: ToolDefinition[]) {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
  }

  // ── Main chat method ────────────────────────────────────────
  async *chat(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt?: string,
  ): AsyncGenerator<StreamDelta> {

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: this.config.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: this.toAnthropicMessages(messages),
      stream: true,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (tools.length > 0) {
      body.tools = this.toAnthropicTools(tools);
      // tool_choice defaults to 'auto' — model decides when to use tools
    }

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-beta': ANTHROPIC_BETA,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      yield { type: 'error', message: `Claude network error: ${String(err)}` };
      return;
    }

    if (!response.ok) {
      let errMsg = `Claude HTTP ${response.status}`;
      try {
        const errData = await response.json() as { error?: { message?: string } };
        errMsg += `: ${errData.error?.message ?? 'unknown error'}`;
      } catch { /* */ }
      yield { type: 'error', message: errMsg };
      return;
    }

    if (!response.body) {
      yield { type: 'error', message: 'Claude: empty response body' };
      return;
    }

    yield* parseSSEStream(response.body);
  }

  // ── Health check ─────────────────────────────────────────────
  async isAvailable(): Promise<boolean> {
    // Claude doesn't have a /health endpoint — just validate key format
    // Real availability check would send a minimal message
    return this.config.apiKey.startsWith('sk-ant-');
  }

  // Claude doesn't expose a model list API — return known models
  async listModels(): Promise<string[]> {
    return [
      'claude-opus-4-5',
      'claude-sonnet-4-5',
      'claude-haiku-4-5-20251001',
    ];
  }
}
