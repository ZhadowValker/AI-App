#!/bin/bash
set -e

echo "🔍 Current Node: $(node --version)"

# Install Node 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
sudo apt-get install -y nodejs 2>/dev/null

# Force shell to use new node binary
export PATH="/usr/bin:$PATH"
hash -r

echo "✅ Node after upgrade: $(node --version)"

# If still on 16, use npx with explicit node path
NODE_BIN=$(which node)
NODE_VER=$($NODE_BIN --version)
echo "Using node at: $NODE_BIN ($NODE_VER)"

# Wipe node_modules to force clean install with correct Node
echo "🧹 Cleaning node_modules..."
rm -rf node_modules package-lock.json

echo "🚀 Installing dependencies..."
npm install --legacy-peer-deps

echo ""
echo "✅ Starting Expo..."
npx expo start --tunnel
