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
    // Perf audit r2 N1: the `@repwise/content` barrel evaluates ~1 MB of JSON and every zod schema.
    // App code imports only its types; values come from the data-free subpaths or the lazy catalogue.
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@repwise/content',
              allowTypeImports: true,
              message:
                "Type imports only. Use '@repwise/content/toEngine' | '/media' | '/enums' for values, or src/services/catalog.ts for the data.",
            },
          ],
        },
      ],
    },
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
