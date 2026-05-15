# Provider Engine

Multi-provider AI streaming engine for React Native.
Supports Ollama Cloud, Anthropic Claude, and OpenAI with unified tool calling.

## Install

```bash
npx expo install expo-secure-store
npm install @react-native-async-storage/async-storage zustand
```

## File Structure

```
provider-engine/
├── types/index.ts          # All shared TypeScript types
├── providers/
│   ├── OllamaProvider.ts   # Ollama Cloud (https://ollama.com/v1)
│   ├── ClaudeProvider.ts   # Anthropic Claude (native SSE)
│   ├── OpenAIProvider.ts   # OpenAI GPT
│   └── ProviderManager.ts  # Router with fallback chain
├── lib/
│   ├── streaming.ts        # SSE + NDJSON + OpenAI stream parsers
│   ├── toolLoop.ts         # Agentic multi-turn tool execution engine
│   ├── patVault.ts         # SecureStore (iOS Keychain / Android Keystore)
│   └── useProviderEngine.ts # React hook — main interface for screens
├── store/
│   └── providerStore.ts    # Zustand store for settings
└── index.ts                # Barrel exports
```

## Quick Start

### 1. Save keys securely
```typescript
import { PatVault } from './provider-engine';

await PatVault.saveOllamaKey('your-ollama-api-key');
await PatVault.saveGitHubPAT('your-github-pat');
```

### 2. Configure provider settings (in Settings screen)
```typescript
import { useProviderStore } from './provider-engine';

const { updateOllamaSettings, setPreferred } = useProviderStore();

updateOllamaSettings({
  baseUrl: 'https://ollama.com/v1',
  model: 'minimax/minimax-m1',
  enabled: true,
});
setPreferred('ollama');
```

### 3. Use in Chat screen
```typescript
import { useProviderEngine } from './provider-engine';
import { GITHUB_TOOLS } from './tools/github';   // Phase 4

function ChatScreen() {
  const { messages, isLoading, sendMessage } = useProviderEngine(GITHUB_TOOLS);

  return (
    // your UI
    // call sendMessage(userText) on submit
  );
}
```

## Stream Parsers

| Provider | Protocol | Parser |
|---|---|---|
| Claude | SSE (text/event-stream) | `parseSSEStream` |
| Ollama native | NDJSON (/api/chat) | `parseNDJSONStream` |
| Ollama cloud | SSE OpenAI-compat (/v1) | `parseOpenAIStream` |
| OpenAI | SSE OpenAI-compat | `parseOpenAIStream` |

## Fallback Chain

```
Preferred: ollama
  ↓ (timeout 5s or error)
Fallback 1: claude
  ↓ (error)
Fallback 2: openai
```

Configure via `useProviderStore().updateSettings({ fallbackOrder: [...], fallbackTimeoutMs: 5000 })`.

## Tool Loop

The agentic loop in `toolLoop.ts` handles:
1. Stream model response
2. Detect `tool_use` blocks
3. Execute tools (parallel by default)
4. Inject `tool_result` blocks
5. Repeat until `end_turn` with no tool calls (max 10 turns)
