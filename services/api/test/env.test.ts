import { describe, expect, it } from 'vitest';
import { bootstrap } from '../src/bootstrap';
import { EnvValidationError, loadEnv } from '../src/config/env';
import { VALID_ENV } from './helpers';

function withoutVariable(name: keyof typeof VALID_ENV): Record<string, string> {
  return Object.fromEntries(Object.entries(VALID_ENV).filter(([key]) => key !== name));
}

describe('loadEnv', () => {
  it('parses a valid environment and applies defaults', () => {
    const env = loadEnv({ DATABASE_URL: VALID_ENV.DATABASE_URL, REDIS_URL: VALID_ENV.REDIS_URL });
    expect(env).toMatchObject({ NODE_ENV: 'development', PORT: 3000, LOG_LEVEL: 'info' });
  });

  it('coerces PORT to a number', () => {
    expect(loadEnv({ ...VALID_ENV, PORT: '8080' }).PORT).toBe(8080);
  });

  it('fails when a required variable is missing', () => {
    const rest = withoutVariable('DATABASE_URL');
    expect(() => loadEnv(rest)).toThrow(EnvValidationError);
    try {
      loadEnv(rest);
    } catch (error) {
      expect((error as EnvValidationError).problems).toEqual([
        { variable: 'DATABASE_URL', problem: 'missing' },
      ]);
    }
  });

  it('reports invalid variables by name, never by value', () => {
    const secret = 'not-a-url-but-maybe-a-secret';
    try {
      loadEnv({ ...VALID_ENV, REDIS_URL: secret, PORT: '99999' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const { problems, message } = error as EnvValidationError;
      expect(problems).toEqual(
        expect.arrayContaining([
          { variable: 'REDIS_URL', problem: 'invalid' },
          { variable: 'PORT', problem: 'invalid' },
        ]),
      );
      expect(message).not.toContain(secret);
    }
  });
});

describe('bootstrap', () => {
  it('refuses to start without a required variable', async () => {
    const rest = withoutVariable('REDIS_URL');
    await expect(bootstrap(rest)).rejects.toThrow(EnvValidationError);
  });
});
