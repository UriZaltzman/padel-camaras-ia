import { Controller, Get, Param } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '../../src/errors/app-error';
import { ERROR_CODES, httpStatusFor, isErrorCode } from '../../src/errors/error-codes';
import { createTestApp } from '../helpers';
import { loadContract } from './openapi';
import { ContractValidator } from './response-validator';

const doc = loadContract();
const errorCode = doc.components?.schemas?.ErrorCode as {
  enum: string[];
  'x-error-catalog': { code: string; http_status: number }[];
};
const ERROR_RESPONSE = {
  headers: { 'X-Request-Id': { $ref: '#/components/headers/X-Request-Id' } },
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
};

@Controller('contract-errors')
class ErrorController {
  @Get(':code')
  fail(@Param('code') code: string): never {
    if (!isErrorCode(code)) {
      throw new Error('unknown code');
    }
    throw new AppError(code, { resource: 'booking' });
  }
}

describe('error catalog against the contract', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const validator = new ContractValidator(doc);

  beforeAll(async () => {
    ctx = await createTestApp([ErrorController]);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('has exactly the codes of the contract', () => {
    expect([...ERROR_CODES].sort()).toEqual([...errorCode.enum].sort());
  });

  it.each(errorCode['x-error-catalog'].map((entry) => [entry.code, entry.http_status] as const))(
    '%s answers %i with a contract Error body',
    async (code, status) => {
      expect(isErrorCode(code) ? httpStatusFor(code) : undefined).toBe(status);
      const response = await request(ctx.app.getHttpServer()).get(`/v1/contract-errors/${code}`);
      expect(response.status).toBe(status);
      expect(validator.validateResponse(ERROR_RESPONSE, response)).toEqual([]);
    },
  );
});
