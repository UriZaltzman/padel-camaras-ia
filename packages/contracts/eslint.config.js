import base from '@app/config/eslint';

export default [
  ...base,
  {
    // Generator scripts and tests run on Node.
    files: ['scripts/**/*.mjs', 'test/**/*.mjs'],
    languageOptions: {
      globals: { Buffer: 'readonly', URL: 'readonly', console: 'readonly', process: 'readonly' },
    },
  },
];
