#!/bin/bash
set -e

echo "🔍 Current Node: $(node --version)"
echo "⬆️  Upgrading to Node 20..."

# Find nvm in Codespaces - it's in a different location
if [ -f "/usr/local/share/nvm/nvm.sh" ]; then
  source /usr/local/share/nvm/nvm.sh
elif [ -f "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
elif [ -f "/usr/local/nvm/nvm.sh" ]; then
  source /usr/local/nvm/nvm.sh
else
  # Install nvm fresh
  echo "Installing nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  source "$HOME/.nvm/nvm.sh"
fi

nvm install 20
nvm use 20

echo "✅ Node: $(node --version)"
echo ""
echo "🚀 Installing dependencies..."
npm install --legacy-peer-deps

echo ""
echo "✅ Done! Starting Expo..."
npx expo start --tunnel
