import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_MODULES, type ClubModules } from '../../src/club-modules/club-modules';
import { ClubModulesService } from '../../src/club-modules/club-modules.service';
import { newId } from '../../src/db/ids';
import { PrismaService } from '../../src/db/prisma.service';
import { adminUrl, createScratchDb, psql } from '../db/scratch-db';
import { createTestApp } from '../helpers';

describe.skipIf(!adminUrl)('club modules against Postgres', () => {
  const db = adminUrl ? createScratchDb('club_modules') : { url: '', drop: () => undefined };
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const clubA = newId();
  const clubB = newId();
  const admin = newId();
  const modules: ClubModules = {
    ...DEFAULT_MODULES,
    tournaments: true,
    deposit: { enabled: true, kind: 'percent', percent: 30, amount_cents: null },
  };

  beforeAll(async () => {
    psql(
      db.url,
      [clubA, clubB]
        .map(
          (id) =>
            `INSERT INTO clubs (id, name, plan, updated_at) VALUES ('${id}', 'Club ${id}', 'loan', now());`,
        )
        .concat(`INSERT INTO users (id, name, updated_at) VALUES ('${admin}', 'admin', now());`)
        .join('\n'),
    );
    ctx = await createTestApp([], { databaseUrl: db.url });
  });
  afterAll(async () => {
    await ctx.app.close();
    db.drop();
  });

  it('reads defaults, then what internal staff saved, and writes the audit entry', async () => {
    const service = ctx.app.get(ClubModulesService);
    expect(await service.get(clubA)).toEqual(DEFAULT_MODULES);

    await service.update({ role: 'support', userId: admin, clubId: clubA }, clubA, { modules });
    expect(await service.get(clubA)).toEqual(modules);
    expect(await service.get(clubB)).toEqual(DEFAULT_MODULES);
    const http = request(ctx.app.getHttpServer());
    expect((await http.get(`/v1/clubs/${clubA}/modules`)).body).toEqual(modules);

    const audit = psql(
      db.url,
      `SELECT action || ' ' || actor_user_id || ' ' || (before->'tournaments')::text || ' ' || (after->'tournaments')::text
         FROM audit_log WHERE club_id = '${clubA}';`,
    );
    expect(audit).toContain(`club.modules_update ${admin} false true`);
  });

  it('rejects an incomplete update and an unknown club', async () => {
    const service = ctx.app.get(ClubModulesService);
    const bad = { ...modules, deposit: { ...modules.deposit, percent: null } };
    await expect(
      service.update({ role: 'support', userId: admin, clubId: clubA }, clubA, { modules: bad }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const ghost = randomUUID();
    await expect(
      service.update({ role: 'support', userId: admin, clubId: ghost }, ghost, { modules }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('row level security: only internal staff write, a club never writes its own flags', async () => {
    const prisma = ctx.app.get(PrismaService);
    const write = (role: 'owner' | 'staff' | 'player') =>
      prisma.run({ role, userId: admin, clubId: clubA }, (tx) =>
        tx.clubModules.updateMany({ where: { clubId: clubA }, data: { tournaments: false } }),
      );
    for (const role of ['owner', 'staff', 'player'] as const) {
      expect((await write(role)).count).toBe(0);
    }
    expect((await ctx.app.get(ClubModulesService).get(clubA)).tournaments).toBe(true);
  });
});
