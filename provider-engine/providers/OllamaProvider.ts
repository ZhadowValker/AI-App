// ============================================================
// providers/OllamaProvider.ts
// Targets: https://ollama.com/v1 (cloud) or LAN http://x.x.x.x:11434
// Protocol: OpenAI-compatible /v1/chat/completions with NDJSON stream
// ============================================================

import type {
  AIProvider,
  Message,
  ToolDefinition,
  StreamDelta,
  OllamaConfig,
  ProviderName,
} from '../types';
import { parseOpenAIStream } from '../lib/streaming';

// Ollama uses OpenAI-compatible format, so we use parseOpenAIStream
// (not parseNDJSONStream — that's for /api/chat, the native endpoint)

export class OllamaProvider implements AIProvider {
  readonly name: ProviderName = 'ollama';
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = config;
  }

  // ── Convert our Message[] to OpenAI format ─────────────────
  private toOpenAIMessages(messages: Message[], systemPrompt?: string) {
    const result: Array<Record<string, unknown>> = [];

    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content });
        continue;
      }

      // Handle ContentBlock arrays (tool_use and tool_result)
      const toolResults = msg.content.filter(b => b.type === 'tool_result');
      const otherBlocks = msg.content.filter(b => b.type !== 'tool_result');

      // Tool results go as individual tool messages (OpenAI format)
      for (const block of toolResults) {
        if (block.type === 'tool_result') {
          result.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: block.content,
          });
        }
      }

      // Assemble assistant message with tool_calls
      if (msg.role === 'assistant' && otherBlocks.length > 0) {
        const textBlocks = otherBlocks.filter(b => b.type === 'text');
        const toolUseBlocks = otherBlocks.filter(b => b.type === 'tool_use');

        const assistantMsg: Record<string, unknown> = {
          role: 'assistant',
          content: textBlocks.map(b => b.type === 'text' ? b.text : '').join('') || null,
        };

        if (toolUseBlocks.length > 0) {
          assistantMsg.tool_calls = toolUseBlocks.map((b, i) => {
            if (b.type !== 'tool_use') return null;
            return {
              id: b.id,
              type: 'function',
              index: i,
              function: {
                name: b.name,
                arguments: JSON.stringify(b.input),
              },
            };
          }).filter(Boolean);
        }

        result.push(assistantMsg);
      } else if (msg.role === 'user' && otherBlocks.length > 0) {
        const text = otherBlocks
          .filter(b => b.type === 'text')
          .map(b => b.type === 'text' ? b.text : '')
          .join('');
        if (text) result.push({ role: 'user', content: text });
      }
    }

    return result;
  }

  // ── Convert our tools to OpenAI function format ─────────────
  private toOpenAITools(tools: ToolDefinition[]) {
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  // ── Main chat method ────────────────────────────────────────
  async *chat(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt?: string,
  ): AsyncGenerator<StreamDelta> {
    const url = `${this.config.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: this.toOpenAIMessages(messages, systemPrompt),
      stream: true,
    };

    if (tools.length > 0) {
      body.tools = this.toOpenAITools(tools);
      body.tool_choice = 'auto';
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        // React Native doesn't support AbortSignal.timeout, use manual timeout
      });
    } catch (err) {
      yield { type: 'error', message: `Ollama network error: ${String(err)}` };
      return;
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      yield { type: 'error', message: `Ollama HTTP ${response.status}: ${errText}` };
      return;
    }

    if (!response.body) {
      yield { type: 'error', message: 'Ollama: empty response body' };
      return;
    }

    yield* parseOpenAIStream(response.body);
  }

  // ── List available models from Ollama ───────────────────────
  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.config.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
      });
      if (!res.ok) return [];
      const data = await res.json() as { data?: Array<{ id: string }> };
      return (data.data ?? []).map(m => m.id);
    } catch {
      return [];
    }
  }

  // ── Health check ─────────────────────────────────────────────
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.config.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
