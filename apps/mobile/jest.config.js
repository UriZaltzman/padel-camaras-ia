/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  // CI runners are slower than laptops; the default 5 s made the sign-in test flaky.
  testTimeout: 20000,
  testMatch: ['<rootDir>/src/**/*.test.ts?(x)'],
};
