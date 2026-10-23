import request from 'supertest';
import { describe, it } from 'vitest';
import { createTestApp } from '../helpers';

describe('POST /payments/checkout', () => {
  it('requires a session', async () => {
    const { app } = await createTestApp();
    await request(app.getHttpServer())
      .post('/v1/payments/checkout')
      .send({ concept: 'deposit', booking_id: '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e03' })
      .expect(401);
    await app.close();
  });
});
