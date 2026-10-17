import { describe, expect, it } from 'vitest';
import { runWithLogContext } from '../src/logging/request-context';
import { memoryLogger } from './helpers';

describe('logger', () => {
  it('writes JSON lines with the request context', () => {
    const { logger, lines } = memoryLogger();
    runWithLogContext({ request_id: 'req-1', club_id: 'club-1' }, () => logger.info('hello'));
    expect(lines()[0]).toMatchObject({
      level: 'info',
      msg: 'hello',
      service: 'api',
      request_id: 'req-1',
      club_id: 'club-1',
    });
  });

  it('censors tokens and personal data even if code logs them', () => {
    const { logger, lines } = memoryLogger();
    logger.info(
      {
        authorization: 'Bearer abc',
        user: { phone: '+5491100000000', email: 'a@b.com', refresh_token: 'r1' },
      },
      'oops',
    );
    const line = JSON.stringify(lines()[0]);
    for (const secret of ['Bearer abc', '+5491100000000', 'a@b.com', 'r1"']) {
      expect(line).not.toContain(secret);
    }
  });
});
