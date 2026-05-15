// ============================================================
// lib/streaming.ts — SSE (Claude) + NDJSON (Ollama) parsers
// ============================================================

import type { StreamDelta, ToolUseDelta } from '../types';

// ── SSE Parser (Claude uses Server-Sent Events) ──────────────
// Claude SSE event format:
//   event: content_block_delta
//   data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}

export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamDelta> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Accumulates partial tool_use input JSON across deltas
  const toolInputBuffers: Record<string, string> = {};
  const toolMeta: Record<string, { name: string }> = {};

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';       // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') return;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(raw);
        } catch {
          continue;
        }

        const type = event.type as string;

        // ── Text streaming ──────────────────────────────────
        if (type === 'content_block_delta') {
          const delta = event.delta as Record<string, unknown>;
          if (delta.type === 'text_delta') {
            yield { type: 'text_delta', text: delta.text as string };
          }
          // Accumulate tool input JSON (Claude streams it in chunks)
          if (delta.type === 'input_json_delta') {
            const idx = String(event.index);
            toolInputBuffers[idx] = (toolInputBuffers[idx] ?? '') + (delta.partial_json as string);
          }
        }

        // ── Tool use block start ────────────────────────────
        if (type === 'content_block_start') {
          const block = event.content_block as Record<string, unknown>;
          if (block.type === 'tool_use') {
            const idx = String(event.index);
            toolMeta[idx] = { name: block.name as string };
            toolInputBuffers[idx] = '';
          }
        }

        // ── Tool use block stop → emit full ToolUseDelta ───
        if (type === 'content_block_stop') {
          const idx = String(event.index);
          if (toolMeta[idx]) {
            let input: Record<string, unknown> = {};
            try {
              input = JSON.parse(toolInputBuffers[idx] ?? '{}');
            } catch { /* malformed JSON from model */ }

            const toolDelta: ToolUseDelta = {
              type: 'tool_use',
              id: `tool_${idx}_${Date.now()}`,
              name: toolMeta[idx].name,
              input,
            };
            yield toolDelta;
            delete toolMeta[idx];
            delete toolInputBuffers[idx];
          }
        }

        // ── Stream end ──────────────────────────────────────
        if (type === 'message_delta') {
          const delta = event.delta as Record<string, unknown>;
          if (delta.stop_reason) {
            yield {
              type: 'done',
              stop_reason: delta.stop_reason as StreamDelta extends { type: 'done' }
                ? StreamDelta['stop_reason']
                : never,
            } as StreamDelta;
          }
        }

        // ── Error ───────────────────────────────────────────
        if (type === 'error') {
          const err = event.error as Record<string, unknown>;
          yield { type: 'error', message: String(err?.message ?? 'Unknown SSE error') };
          return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── NDJSON Parser (Ollama uses newline-delimited JSON) ────────
// Ollama stream format:
//   {"model":"qwen2.5-coder","message":{"role":"assistant","content":"hello"},"done":false}
//   {"model":"qwen2.5-coder","message":{"role":"assistant","content":""},"done":true}

export async function* parseNDJSONStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamDelta> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Ollama tool calls come as a complete object in one chunk, not streamed
  // Format: message.tool_calls[{function:{name,arguments}}]
  let toolCallIndex = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let chunk: Record<string, unknown>;
        try {
          chunk = JSON.parse(trimmed);
        } catch {
          continue;
        }

        const message = chunk.message as Record<string, unknown> | undefined;
        if (!message) continue;

        // ── Text delta ──────────────────────────────────────
        const content = message.content as string | undefined;
        if (content) {
          yield { type: 'text_delta', text: content };
        }

        // ── Tool calls (Ollama OpenAI-compat format) ────────
        const toolCalls = message.tool_calls as Array<Record<string, unknown>> | undefined;
        if (toolCalls?.length) {
          for (const tc of toolCalls) {
            const fn = tc.function as Record<string, unknown>;
            let input: Record<string, unknown> = {};
            try {
              input = typeof fn.arguments === 'string'
                ? JSON.parse(fn.arguments)
                : (fn.arguments as Record<string, unknown>);
            } catch { /* bad JSON */ }

            yield {
              type: 'tool_use',
              id: `ollama_tool_${toolCallIndex++}_${Date.now()}`,
              name: fn.name as string,
              input,
            };
          }
        }

        // ── Done ────────────────────────────────────────────
        if (chunk.done === true) {
          yield { type: 'done', stop_reason: toolCalls?.length ? 'tool_use' : 'end_turn' };
        }

        // ── Error ───────────────────────────────────────────
        if (chunk.error) {
          yield { type: 'error', message: String(chunk.error) };
          return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── OpenAI SSE Parser (also used for Ollama OpenAI-compat) ───
// OpenAI SSE format:
//   data: {"choices":[{"delta":{"content":"hello"}}]}

export async function* parseOpenAIStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamDelta> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const toolInputBuffers: Record<string | number, string> = {};
  const toolMeta: Record<string | number, { id: string; name: string }> = {};

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') {
          // Flush any pending tool calls
          for (const idx of Object.keys(toolMeta)) {
            let input: Record<string, unknown> = {};
            try { input = JSON.parse(toolInputBuffers[idx] ?? '{}'); } catch { /* */ }
            yield {
              type: 'tool_use',
              id: toolMeta[idx].id,
              name: toolMeta[idx].name,
              input,
            };
          }
          yield { type: 'done', stop_reason: 'end_turn' };
          return;
        }

        let chunk: Record<string, unknown>;
        try { chunk = JSON.parse(raw); } catch { continue; }

        const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
        if (!choices?.length) continue;

        const delta = choices[0].delta as Record<string, unknown> | undefined;
        if (!delta) continue;

        // ── Text delta ──────────────────────────────────────
        if (typeof delta.content === 'string' && delta.content) {
          yield { type: 'text_delta', text: delta.content };
        }

        // ── Tool call streaming ─────────────────────────────
        const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
        if (toolCalls) {
          for (const tc of toolCalls) {
            const idx = tc.index as number;
            const fn = tc.function as Record<string, unknown> | undefined;

            if (tc.id) {
              // First chunk for this tool call — store metadata
              toolMeta[idx] = { id: tc.id as string, name: '' };
              toolInputBuffers[idx] = '';
            }
            if (fn?.name && toolMeta[idx]) {
              toolMeta[idx].name += fn.name as string;
            }
            if (fn?.arguments && toolMeta[idx]) {
              toolInputBuffers[idx] += fn.arguments as string;
            }
          }
        }

        // ── Finish reason ───────────────────────────────────
        const finishReason = choices[0].finish_reason as string | null;
        if (finishReason === 'tool_calls') {
          for (const idx of Object.keys(toolMeta)) {
            let input: Record<string, unknown> = {};
            try { input = JSON.parse(toolInputBuffers[idx] ?? '{}'); } catch { /* */ }
            yield {
              type: 'tool_use',
              id: toolMeta[idx].id,
              name: toolMeta[idx].name,
              input,
            };
          }
          yield { type: 'done', stop_reason: 'tool_use' };
        } else if (finishReason === 'stop') {
          yield { type: 'done', stop_reason: 'end_turn' };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
