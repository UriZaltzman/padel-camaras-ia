import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { Redis } from 'ioredis';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

// Real Redis, from (in order): REDIS_TEST_URL, a local `redis-server`, or Testcontainers.
// Without any of them the suite is skipped with the reason below.
export interface RedisTarget {
  url: string;
  stop: () => Promise<void>;
}

export function hasCommand(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function hasDocker(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address ? resolve(address.port) : reject(new Error()),
      );
    });
  });
}

export async function startLocalRedis(): Promise<RedisTarget> {
  const port = await freePort();
  const child: ChildProcess = spawn(
    'redis-server',
    ['--port', String(port), '--save', '', '--appendonly', 'no'],
    { stdio: 'ignore' },
  );
  const url = `redis://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i += 1) {
    const probe = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 0 });
    try {
      await probe.connect();
      await probe.quit();
      break;
    } catch {
      probe.disconnect();
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return {
    url,
    stop: () => {
      child.kill();
      return Promise.resolve();
    },
  };
}

export async function startContainer(): Promise<RedisTarget> {
  const container: StartedTestContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();
  return {
    url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
    stop: async () => {
      await container.stop();
    },
  };
}

export const externalUrl = process.env.REDIS_TEST_URL;
export const localRedis = !externalUrl && hasCommand('redis-server');
export const docker = !externalUrl && !localRedis && hasDocker();
export const available = Boolean(externalUrl) || localRedis || docker;
export const SKIP_REASON =
  'no Redis for the event bus integration test: set REDIS_TEST_URL, install redis-server, or start Docker';

if (!available) {
  console.warn(`[skip] ${SKIP_REASON}`);
}

/** Starts the Redis the environment offers; call only when `available`. */
export async function startRedis(): Promise<RedisTarget> {
  return externalUrl
    ? { url: externalUrl, stop: () => Promise.resolve() }
    : localRedis
      ? await startLocalRedis()
      : await startContainer();
}
