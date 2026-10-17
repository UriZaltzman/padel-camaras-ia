import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

describe('GET /v1/health', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('answers ok with a request id', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/v1/health').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('keeps a well-formed incoming request id', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/v1/health')
      .set('X-Request-Id', 'edge-01928f6e-7c1a')
      .expect(200);
    expect(response.headers['x-request-id']).toBe('edge-01928f6e-7c1a');
  });

  it('replaces a malformed incoming request id', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/v1/health')
      .set('X-Request-Id', 'bad id {"injected":true}')
      .expect(200);
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('is only served under /v1', async () => {
    await request(ctx.app.getHttpServer()).get('/health').expect(404);
  });
});
