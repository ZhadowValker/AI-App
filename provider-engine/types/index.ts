// ============================================================
// types/index.ts — Shared types across all providers
// ============================================================

export type ProviderName = 'ollama' | 'claude' | 'openai';

// ── Message types ────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system';

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextContent | ToolUseContent | ToolResultContent;

export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
}

// ── Tool definition ──────────────────────────────────────────

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: JSONSchema;
}

// ── Stream delta types ───────────────────────────────────────

export interface TextDelta {
  type: 'text_delta';
  text: string;
}

export interface ToolUseDelta {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface StreamDone {
  type: 'done';
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
}

export interface StreamError {
  type: 'error';
  message: string;
}

export type StreamDelta = TextDelta | ToolUseDelta | StreamDone | StreamError;

// ── Provider config ──────────────────────────────────────────

export interface OllamaConfig {
  provider: 'ollama';
  baseUrl: string;           // e.g. https://ollama.com/v1
  apiKey: string;
  model: string;             // e.g. minimax/minimax-m1
  timeoutMs?: number;
}

export interface ClaudeConfig {
  provider: 'claude';
  apiKey: string;
  model: string;             // e.g. claude-sonnet-4-20250514
  maxTokens?: number;
}

export interface OpenAIConfig {
  provider: 'openai';
  apiKey: string;
  model: string;             // e.g. gpt-4o
  baseUrl?: string;          // optional custom endpoint
}

export type ProviderConfig = OllamaConfig | ClaudeConfig | OpenAIConfig;

// ── Provider interface (all providers implement this) ────────

export interface AIProvider {
  name: ProviderName;
  chat(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt?: string,
  ): AsyncGenerator<StreamDelta>;
  listModels?(): Promise<string[]>;
  isAvailable(): Promise<boolean>;
}

// ── Provider Manager config ──────────────────────────────────

export interface ProviderManagerConfig {
  providers: ProviderConfig[];
  preferred: ProviderName;
  fallbackOrder: ProviderName[];
  fallbackOnError: boolean;
  fallbackTimeoutMs: number;   // how long to wait before falling back
}

// ── Tool result ──────────────────────────────────────────────

export interface ToolResult {
  type: 'text' | 'json' | 'error';
  text?: string;
  data?: unknown;
  error?: string;
}
