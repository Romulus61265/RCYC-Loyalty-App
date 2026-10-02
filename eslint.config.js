// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

/** Presentation layer may only reach services through contracts + useServices(). */
const presentationBoundary = {
  patterns: [
    { group: ['@/services/mock/*', '@/services/mock', '../services/mock/*'], message: 'Screens and components must not import mock services. Use useServices().' },
    { group: ['@/services/remote/*', '@/services/remote'], message: 'Screens and components must not import remote adapters. Use useServices().' },
    { group: ['@/data/*', '@/data'], message: 'Fixtures are only for mock services.' },
    { group: ['@/services/registry'], message: 'Only the ServiceProvider composes services.' },
  ],
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'supabase/functions/*', 'web-build/*'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', presentationBoundary] },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['react', 'react-native', 'expo*', '@/*'], message: 'Domain is pure TypeScript with no dependencies.' }] }],
    },
  },
]);
