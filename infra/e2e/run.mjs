// `pnpm e2e:full`: brings the stack up, waits for the API health check, runs Playwright against
// the real API and always tears the stack down (with its volumes) afterwards.
//
// E2E_KEEP=1 leaves the stack running; E2E_NO_BUILD=1 reuses the API image.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const compose = join(root, 'infra', 'e2e', 'docker-compose.yml');
const run = (command, args, options = {}) =>
  spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });

const up = ['compose', '-f', compose, 'up', '--build', '--wait', '--wait-timeout', '300', '-d'];
if (process.env.E2E_NO_BUILD) up.splice(up.indexOf('--build'), 1);

let status = 1;
try {
  if (run('docker', up).status !== 0) {
    run('docker', ['compose', '-f', compose, 'logs', '--no-color', '--tail', '200']);
    throw new Error('the e2e stack did not become healthy');
  }
  const result = run(
    'pnpm',
    ['--filter', '@app/web', 'exec', 'playwright', 'test', '-c', 'playwright.full.config.ts'],
    {
      env: {
        ...process.env,
        E2E_API_URL: 'http://localhost:3300/v1',
        E2E_COMPOSE_FILE: compose,
        E2E_WEBHOOK_SECRET: 'e2e-only-webhook-secret-not-real',
      },
    },
  );
  status = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  if (process.env.E2E_KEEP) {
    console.error(
      'E2E_KEEP is set: the stack is still running (docker compose -f infra/e2e/docker-compose.yml down -v).',
    );
  } else {
    run('docker', ['compose', '-f', compose, 'down', '--volumes', '--remove-orphans']);
  }
}
process.exit(status);
