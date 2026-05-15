# GitHub AI App

AI-powered GitHub mobile app built with React Native + Expo.

## Features
- 🤖 Multi-provider AI (Ollama, Claude, OpenAI)
- 🐙 Full GitHub integration (repos, PRs, issues, workflows)
- 📱 iOS + Android via Expo Go
- 🔒 Secure key storage (Keychain/Keystore)

## Structure
- `provider-engine/` — AI streaming engine
- `github-tools/` — 21 GitHub tools
- `src/` — React Native screens & components
- `gateway/` — Node.js cloud backend

## Setup
```bash
npm install
npx expo start --tunnel
```
