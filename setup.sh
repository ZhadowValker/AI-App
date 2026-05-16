#!/bin/bash
set -e

echo "🔍 Checking Node version..."
node --version

echo "⬆️  Upgrading to Node 20..."
# nvm is pre-installed in Codespaces
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
nvm alias default 20

echo "✅ Node version:"
node --version

echo ""
echo "🚀 Installing dependencies..."
npm install --legacy-peer-deps

echo ""
echo "✅ Done! Starting Expo with tunnel..."
echo ""
npx expo start --tunnel
