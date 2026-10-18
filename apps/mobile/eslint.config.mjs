import base from '@app/config/eslint';

export default [
  ...base,
  {
    ignores: ['.expo/**', 'expo-env.d.ts', 'ios/**', 'android/**'],
  },
  {
    // CommonJS configs required by Metro, Babel and Jest.
    files: ['*.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
