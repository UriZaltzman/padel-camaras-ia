import { describe, expect, it } from 'vitest';
import { memoryLogger } from '../helpers';

describe('log redaction of credentials', () => {
  it.each([
    'password',
    'current_password',
    'new_password',
    'totp_code',
    'secret',
    'otpauth_uri',
    'token',
    'access_token',
    'refresh_token',
    'reset_token',
    'otp',
    'authorization',
    'cookie',
  ])('censors %s at the top level and one level down', (key) => {
    const { logger, lines } = memoryLogger();
    logger.info({ [key]: 'SECRET-VALUE', body: { [key]: 'SECRET-VALUE' } }, 'test');
    expect(JSON.stringify(lines())).not.toContain('SECRET-VALUE');
  });
});
