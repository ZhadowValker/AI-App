#!/bin/bash
set -e
echo "🚀 Setting up GitHub AI App..."
npm install --legacy-peer-deps
echo ""
echo "✅ Done! Starting Expo..."
echo ""
npx expo start --tunnel
