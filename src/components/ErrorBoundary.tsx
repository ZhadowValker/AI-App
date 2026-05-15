// ============================================================
// src/components/ErrorBoundary.tsx
// Class component — only class components can be error boundaries.
// Catches render errors and shows a recovery UI instead of crashing.
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';

interface Props   { children: React.ReactNode; fallbackLabel?: string; }
interface State   { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.icon}>💥</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message} numberOfLines={6}>
            {this.state.error?.message ?? 'Unknown error'}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={this.reset}>
            <Text style={styles.btnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117', justifyContent: 'center', padding: 24 },
  card:      { backgroundColor: '#161b22', borderRadius: 12, padding: 24, borderWidth: 1, borderColor: '#f85149' },
  icon:      { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  title:     { color: '#f85149', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  message:   { color: '#8b949e', fontSize: 13, fontFamily: 'monospace', marginBottom: 20 },
  btn:       { backgroundColor: '#238636', borderRadius: 8, padding: 12, alignItems: 'center' },
  btnText:   { color: '#fff', fontWeight: '700' },
});
