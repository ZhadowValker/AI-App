// ============================================================
// App.tsx — Root app
// Adds: ErrorBoundary (crash recovery) + OfflineBanner
// ============================================================

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

import ChatScreen     from './src/screens/ChatScreen';
import RepoScreen     from './src/screens/RepoScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { ErrorBoundary }  from './src/components/ErrorBoundary';
import { OfflineBanner }  from './src/components/OfflineBanner';

const Tab = createBottomTabNavigator();

function AppNavigator() {
  return (
    <>
      {/* Sticky offline/Ollama-down banner below the header */}
      <OfflineBanner />

      <Tab.Navigator
        screenOptions={{
          headerStyle:           { backgroundColor: '#0d1117' },
          headerTintColor:       '#e6edf3',
          tabBarStyle:           { backgroundColor: '#161b22', borderTopColor: '#30363d' },
          tabBarActiveTintColor:   '#58a6ff',
          tabBarInactiveTintColor: '#8b949e',
          headerTitleStyle:      { fontWeight: '700' },
        }}
      >
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            title: 'AI Chat',
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💬</Text>,
          }}
        />
        <Tab.Screen
          name="Repos"
          component={RepoScreen}
          options={{
            title: 'Repositories',
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📁</Text>,
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: 'Settings',
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>⚙️</Text>,
          }}
        />
      </Tab.Navigator>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <NavigationContainer>
        <StatusBar style="light" />
        <AppNavigator />
      </NavigationContainer>
    </ErrorBoundary>
  );
}
