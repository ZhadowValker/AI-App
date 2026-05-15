// ============================================================
// providers/OpenAIProvider.ts
// Targets: https://api.openai.com/v1 (or custom baseUrl)
// Protocol: OpenAI SSE with function calling
// ============================================================

import type {
  AIProvider,
  Message,
  ToolDefinition,
  StreamDelta,
  OpenAIConfig,
  ProviderName,
} from '../types';
import { parseOpenAIStream } from '../lib/streaming';

export class OpenAIProvider implements AIProvider {
  readonly name: ProviderName = 'openai';
  private config: OpenAIConfig;
  private baseUrl: string;

  constructor(config: OpenAIConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }

  // ── Convert messages to OpenAI format ─────────────────────
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

      const toolResults = msg.content.filter(b => b.type === 'tool_result');
      const otherBlocks = msg.content.filter(b => b.type !== 'tool_result');

      // Tool results become separate 'tool' role messages
      for (const block of toolResults) {
        if (block.type === 'tool_result') {
          result.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: block.content,
          });
        }
      }

      if (msg.role === 'assistant') {
        const textContent = otherBlocks
          .filter(b => b.type === 'text')
          .map(b => b.type === 'text' ? b.text : '')
          .join('');

        const toolUseBlocks = otherBlocks.filter(b => b.type === 'tool_use');

        const assistantMsg: Record<string, unknown> = {
          role: 'assistant',
          content: textContent || null,
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

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: this.toOpenAIMessages(messages, systemPrompt),
      stream: true,
      stream_options: { include_usage: false },
    };

    if (tools.length > 0) {
      body.tools = this.toOpenAITools(tools);
      body.tool_choice = 'auto';
      body.parallel_tool_calls = true;    // execute multiple tools simultaneously
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      yield { type: 'error', message: `OpenAI network error: ${String(err)}` };
      return;
    }

    if (!response.ok) {
      let errMsg = `OpenAI HTTP ${response.status}`;
      try {
        const errData = await response.json() as { error?: { message?: string } };
        errMsg += `: ${errData.error?.message ?? 'unknown'}`;
      } catch { /* */ }
      yield { type: 'error', message: errMsg };
      return;
    }

    if (!response.body) {
      yield { type: 'error', message: 'OpenAI: empty response body' };
      return;
    }

    yield* parseOpenAIStream(response.body);
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
      });
      if (!res.ok) return [];
      const data = await res.json() as { data?: Array<{ id: string }> };
      return (data.data ?? [])
        .map(m => m.id)
        .filter(id => id.startsWith('gpt-') || id.startsWith('o'))
        .sort();
    } catch {
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.config.apiKey.startsWith('sk-');
  }
}
