import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers';
import { checkCoverage, isImplemented } from './coverage';
import { KNOWN_EXCEPTIONS } from './known-exceptions';
import { isPublic, listOperations, loadContract, serverPrefix } from './openapi';
import { ContractValidator } from './response-validator';
import { listAppRoutes, type AppRoute } from './routes';
import { buildSampleRequest } from './sample-request';
import { SCENARIOS } from './scenarios';

// Everything below iterates over packages/contracts/openapi/openapi.yaml: a new operation in
// the contract gets its tests without editing this file.
const doc = loadContract();
const prefix = serverPrefix(doc);
const operations = listOperations(doc);
const validator = new ContractValidator(doc);

describe('API against the OpenAPI contract', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let routes: AppRoute[];

  beforeAll(async () => {
    ctx = await createTestApp();
    routes = listAppRoutes(ctx.app);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  describe('routes', () => {
    it('finds the routes of the app', () => {
      expect(routes.length).toBeGreaterThan(0);
    });

    it(`exposes no ${prefix} route that the contract does not declare`, () => {
      const report = checkCoverage(operations, routes, prefix, KNOWN_EXCEPTIONS);
      expect(report.undocumented).toEqual([]);
    });

    it('keeps the known exceptions current (delete them once in the contract)', () => {
      const report = checkCoverage(operations, routes, prefix, KNOWN_EXCEPTIONS);
      expect(report.documentedExceptions).toEqual([]);
      expect(report.unusedExceptions).toEqual([]);
    });

    it('only has scenarios for operations of the contract', () => {
      const keys = operations.map((operation) => operation.key);
      expect(Object.keys(SCENARIOS).filter((key) => !keys.includes(key))).toEqual([]);
    });
  });

  describe('shared responses', () => {
    it('answers an unknown route like components/responses/NotFound', async () => {
      const response = await http().get(`${prefix}/contract-test-unknown-route`);
      expect(response.status).toBe(404);
      expect(
        validator.validateResponse({ $ref: '#/components/responses/NotFound' }, response),
      ).toEqual([]);
    });
  });

  for (const operation of operations) {
    describe(operation.key, () => {
      it('answers a generated request within the contract', async (test) => {
        if (!isImplemented(operation, routes)) {
          test.skip(); // In the contract but not implemented yet.
        }
        const sample = buildSampleRequest(doc, operation);
        let call = http()[operation.method](sample.url).set(sample.headers);
        if (sample.body !== undefined) {
          call = call
            .set('Content-Type', sample.contentType ?? 'application/json')
            .send(JSON.stringify(sample.body));
        }
        const response = await call;
        if (!isPublic(operation)) {
          expect(response.status, 'secured operation called without credentials').toBe(401);
        }
        expect(validator.validateOperationResponse(operation, response)).toEqual([]);
      });

      for (const scenario of SCENARIOS[operation.key] ?? []) {
        it(scenario.name, async () => {
          const response = await scenario.send(http());
          expect(response.status).toBe(scenario.expectedStatus);
          expect(validator.validateOperationResponse(operation, response)).toEqual([]);
        });
      }
    });
  }
});
