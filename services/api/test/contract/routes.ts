import type { NestExpressApplication } from '@nestjs/platform-express';

/** A route the running app answers, written the way the contract writes paths. */
export interface AppRoute {
  /** `GET /v1/clubs/{club_id}` */
  key: string;
  method: string;
  path: string;
}

interface ExpressLayer {
  route?: { path?: unknown; methods?: Record<string, boolean> };
}

/**
 * Every route registered in the Express router of a Nest app. Express `:param` segments become
 * `{param}` so they compare directly with the contract's paths.
 */
export function listAppRoutes(app: NestExpressApplication): AppRoute[] {
  const express = app.getHttpAdapter().getInstance() as {
    router?: { stack?: ExpressLayer[] };
    _router?: { stack?: ExpressLayer[] };
  };
  const stack = (express.router ?? express._router)?.stack ?? [];
  const routes: AppRoute[] = [];
  for (const layer of stack) {
    const path = layer.route?.path;
    if (typeof path !== 'string') {
      continue;
    }
    const normalized = toContractPath(path);
    for (const [method, enabled] of Object.entries(layer.route?.methods ?? {})) {
      if (!enabled) {
        continue;
      }
      const verb = method === '_all' ? 'ALL' : method.toUpperCase();
      routes.push({ key: `${verb} ${normalized}`, method: verb, path: normalized });
    }
  }
  return routes;
}

/** `/v1/clubs/:club_id` -> `/v1/clubs/{club_id}`, without a trailing slash. */
export function toContractPath(path: string): string {
  const withBraces = path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  return withBraces.length > 1 ? withBraces.replace(/\/+$/, '') : withBraces;
}

/** Path with every `{param}` renamed to `{}`, so `/a/{id}` and `/a/{club_id}` compare equal. */
export function pathShape(path: string): string {
  return path.replace(/\{[^}]+\}/g, '{}');
}
