// ============================================================
// lib/toolLoop.ts
// The agentic execution engine.
// Runs multi-turn: model streams → tool calls → execute → inject results → repeat
// until model produces end_turn with no tool calls.
// ============================================================

import type {
  Message,
  ToolDefinition,
  StreamDelta,
  ContentBlock,
  ToolUseContent,
  ToolResultContent,
} from '../types';
import type { ProviderManager } from '../providers/ProviderManager';
import type { ToolResult } from '../types';

// ── Tool callable interface ──────────────────────────────────

export interface Tool {
  definition: ToolDefinition;
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}

// ── Callbacks for UI updates ─────────────────────────────────

export interface ToolLoopCallbacks {
  onTextDelta: (text: string) => void;
  onToolCall: (id: string, name: string, input: Record<string, unknown>) => void;
  onToolResult: (id: string, name: string, result: ToolResult) => void;
  onTurnStart: (turn: number) => void;
  onError: (message: string) => void;
}

export interface ToolLoopOptions {
  systemPrompt?: string;
  maxTurns?: number;        // prevent infinite loops (default: 10)
  parallelTools?: boolean;  // execute tool calls in parallel (default: true)
}

// ── Main agent loop ──────────────────────────────────────────

export async function runToolLoop(
  userMessage: string,
  provider: ProviderManager,
  tools: Tool[],
  callbacks: ToolLoopCallbacks,
  options: ToolLoopOptions = {},
): Promise<Message[]> {

  const {
    systemPrompt,
    maxTurns = 10,
    parallelTools = true,
  } = options;

  const toolDefs = tools.map(t => t.definition);
  const toolMap = new Map(tools.map(t => [t.definition.name, t]));

  // Build initial message history
  const messages: Message[] = [
    { role: 'user', content: userMessage }
  ];

  for (let turn = 0; turn < maxTurns; turn++) {
    callbacks.onTurnStart(turn);

    // ── Stream from provider ─────────────────────────────────
    const assistantContent: ContentBlock[] = [];
    let currentText = '';
    let encounteredError = false;

    for await (const delta of provider.chat(messages, toolDefs, systemPrompt)) {

      if (delta.type === 'text_delta') {
        currentText += delta.text;
        callbacks.onTextDelta(delta.text);

      } else if (delta.type === 'tool_use') {
        // Flush any accumulated text before tool block
        if (currentText) {
          assistantContent.push({ type: 'text', text: currentText });
          currentText = '';
        }

        const toolBlock: ToolUseContent = {
          type: 'tool_use',
          id: delta.id,
          name: delta.name,
          input: delta.input,
        };
        assistantContent.push(toolBlock);
        callbacks.onToolCall(delta.id, delta.name, delta.input);

      } else if (delta.type === 'done') {
        // Stream finished cleanly
        if (currentText) {
          assistantContent.push({ type: 'text', text: currentText });
          currentText = '';
        }

      } else if (delta.type === 'error') {
        callbacks.onError(delta.message);
        encounteredError = true;
        break;
      }
    }

    if (encounteredError) break;

    // Add assistant turn to history
    messages.push({ role: 'assistant', content: assistantContent });

    // ── Check for tool calls ─────────────────────────────────
    const toolCalls = assistantContent.filter(
      (b): b is ToolUseContent => b.type === 'tool_use'
    );

    if (toolCalls.length === 0) {
      // No tool calls → model is done
      break;
    }

    // ── Execute tools ────────────────────────────────────────
    const toolResultBlocks: ToolResultContent[] = parallelTools
      ? await executeToolsParallel(toolCalls, toolMap, callbacks)
      : await executeToolsSerial(toolCalls, toolMap, callbacks);

    // Inject tool results as next user turn
    messages.push({ role: 'user', content: toolResultBlocks });
  }

  return messages;
}

// ── Parallel tool execution ───────────────────────────────────

async function executeToolsParallel(
  toolCalls: ToolUseContent[],
  toolMap: Map<string, Tool>,
  callbacks: ToolLoopCallbacks,
): Promise<ToolResultContent[]> {

  const results = await Promise.allSettled(
    toolCalls.map(tc => executeSingleTool(tc, toolMap, callbacks))
  );

  return results.map((r, i) => {
    const tc = toolCalls[i];
    if (r.status === 'fulfilled') {
      return r.value;
    }
    // Tool threw — return error result
    callbacks.onToolResult(tc.id, tc.name, {
      type: 'error',
      error: String(r.reason),
    });
    return {
      type: 'tool_result' as const,
      tool_use_id: tc.id,
      content: JSON.stringify({ error: String(r.reason) }),
      is_error: true,
    };
  });
}

// ── Serial tool execution (fallback) ─────────────────────────

async function executeToolsSerial(
  toolCalls: ToolUseContent[],
  toolMap: Map<string, Tool>,
  callbacks: ToolLoopCallbacks,
): Promise<ToolResultContent[]> {

  const results: ToolResultContent[] = [];
  for (const tc of toolCalls) {
    results.push(await executeSingleTool(tc, toolMap, callbacks));
  }
  return results;
}

// ── Execute one tool call ─────────────────────────────────────

async function executeSingleTool(
  tc: ToolUseContent,
  toolMap: Map<string, Tool>,
  callbacks: ToolLoopCallbacks,
): Promise<ToolResultContent> {

  const tool = toolMap.get(tc.name);

  if (!tool) {
    const result: ToolResult = { type: 'error', error: `Unknown tool: ${tc.name}` };
    callbacks.onToolResult(tc.id, tc.name, result);
    return {
      type: 'tool_result',
      tool_use_id: tc.id,
      content: JSON.stringify({ error: result.error }),
      is_error: true,
    };
  }

  let result: ToolResult;
  try {
    result = await tool.execute(tc.input);
  } catch (err) {
    result = { type: 'error', error: String(err) };
  }

  callbacks.onToolResult(tc.id, tc.name, result);

  const content = result.type === 'json'
    ? JSON.stringify(result.data)
    : result.type === 'error'
    ? JSON.stringify({ error: result.error })
    : (result.text ?? '');

  return {
    type: 'tool_result',
    tool_use_id: tc.id,
    content,
    is_error: result.type === 'error',
  };
}
