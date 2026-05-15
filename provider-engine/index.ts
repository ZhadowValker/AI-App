// ============================================================
// index.ts — Provider Engine public API
// Import from here in your React Native screens
// ============================================================

// Types
export type {
  ProviderName,
  ProviderConfig,
  OllamaConfig,
  ClaudeConfig,
  OpenAIConfig,
  Message,
  ContentBlock,
  TextContent,
  ToolUseContent,
  ToolResultContent,
  ToolDefinition,
  StreamDelta,
  TextDelta,
  ToolUseDelta,
  StreamDone,
  StreamError,
  JSONSchema,
  AIProvider,
  ProviderManagerConfig,
  ToolResult,
} from './types';

// Providers
export { OllamaProvider }   from './providers/OllamaProvider';
export { ClaudeProvider }   from './providers/ClaudeProvider';
export { OpenAIProvider }   from './providers/OpenAIProvider';
export { ProviderManager }  from './providers/ProviderManager';

// Stream parsers (advanced use)
export { parseSSEStream, parseNDJSONStream, parseOpenAIStream } from './lib/streaming';

// Tool loop
export { runToolLoop } from './lib/toolLoop';
export type { Tool, ToolLoopCallbacks, ToolLoopOptions } from './lib/toolLoop';

// Secure storage
export { PatVault } from './lib/patVault';

// React hook (primary interface for screens)
export { useProviderEngine } from './lib/useProviderEngine';
export type { ChatMessage, ToolCallRecord, MessageStatus } from './lib/useProviderEngine';

// Zustand store
export { useProviderStore } from './store/providerStore';
export type { ProviderSettings } from './store/providerStore';
