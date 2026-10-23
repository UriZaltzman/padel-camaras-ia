import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env';
import { assertValidContext, type DbContext } from './db-context';

/** What repositories receive: the transaction client of one request. */
export type Tx = Prisma.TransactionClient;

const TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;

/**
 * The only door to the database. Every call runs in a transaction that first drops to the
 * unprivileged `app_runtime` role and sets the row level security context, so a bug in a
 * query can never read another club's rows (spec section 12).
 *
 * Repositories never open their own connection: they take the `Tx` handed to `run`.
 * The connection is lazy (first query), so building the app does not need a database.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly client: PrismaClient;

  constructor(@Inject(ENV) env: Env) {
    this.client = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  }

  async run<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    assertValidContext(ctx);
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE app_runtime`;
      await tx.$queryRaw`SELECT set_config('app.role', ${ctx.role}, true),
        set_config('app.user_id', ${ctx.userId ?? ''}, true),
        set_config('app.club_id', ${ctx.clubId ?? ''}, true)`;
      return fn(tx);
    }, TX_OPTIONS);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
