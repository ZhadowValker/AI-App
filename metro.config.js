// metro.config.js
// Tells Metro bundler to resolve local packages (provider-engine, github-tools)
// and to watch them for changes during development.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ── Watch local packages ──────────────────────────────────────
// Metro needs to know about folders outside src/ that we import from.
config.watchFolders = [
  path.resolve(__dirname, 'provider-engine'),
  path.resolve(__dirname, 'github-tools'),
];

// ── Resolve local packages by name ───────────────────────────
// Maps the import aliases from tsconfig paths to actual disk paths.
config.resolver.extraNodeModules = {
  'provider-engine': path.resolve(__dirname, 'provider-engine'),
  'github-tools':    path.resolve(__dirname, 'github-tools'),
};

// ── Source extensions ─────────────────────────────────────────
config.resolver.sourceExts = [
  'tsx', 'ts', 'jsx', 'js', 'json', 'cjs', 'mjs',
];

module.exports = config;
