// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

/** Presentation layer may only reach services through contracts + useServices(). */
const presentationBoundary = {
  patterns: [
    { group: ['@/services/mock/*', '@/services/mock', '../services/mock/*'], message: 'Screens and components must not import mock services. Use useServices().' },
    { group: ['@/services/remote/*', '@/services/remote'], message: 'Screens and components must not import remote adapters. Use useServices().' },
    { group: ['@/services/supabase/*', '@/services/supabase', '@supabase/*'], message: 'Screens and components must not touch Supabase. Use useServices().' },
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
    files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', presentationBoundary] },
  },
  {
    // Dev scripts report to the terminal.
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Fixtures are dev-only data: production adapters must never read them.
    files: ['src/services/remote/**/*.ts', 'src/services/supabase/**/*.ts', 'src/services/shared/**/*.ts', 'src/services/contracts/**/*.ts', 'src/core/**/*.ts', 'src/config/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['@/data/*', '@/data', '@/services/mock/*'], message: 'Production code must not depend on development fixtures or mocks.' }] }] },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['react', 'react-native', 'expo*', '@/*'], message: 'Domain is pure TypeScript with no dependencies.' }] }],
    },
  },
]);
