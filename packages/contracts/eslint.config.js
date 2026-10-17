import base from '@app/config/eslint';

export default [
  ...base,
  {
    // Generator scripts and tests run on Node.
    files: ['scripts/**/*.mjs', 'test/**/*.mjs'],
    languageOptions: {
      globals: { URL: 'readonly', console: 'readonly', process: 'readonly' },
    },
  },
];
