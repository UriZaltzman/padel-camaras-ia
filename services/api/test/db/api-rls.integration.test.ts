import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env';
import { newId } from '../../src/db/ids';
import { PrismaService } from '../../src/db/prisma.service';
import { VALID_ENV } from '../helpers';
import { adminUrl, createScratchDb, psql } from './scratch-db';

// A request of one club, going through PrismaService, never sees another club's rows.
describe.skipIf(!adminUrl)('PrismaService row level security context', () => {
  const db = adminUrl ? createScratchDb('apirls') : { url: '', drop: () => undefined };
  let prisma: PrismaService;
  const clubA = newId();
  const clubB = newId();
  const ownerA = newId();
  const ownerB = newId();
  const courtA = newId();
  const courtB = newId();

  beforeAll(() => {
    const seed = (club: string, owner: string, court: string, n: string): string => `
      INSERT INTO clubs (id, name, plan, updated_at) VALUES ('${club}', 'Club ${n}', 'loan', now());
      INSERT INTO users (id, name, updated_at) VALUES ('${owner}', 'owner${n}', now());
      INSERT INTO memberships (id, club_id, user_id, role, updated_at)
        VALUES ('${randomUUID()}', '${club}', '${owner}', 'owner', now());
      INSERT INTO courts (id, club_id, name, updated_at) VALUES ('${court}', '${club}', 'C1', now());`;
    psql(db.url, seed(clubA, ownerA, courtA, 'A') + seed(clubB, ownerB, courtB, 'B'));
    prisma = new PrismaService(loadEnv({ ...VALID_ENV, DATABASE_URL: db.url }));
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
    db.drop();
  });

  it("an owner's request reads only the courts and memberships of its own club", async () => {
    const ctx = { role: 'owner', userId: ownerA, clubId: clubA } as const;
    const courts = await prisma.run(ctx, (tx) => tx.court.findMany());
    const memberships = await prisma.run(ctx, (tx) => tx.membership.findMany());
    expect(courts.map((c) => c.id)).toEqual([courtA]);
    expect(memberships.map((m) => m.clubId)).toEqual([clubA]);
  });

  it('asking for another club by id finds nothing', async () => {
    const ctx = { role: 'owner', userId: ownerA, clubId: clubA } as const;
    const court = await prisma.run(ctx, (tx) => tx.court.findUnique({ where: { id: courtB } }));
    expect(court).toBeNull();
  });

  it("a club cannot write into another club's rows", async () => {
    const ctx = { role: 'owner', userId: ownerA, clubId: clubA } as const;
    await expect(
      prisma.run(ctx, (tx) =>
        tx.court.create({ data: { id: newId(), clubId: clubB, name: 'Sneaky' } }),
      ),
    ).rejects.toThrow();
    const updated = await prisma.run(ctx, (tx) =>
      tx.court.updateMany({ where: { id: courtB }, data: { name: 'Hacked' } }),
    );
    expect(updated.count).toBe(0);
  });

  it('the context does not leak to the next request on the same connection', async () => {
    await prisma.run({ role: 'owner', userId: ownerA, clubId: clubA }, (tx) => tx.court.count());
    const seen = await prisma.run({ role: 'player' }, (tx) => tx.membership.count());
    expect(seen).toBe(0);
  });

  it('a malformed context is rejected before reaching the database', async () => {
    await expect(
      prisma.run({ role: 'owner', clubId: "x'; DROP TABLE clubs;--" }, () => Promise.resolve()),
    ).rejects.toThrow('Invalid database context');
  });
});
