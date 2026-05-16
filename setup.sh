#!/bin/bash
set -e

echo "🔍 Current Node: $(node --version)"
echo "⬆️  Upgrading to Node 20 via apt..."

# Install Node 20 via NodeSource — works in any Debian/Ubuntu environment
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "✅ Node: $(node --version)"
echo "✅ npm: $(npm --version)"
echo ""
echo "🚀 Installing dependencies..."
npm install --legacy-peer-deps

echo ""
echo "✅ Done! Starting Expo..."
npx expo start --tunnel
