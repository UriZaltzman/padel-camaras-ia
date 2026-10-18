// Self-tests of the contract harness on a fixture contract, so we know it catches responses
// outside the contract even while the real contract has no paths yet.
import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers';
import { checkCoverage } from './coverage';
import { listOperations, loadContract, type OpenApiDocument, type Operation } from './openapi';
import { ContractValidator } from './response-validator';
import { listAppRoutes } from './routes';
import { buildSampleRequest } from './sample-request';

const ITEM_ID = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b';
const real = loadContract();
const errors = {
  '404': { $ref: '#/components/responses/NotFound' },
  '429': { $ref: '#/components/responses/TooManyRequests' },
};
const fixture: OpenApiDocument = {
  ...real,
  paths: {
    '/fixture/items/{item_id}': {
      get: {
        parameters: [
          {
            name: 'item_id',
            in: 'path',
            required: true,
            schema: { $ref: '#/components/schemas/Uuid' },
          },
          {
            name: 'variant',
            in: 'query',
            required: true,
            schema: { type: 'string', enum: ['ok'] },
          },
        ],
        responses: {
          '200': {
            description: 'An item.',
            headers: { 'X-Request-Id': { $ref: '#/components/headers/X-Request-Id' } },
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } },
          },
          ...errors,
        },
      },
    },
    '/fixture/items': {
      get: {
        responses: {
          '200': {
            description: 'A page.',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Page' },
                    {
                      type: 'object',
                      required: ['items'],
                      properties: {
                        items: { type: 'array', items: { $ref: '#/components/schemas/Item' } },
                      },
                    },
                  ],
                },
              },
            },
          },
          ...errors,
        },
      },
    },
  },
  components: {
    ...real.components,
    schemas: {
      ...real.components?.schemas,
      Item: {
        type: 'object',
        required: ['id', 'amount_cents'],
        properties: {
          id: { $ref: '#/components/schemas/Uuid' },
          amount_cents: { $ref: '#/components/schemas/AmountCents' },
        },
      },
    },
  },
};

const ITEM = { id: ITEM_ID, amount_cents: 1500000 };
const BODIES: Record<string, { status: number; body: unknown }> = {
  ok: { status: 200, body: ITEM },
  extra: { status: 200, body: { ...ITEM, internal_note: 'leak' } },
  wrongType: { status: 200, body: { ...ITEM, amount_cents: 15000.5 } },
  badFormat: { status: 200, body: { ...ITEM, id: 'not-a-uuid' } },
  undocumented: { status: 409, body: { code: 'BOOKING_FULL', message: 'x' } },
  badError: { status: 404, body: { code: 'NOT_FOUND', message: 'x', stack: 'at ...' } },
  unknownCode: { status: 404, body: { code: 'NOPE', message: 'x' } },
  pageOk: { status: 200, body: { next_cursor: null, items: [ITEM] } },
  pageExtra: { status: 200, body: { next_cursor: null, items: [ITEM], total: 1 } },
  pageNestedExtra: { status: 200, body: { next_cursor: null, items: [{ ...ITEM, x: 1 }] } },
};

@Controller('fixture')
class FixtureController {
  @Get('items/:item_id')
  item(@Query('variant') variant: string, @Res() res: Response): void {
    if (variant === 'noRequestId') {
      res.removeHeader('X-Request-Id');
      res.status(200).json(ITEM);
      return;
    }
    if (variant === 'text') {
      res.status(200).type('text/plain').send('hello');
      return;
    }
    const { status, body } = BODIES[variant] ?? { status: 500, body: {} };
    res.status(status).json(body);
  }

  @Get('items')
  page(@Query('variant') variant: string, @Res() res: Response): void {
    const { status, body } = BODIES[variant] ?? { status: 500, body: {} };
    res.status(status).json(body);
  }

  @Get('undocumented')
  undocumented(): string {
    return 'x';
  }
}

describe('contract harness (fixture contract)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const validator = new ContractValidator(fixture);
  const operations = listOperations(fixture);
  const itemOp = operations.find((op) => op.key === 'GET /v1/fixture/items/{item_id}') as Operation;
  const pageOp = operations.find((op) => op.key === 'GET /v1/fixture/items') as Operation;

  beforeAll(async () => {
    ctx = await createTestApp([FixtureController]);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const item = async (variant: string) => {
    const response = await request(ctx.app.getHttpServer()).get(
      `/v1/fixture/items/${ITEM_ID}?variant=${variant}`,
    );
    return validator.validateOperationResponse(itemOp, response);
  };
  const page = async (variant: string) => {
    const response = await request(ctx.app.getHttpServer()).get(
      `/v1/fixture/items?variant=${variant}`,
    );
    return validator.validateOperationResponse(pageOp, response);
  };

  it('accepts a response that matches the contract', async () => {
    expect(await item('ok')).toEqual([]);
    expect(await page('pageOk')).toEqual([]);
  });

  it('rejects properties the contract does not declare', async () => {
    expect((await item('extra')).join()).toContain('internal_note');
    expect((await page('pageExtra')).join()).toContain('total');
    expect((await page('pageNestedExtra')).join()).toMatch(/items\/0.*\(x\)/);
  });

  it('rejects wrong types and formats', async () => {
    expect((await item('wrongType')).join()).toContain('/amount_cents');
    expect((await item('badFormat')).join()).toContain('/id');
  });

  it('rejects an undocumented status', async () => {
    expect((await item('undocumented')).join()).toContain('does not document');
  });

  it('rejects error bodies outside {code, message, details}', async () => {
    expect((await item('badError')).join()).toContain('(stack)');
    expect((await item('unknownCode')).join()).toContain('/code');
  });

  it('requires X-Request-Id', async () => {
    expect(await item('noRequestId')).toContain('missing header X-Request-Id');
  });

  it('checks the Content-Type', async () => {
    expect((await item('text')).join()).toContain('Content-Type text/plain');
  });

  it('builds requests from the contract', () => {
    expect(buildSampleRequest(fixture, itemOp).url).toBe(`/v1/fixture/items/${ITEM_ID}?variant=ok`);
  });

  it('flags app routes missing from the contract, and stale exceptions', () => {
    const routes = listAppRoutes(ctx.app);
    const report = checkCoverage(operations, routes, '/v1', [
      { route: 'GET /v1/health', issue: 212, reason: 'test' },
      { route: 'GET /v1/fixture/items', issue: 1, reason: 'test' },
      { route: 'GET /v1/gone', issue: 2, reason: 'test' },
    ]);
    expect(report.undocumented).toEqual(['GET /v1/fixture/undocumented']);
    expect(report.documentedExceptions).toEqual(['GET /v1/fixture/items (#1)']);
    expect(report.unusedExceptions).toEqual(['GET /v1/gone (#2)']);
  });
});
