// babel.config.js
// Required by Expo for TypeScript + JSX transpilation.
// expo preset handles: TSX, decorators, reanimated, path aliases.

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Enables module path aliases defined in tsconfig.json paths
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            'provider-engine': './provider-engine',
            'github-tools':    './github-tools',
          },
        },
      ],
    ],
  };
};
