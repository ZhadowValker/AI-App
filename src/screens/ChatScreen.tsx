// ============================================================
// src/screens/ChatScreen.tsx
// Main chat interface — streaming messages, tool call cards,
// provider badge, model indicator.
// ============================================================

import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  StyleSheet, SafeAreaView,
} from 'react-native';

// Import from your local provider-engine and github-tools packages
import { useProviderEngine }  from '../../provider-engine/lib/useProviderEngine';
import { useGitHubTools }     from '../../github-tools/tools/ToolRegistry';
import { TOOL_META }          from '../../github-tools/tools/ToolRegistry';
import { useProviderStore }   from '../../provider-engine/store/providerStore';
import type { ChatMessage, ToolCallRecord } from '../../provider-engine/lib/useProviderEngine';

// ── Tool Call Card ────────────────────────────────────────────

function ToolCallCard({ toolCall }: { toolCall: ToolCallRecord }) {
  const meta = TOOL_META[toolCall.name];
  const isPending = toolCall.status === 'pending';
  const isError   = toolCall.status === 'error';

  return (
    <View style={[
      styles.toolCard,
      isError   && styles.toolCardError,
      !isPending && !isError && styles.toolCardDone,
    ]}>
      <View style={styles.toolCardHeader}>
        <Text style={styles.toolCardIcon}>{meta?.icon ?? '🔧'}</Text>
        <Text style={styles.toolCardName}>{meta?.label ?? toolCall.name}</Text>
        <Text style={styles.toolCardStatus}>
          {isPending ? '⏳' : isError ? '❌' : '✅'}
        </Text>
      </View>
      {/* Show key inputs */}
      {toolCall.input && (
        <Text style={styles.toolCardInput} numberOfLines={2}>
          {Object.entries(toolCall.input)
            .filter(([k]) => ['owner','repo','path','query','title','branch','issue_number','run_id'].includes(k))
            .map(([k, v]) => `${k}: ${v}`)
            .join(' · ')}
        </Text>
      )}
    </View>
  );
}

// ── Message Bubble ────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser      = message.role === 'user';
  const isStreaming  = message.status === 'streaming';

  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
      {!isUser && <Text style={styles.avatar}>🤖</Text>}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>

        {/* Tool call cards — shown above the text */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <View style={styles.toolCallsContainer}>
            {message.toolCalls.map(tc => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </View>
        )}

        {/* Message text */}
        {message.text ? (
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
            {message.text}
          </Text>
        ) : isStreaming ? (
          <ActivityIndicator size="small" color="#58a6ff" />
        ) : null}

        {/* Streaming indicator */}
        {isStreaming && message.text.length > 0 && (
          <Text style={styles.cursor}>▌</Text>
        )}
      </View>
    </View>
  );
}

// ── Provider Badge ────────────────────────────────────────────

function ProviderBadge() {
  const { settings } = useProviderStore();
  const labels: Record<string, string> = {
    ollama: '🦙 Ollama',
    claude: '🟣 Claude',
    openai: '🟢 OpenAI',
  };
  return (
    <View style={styles.providerBadge}>
      <Text style={styles.providerBadgeText}>
        {labels[settings.preferred] ?? settings.preferred} · {
          settings.preferred === 'ollama' ? settings.ollama.model :
          settings.preferred === 'claude' ? settings.claude.model :
          settings.openai.model
        }
      </Text>
    </View>
  );
}

// ── Suggested prompts ─────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  'List my GitHub repos',
  'Show open issues in owner/repo',
  'Trigger the deploy workflow on main',
  'Read the README.md of owner/repo',
  'Create a branch feat/new-feature from main',
];

// ── Main Chat Screen ──────────────────────────────────────────

export default function ChatScreen() {
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const { tools, status: githubStatus } = useGitHubTools();
  const { messages, isLoading, sendMessage, clearMessages } = useProviderEngine(tools);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    await sendMessage(text, SYSTEM_PROMPT);
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [inputText, isLoading, sendMessage]);

  const handleSuggest = useCallback((prompt: string) => {
    setInputText(prompt);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        {/* Provider badge */}
        <ProviderBadge />

        {/* GitHub status warning */}
        {githubStatus === 'no-pat' && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              ⚠️ No GitHub PAT set — go to Settings to add your token
            </Text>
          </View>
        )}

        {/* Message list */}
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>What do you want to do?</Text>
            <Text style={styles.emptySubtitle}>Try one of these:</Text>
            {SUGGESTED_PROMPTS.map(p => (
              <TouchableOpacity
                key={p}
                style={styles.suggestionChip}
                onPress={() => handleSuggest(p)}
              >
                <Text style={styles.suggestionText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          {messages.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={clearMessages}>
              <Text style={styles.clearBtnText}>🗑</Text>
            </TouchableOpacity>
          )}
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask anything about your repos..."
            placeholderTextColor="#8b949e"
            multiline
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || isLoading) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading}
          >
            {isLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.sendBtnText}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── System prompt ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an AI GitHub assistant with access to the user's GitHub repositories.
You can read files, create branches, open pull requests, manage issues, and trigger workflows.

When the user asks about a repo, always use the available tools to fetch real data.
Format code blocks using markdown. Be concise and action-oriented.
When you create a PR or issue, confirm with the URL.
If you're unsure of the owner/repo, ask the user before calling a tool.`;

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0d1117' },
  flex:             { flex: 1 },
  messageList:      { padding: 12, paddingBottom: 8 },

  // Provider badge
  providerBadge:    { backgroundColor: '#161b22', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#30363d' },
  providerBadgeText:{ color: '#8b949e', fontSize: 12, textAlign: 'center' },

  // Warning
  warningBanner:    { backgroundColor: '#2d1b00', padding: 10, borderBottomWidth: 1, borderBottomColor: '#d29922' },
  warningText:      { color: '#d29922', fontSize: 13, textAlign: 'center' },

  // Empty state
  emptyState:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle:       { color: '#e6edf3', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySubtitle:    { color: '#8b949e', fontSize: 14, marginBottom: 16 },
  suggestionChip:   { backgroundColor: '#161b22', borderWidth: 1, borderColor: '#30363d', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 8 },
  suggestionText:   { color: '#58a6ff', fontSize: 14 },

  // Messages
  messageRow:       { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-start' },
  messageRowUser:   { justifyContent: 'flex-end' },
  avatar:           { fontSize: 24, marginRight: 8, marginTop: 4 },
  bubble:           { maxWidth: '85%', borderRadius: 14, padding: 12 },
  bubbleUser:       { backgroundColor: '#1f6feb', borderBottomRightRadius: 4 },
  bubbleAssistant:  { backgroundColor: '#161b22', borderWidth: 1, borderColor: '#30363d', borderBottomLeftRadius: 4 },
  bubbleText:       { color: '#e6edf3', fontSize: 15, lineHeight: 22 },
  bubbleTextUser:   { color: '#ffffff' },
  cursor:           { color: '#58a6ff', fontSize: 15 },

  // Tool cards
  toolCallsContainer: { marginBottom: 8 },
  toolCard:         { backgroundColor: '#0d1117', borderRadius: 8, padding: 8, marginBottom: 4, borderWidth: 1, borderColor: '#30363d' },
  toolCardError:    { borderColor: '#f85149' },
  toolCardDone:     { borderColor: '#3fb950' },
  toolCardHeader:   { flexDirection: 'row', alignItems: 'center' },
  toolCardIcon:     { fontSize: 14, marginRight: 6 },
  toolCardName:     { color: '#e6edf3', fontSize: 13, fontWeight: '600', flex: 1 },
  toolCardStatus:   { fontSize: 14 },
  toolCardInput:    { color: '#8b949e', fontSize: 11, marginTop: 4 },

  // Input bar
  inputBar:         { flexDirection: 'row', alignItems: 'flex-end', padding: 8, borderTopWidth: 1, borderTopColor: '#30363d', backgroundColor: '#161b22' },
  clearBtn:         { padding: 8, marginRight: 4 },
  clearBtnText:     { fontSize: 18 },
  input:            { flex: 1, backgroundColor: '#0d1117', borderRadius: 22, borderWidth: 1, borderColor: '#30363d', paddingHorizontal: 16, paddingVertical: 10, color: '#e6edf3', fontSize: 15, maxHeight: 120 },
  sendBtn:          { width: 40, height: 40, borderRadius: 20, backgroundColor: '#238636', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  sendBtnDisabled:  { backgroundColor: '#21262d' },
  sendBtnText:      { color: '#fff', fontSize: 18, fontWeight: '700' },
});
