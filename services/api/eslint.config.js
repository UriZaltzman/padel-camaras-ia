import base from '@app/config/eslint';
import tseslint from 'typescript-eslint';

export default tseslint.config(...base, {
  languageOptions: {
    // Lets `consistent-type-imports` keep value imports that NestJS needs for decorator metadata.
    parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
  },
  rules: {
    // NestJS modules are empty classes carrying a `@Module` decorator.
    '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
  },
});
