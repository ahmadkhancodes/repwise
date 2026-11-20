/**
 * Every test runs twice: once as iOS and once as Android (jest-expo platform
 * presets), so Platform.OS-specific behaviour is covered on both (owner override).
 */
// node:sqlite (the expo-sqlite test double) prints an ExperimentalWarning; workers inherit this.
if (!/disable-warning=ExperimentalWarning/.test(process.env.NODE_OPTIONS ?? '')) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --disable-warning=ExperimentalWarning`.trim();
}

const shared = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Workspace packages from THIS checkout (the shared node_modules symlinks point at main's).
    '^@repwise/(engine|content)$': '<rootDir>/packages/$1/src/index.ts',
    // Data-free subpaths (package.json `exports`) and the catalogue JSON, from this checkout too.
    '^@repwise/content/(toEngine|media|enums)$': '<rootDir>/packages/content/src/$1.ts',
    '^@repwise/content/(.+\\.json)$': '<rootDir>/packages/content/$1',
    // lucide ships ESM as .mjs for RN; use its CommonJS build under Jest.
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/packages/', '<rootDir>/server/'],
  // jest-expo's defaults plus the RN libraries in our stack that ship untranspiled code.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|standard-navigation|lucide-react-native|@shopify|@gorhom|nitro-core|zustand))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};

module.exports = {
  projects: [
    { ...shared, preset: 'jest-expo/ios', displayName: { name: 'ios', color: 'blue' } },
    { ...shared, preset: 'jest-expo/android', displayName: { name: 'android', color: 'green' } },
  ],
};
