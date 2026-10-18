import type { Operation } from './openapi';
import { pathShape, type AppRoute } from './routes';

/** A route the API may expose under the server prefix although the contract lacks it. */
export interface KnownException {
  /** `GET /v1/health` */
  route: string;
  /** Issue that adds the route to the contract. The exception goes away when it merges. */
  issue: number;
  reason: string;
}

export interface CoverageReport {
  /** Routes under the prefix with no operation in the contract (exceptions excluded). */
  undocumented: string[];
  /** Exceptions whose route is now in the contract: delete them. */
  documentedExceptions: string[];
  /** Exceptions whose route the API no longer exposes: delete them. */
  unusedExceptions: string[];
}

function sameRoute(operation: { method: string; fullPath: string }, route: AppRoute): boolean {
  const methodMatches = route.method === 'ALL' || route.method === operation.method.toUpperCase();
  return methodMatches && pathShape(route.path) === pathShape(operation.fullPath);
}

function parseKey(key: string): { method: string; fullPath: string } {
  const [method = '', fullPath = ''] = key.split(' ');
  return { method: method.toLowerCase(), fullPath };
}

/** True when the app has a route that serves `operation`. */
export function isImplemented(operation: Operation, routes: AppRoute[]): boolean {
  return routes.some((route) => sameRoute(operation, route));
}

/** Compares the routes the app exposes under `prefix` with the contract's operations. */
export function checkCoverage(
  operations: Operation[],
  routes: AppRoute[],
  prefix: string,
  exceptions: readonly KnownException[],
): CoverageReport {
  const underPrefix = routes.filter(
    (route) => route.path === prefix || route.path.startsWith(`${prefix}/`),
  );
  const documented = (route: AppRoute) => operations.some((op) => sameRoute(op, route));
  const excepted = (route: AppRoute) =>
    exceptions.some((exception) => sameRoute(parseKey(exception.route), route));

  return {
    undocumented: underPrefix
      .filter((route) => !documented(route) && !excepted(route))
      .map((route) => route.key),
    documentedExceptions: exceptions
      .filter((exception) => operations.some((op) => op.key === exception.route))
      .map((exception) => `${exception.route} (#${exception.issue})`),
    unusedExceptions: exceptions
      .filter(
        (exception) => !underPrefix.some((route) => sameRoute(parseKey(exception.route), route)),
      )
      .map((exception) => `${exception.route} (#${exception.issue})`),
  };
}
