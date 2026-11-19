// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

const HEX = '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$';

module.exports = defineConfig([
  expoConfig,
  prettier,
  {
    ignores: [
      'node_modules/*',
      '.expo/*',
      'dist/*',
      'coverage/*',
      'packages/*',
      'server/*',
      'docs/*',
    ],
  },
  {
    // Tokens only: no hard-coded colours outside src/theme (CLAUDE.md non-negotiable).
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['src/theme/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=/${HEX}/]`,
          message: 'Use a colour token from src/theme/tokens.ts instead of a hex literal.',
        },
        {
          selector: `Literal[value=/^rgba?\\(/]`,
          message: 'Use a colour token from src/theme/tokens.ts instead of an rgb() literal.',
        },
      ],
    },
  },
]);
