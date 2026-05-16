#!/bin/bash
set -e

echo "🚀 Setting up GitHub AI App..."

# Install all dependencies at once with legacy peer deps to avoid conflicts
npm install --legacy-peer-deps

echo "✅ Dependencies installed!"
echo ""
echo "Starting Expo with tunnel..."
npx expo start --tunnel
