import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionService } from '../../src/auth/session/session.service';
import { MembershipsService } from '../../src/clubs/memberships.service';
import { newId } from '../../src/db/ids';
import { PrismaService } from '../../src/db/prisma.service';
import { AppError } from '../../src/errors/app-error';
import { adminUrl, createScratchDb, psql } from '../db/scratch-db';
import { createTestApp } from '../helpers';

// Clubs, courts and roles against a real Postgres: the permissions are checked through HTTP
// and the data rules (RLS) are the ones of the migrations.
describe.skipIf(!adminUrl)('clubs, courts and memberships', () => {
  const db = adminUrl ? createScratchDb('clubs') : { url: '', drop: () => undefined };
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let tokens: Record<string, string>;

  const clubA = newId();
  const clubB = newId();
  const courtA = newId();
  const courtB = newId();
  const people = {
    owner: newId(),
    staff: newId(),
    coach: newId(),
    player: newId(),
    outsider: newId(),
    ownerB: newId(),
  };

  const rules = (price: number) => [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      opens_at: '08:00',
      closes_at: '24:00',
      allowed_durations: [60, 90],
      start_interval_minutes: 30,
      price_bands: [
        {
          starts_at: '08:00',
          ends_at: '18:00',
          prices: [
            { duration_minutes: 60, amount_cents: price },
            { duration_minutes: 90, amount_cents: price * 1.5 },
          ],
        },
        {
          starts_at: '18:00',
          ends_at: '24:00',
          prices: [
            { duration_minutes: 60, amount_cents: price * 2 },
            { duration_minutes: 90, amount_cents: price * 3 },
          ],
        },
      ],
    },
  ];
  const settings = (price = 1000) => ({
    courts: [
      {
        court_id: courtA,
        booking: {
          rules: rules(price),
          deposit: { type: 'percent', percent: 30 },
          cancellation_refund_hours: 12,
        },
      },
    ],
  });

  beforeAll(async () => {
    const seedClub = (club: string, court: string, name: string): string => `
      INSERT INTO clubs (id, name, address, plan, updated_at) VALUES ('${club}', '${name}', 'Calle 1', 'loan', now());
      INSERT INTO courts (id, club_id, name, updated_at) VALUES ('${court}', '${club}', 'Cancha 1', now());`;
    const user = (id: string, n: string): string =>
      `INSERT INTO users (id, name, updated_at) VALUES ('${id}', '${n}', now());`;
    const member = (club: string, userId: string, role: string): string =>
      `INSERT INTO memberships (id, club_id, user_id, role, updated_at) VALUES ('${randomUUID()}', '${club}', '${userId}', '${role}', now());`;
    psql(
      db.url,
      [
        seedClub(clubA, courtA, 'Club Palermo'),
        seedClub(clubB, courtB, 'Club Belgrano'),
        ...Object.entries(people).map(([n, id]) => user(id, n)),
        member(clubA, people.owner, 'owner'),
        member(clubA, people.staff, 'staff'),
        member(clubA, people.coach, 'coach'),
        member(clubA, people.player, 'player'),
        member(clubB, people.ownerB, 'owner'),
        `INSERT INTO payments (id, club_id, user_id, concept, amount_cents, updated_at)
           VALUES ('${randomUUID()}', '${clubA}', '${people.player}', 'deposit', 500, now());`,
      ].join('\n'),
    );
    ctx = await createTestApp([], { databaseUrl: db.url });
    const sessions = ctx.app.get(SessionService);
    tokens = {};
    for (const [name, id] of Object.entries(people))
      tokens[name] = (await sessions.issue(id)).access_token;
  });

  afterAll(async () => {
    await ctx.app.close();
    db.drop();
  });

  const http = () => request(ctx.app.getHttpServer());
  const patch = (who: string | null, club: string, body: unknown) => {
    const call = http().patch(`/v1/clubs/${club}/settings`);
    return (who ? call.set('Authorization', `Bearer ${tokens[who]}`) : call).send(body as object);
  };

  describe('public directory', () => {
    it('lists clubs without credentials, ordered by name, with the court count', async () => {
      const response = await http().get('/v1/clubs');
      expect(response.status).toBe(200);
      expect(response.body.items.map((c: { name: string }) => c.name)).toEqual([
        'Club Belgrano',
        'Club Palermo',
      ]);
      expect(response.body.items[0]).toMatchObject({ courts_count: 1, logo_url: null });
      expect(response.body.next_cursor).toBeNull();
    });

    it('pages with a cursor and searches without caring about case or accents', async () => {
      const first = await http().get('/v1/clubs?limit=1');
      expect(first.body.items).toHaveLength(1);
      expect(first.body.next_cursor).toEqual(expect.any(String));
      const second = await http().get(`/v1/clubs?limit=1&cursor=${first.body.next_cursor}`);
      expect(second.body.items[0].name).toBe('Club Palermo');
      expect(second.body.next_cursor).toBeNull();
      const found = await http().get('/v1/clubs?q=PALÉRMO');
      expect(found.body.items.map((c: { name: string }) => c.name)).toEqual(['Club Palermo']);
      expect((await http().get('/v1/clubs?cursor=garbage')).body.code).toBe('INVALID_CURSOR');
    });

    it('shows a club with its courts, and 404 for an unknown one', async () => {
      const response = await http().get(`/v1/clubs/${clubA}`);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: clubA,
        name: 'Club Palermo',
        plan: 'loan',
        charges: { player_extra: { enabled: false }, coach_plan: { type: 'included' } },
        courts: [
          { id: courtA, name: 'Cancha 1', booking: { rules: [], deposit: { type: 'none' } } },
        ],
      });
      expect((await http().get(`/v1/clubs/${newId()}`)).status).toBe(404);
      expect((await http().get('/v1/clubs/not-a-uuid')).status).toBe(400);
    });

    it('never exposes private fields', async () => {
      const body = JSON.stringify((await http().get(`/v1/clubs/${clubA}`)).body);
      expect(body).not.toMatch(/cuit|mercadopago|contract/i);
    });
  });

  describe('settings by role', () => {
    it('refuses a call without credentials', async () => {
      expect((await patch(null, clubA, settings())).status).toBe(401);
    });

    it.each(['staff', 'coach', 'player'])('%s of the club gets 403', async (who) => {
      const response = await patch(who, clubA, settings());
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
    });

    it('a user with no role in the club gets 404, like an unknown club', async () => {
      expect((await patch('outsider', clubA, settings())).status).toBe(404);
      expect((await patch('ownerB', clubA, settings())).status).toBe(404);
      expect((await patch('owner', newId(), settings())).status).toBe(404);
    });

    it('the owner changes booking rules and the per-match extra, and it reads back', async () => {
      const response = await patch('owner', clubA, {
        ...settings(),
        charges: {
          player_extra: { enabled: true, amount_cents: 300000 },
          coach_plan: { type: 'included' },
          lesson_payments_enabled: false,
        },
      });
      expect(response.status).toBe(200);
      expect(response.body.charges.player_extra).toEqual({ enabled: true, amount_cents: 300000 });
      const court = response.body.courts[0];
      expect(court.booking).toMatchObject({
        deposit: { type: 'percent', percent: 30 },
        cancellation_refund_hours: 12,
      });
      expect(court.booking.rules[0]).toMatchObject({
        days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        opens_at: '08:00',
        closes_at: '24:00',
        allowed_durations: [60, 90],
      });
      expect(court.booking.rules[0].price_bands.at(-1)).toMatchObject({ ends_at: '24:00' });
      const read = await http().get(`/v1/clubs/${clubA}`);
      expect(read.body.courts[0].booking).toEqual(court.booking);
    });

    it('replaces the rules as a whole and writes the change to audit_log', async () => {
      const before = Number(
        psql(db.url, `SELECT count(*) FROM audit_log WHERE club_id = '${clubA}'`),
      );
      const response = await patch('owner', clubA, settings(5000));
      expect(response.status).toBe(200);
      expect(response.body.courts[0].booking.rules).toHaveLength(1);
      expect(response.body.courts[0].booking.rules[0].price_bands[0].prices[0].amount_cents).toBe(
        5000,
      );
      expect(
        psql(db.url, `SELECT count(*) FROM booking_slots_rules WHERE court_id = '${courtA}'`),
      ).toBe('1');
      const after = Number(
        psql(db.url, `SELECT count(*) FROM audit_log WHERE club_id = '${clubA}'`),
      );
      expect(after).toBe(before + 1);
      expect(
        psql(
          db.url,
          `SELECT actor_user_id FROM audit_log WHERE club_id = '${clubA}' ORDER BY created_at DESC LIMIT 1`,
        ),
      ).toBe(people.owner);
    });

    it("does not touch another club's court", async () => {
      const response = await patch('owner', clubA, {
        courts: [{ court_id: courtB, booking: settings().courts[0]?.booking }],
      });
      expect(response.status).toBe(404);
      expect(
        psql(db.url, `SELECT count(*) FROM booking_slots_rules WHERE court_id = '${courtB}'`),
      ).toBe('0');
    });

    it('answers VALIDATION_FAILED with the issues for inconsistent rules and for schema errors', async () => {
      const gap = settings();
      gap.courts[0]?.booking.rules[0]?.price_bands.pop();
      const inconsistent = await patch('owner', clubA, gap);
      expect(inconsistent.status).toBe(400);
      expect(inconsistent.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { issues: [{ path: '/courts/0/booking/rules/0/price_bands', rule: 'gap' }] },
      });
      expect((await patch('owner', clubA, {})).status).toBe(400);
      expect((await patch('owner', clubA, { unknown: 1 })).status).toBe(400);
    });

    it('refuses what has no column yet instead of dropping it silently', async () => {
      const response = await patch('owner', clubA, {
        charges: {
          player_extra: { enabled: false, amount_cents: null },
          coach_plan: { type: 'coach_monthly', monthly_fee_cents: 1000 },
          lesson_payments_enabled: true,
        },
      });
      expect(response.status).toBe(400);
      expect(response.body.details.issues).toEqual([
        { path: '/charges/coach_plan/type', rule: 'unsupported' },
        { path: '/charges/lesson_payments_enabled', rule: 'unsupported' },
      ]);
    });
  });

  describe('what staff can see', () => {
    it('staff reads the club operations but no income', async () => {
      const prisma = ctx.app.get(PrismaService);
      const asStaff = { role: 'staff', userId: people.staff, clubId: clubA } as const;
      const asOwner = { role: 'owner', userId: people.owner, clubId: clubA } as const;
      expect(await prisma.run(asStaff, (tx) => tx.court.count())).toBe(1);
      expect(await prisma.run(asStaff, (tx) => tx.payment.count())).toBe(0);
      expect(await prisma.run(asOwner, (tx) => tx.payment.count())).toBe(1);
    });
  });

  describe('memberships', () => {
    it('the owner grants and revokes roles; others cannot', async () => {
      const service = ctx.app.get(MembershipsService);
      const owner = { userId: people.owner, sessionId: 's' };
      const staff = { userId: people.staff, sessionId: 's' };
      await expect(service.grant(staff, clubA, people.outsider, 'staff')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });

      await service.grant(owner, clubA, people.outsider, 'staff');
      expect((await patch('outsider', clubA, settings())).status).toBe(403); // staff now, not owner

      await service.revoke(owner, clubA, people.outsider, 'staff');
      expect((await patch('outsider', clubA, settings())).status).toBe(404);
      await expect(service.revoke(owner, clubA, people.outsider, 'staff')).rejects.toBeInstanceOf(
        AppError,
      );
    });

    it('cannot grant roles in a club the owner does not own', async () => {
      const service = ctx.app.get(MembershipsService);
      await expect(
        service.grant({ userId: people.owner, sessionId: 's' }, clubB, people.outsider, 'owner'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
