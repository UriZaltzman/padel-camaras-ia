import { Body, Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { brand } from '@app/config/brand';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../src/errors/app-error';
import { setLogContext } from '../src/logging/request-context';
import { createTestApp } from './helpers';

const bodySchema = z.object({ court_id: z.uuid(), players: z.array(z.string()).max(4) });

@Controller('test-errors')
class ThrowingController {
  @Get('business')
  business(): never {
    setLogContext({ club_id: 'club-1', match_id: 'match-1' });
    throw new AppError('BOOKING_SLOT_TAKEN', {
      court_id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b',
      starts_at: '2026-10-17T21:30:00Z',
    });
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException('English framework message');
  }

  @Get('crash')
  crash(): never {
    throw new Error('database exploded at /internal/path');
  }

  @Post('validate')
  validate(@Body() body: unknown): unknown {
    return bodySchema.parse(body);
  }
}

describe('global error filter', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp([ThrowingController]);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  it('maps an AppError to its catalog status, es-AR message and details', async () => {
    const response = await http().get('/v1/test-errors/business').expect(409);
    expect(response.body).toEqual({
      code: 'BOOKING_SLOT_TAKEN',
      message: 'Ese turno se acaba de ocupar. Elegí otro horario.',
      details: {
        court_id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b',
        starts_at: '2026-10-17T21:30:00Z',
      },
    });
  });

  it('maps framework HTTP errors without leaking their English text', async () => {
    const response = await http().get('/v1/test-errors/forbidden').expect(403);
    expect(response.body).toEqual({
      code: 'FORBIDDEN',
      message: 'No tenés permiso para hacer esto.',
    });
  });

  it('answers NOT_FOUND for an unknown route', async () => {
    const response = await http().get('/v1/does-not-exist').expect(404);
    expect(response.body).toEqual({ code: 'NOT_FOUND', message: 'No encontramos lo que buscás.' });
  });

  it('hides unexpected errors behind INTERNAL_ERROR and logs the detail', async () => {
    const response = await http().get('/v1/test-errors/crash').expect(500);
    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: `Algo falló de nuestro lado en ${brand.name}. Probá de nuevo en un rato.`,
    });
    const requestId = response.headers['x-request-id'];
    const failure = ctx.logs().find((line) => line.msg === 'request failed');
    expect(failure).toMatchObject({
      level: 'error',
      code: 'INTERNAL_ERROR',
      request_id: requestId,
    });
    expect(JSON.stringify(failure)).toContain('database exploded');
  });

  it('turns a Zod error into VALIDATION_FAILED with issues and no values', async () => {
    const response = await http()
      .post('/v1/test-errors/validate')
      .send({ court_id: 'secret-value', players: ['a', 'b', 'c', 'd', 'e'] })
      .expect(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.details.issues).toEqual(
      expect.arrayContaining([
        { path: '/court_id', rule: 'format' },
        { path: '/players', rule: 'max' },
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain('secret-value');
  });

  it('answers VALIDATION_FAILED for malformed JSON', async () => {
    const response = await http()
      .post('/v1/test-errors/validate')
      .set('Content-Type', 'application/json')
      .send('{"court_id":')
      .expect(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('logs request_id, club_id and match_id on lines of the request', async () => {
    const response = await http().get('/v1/test-errors/business').expect(409);
    const requestId = response.headers['x-request-id'];
    const rejected = ctx
      .logs()
      .find((line) => line.msg === 'request rejected' && line.request_id === requestId);
    expect(rejected).toMatchObject({
      code: 'BOOKING_SLOT_TAKEN',
      club_id: 'club-1',
      match_id: 'match-1',
    });
    const completed = ctx
      .logs()
      .find((line) => line.msg === 'request completed' && line.request_id === requestId);
    expect(completed).toMatchObject({
      method: 'GET',
      route: '/v1/test-errors/business',
      status: 409,
      club_id: 'club-1',
    });
  });
});
