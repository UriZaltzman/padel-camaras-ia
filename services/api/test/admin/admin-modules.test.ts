import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseStaffAllowlist, type StaffRole } from '../../src/admin/staff';
import { DEFAULT_MODULES, type ClubModules } from '../../src/club-modules/club-modules';
import { SessionService } from '../../src/auth/session/session.service';
import type { ClubRecord } from '../../src/clubs/club-model';
import { createTestApp } from '../helpers';

const CLUB = '0190a1b2-0000-7000-8000-000000000001';
const OTHER = '0190a1b2-0000-7000-8000-000000000002';
const user = (n: number) => `0190a1b2-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`;
const URL = `/v1/admin/clubs/${CLUB}/modules`;

const club = {
  id: CLUB,
  name: 'Club',
  address: '',
  city: '',
  timezone: 'America/Argentina/Buenos_Aires',
  logo_url: null,
  sponsor_name: null,
  plan: 'loan',
  courts: [],
  charges: {
    player_extra: { enabled: false, amount_cents: null },
    coach_plan: { type: 'included' },
    lesson_payments_enabled: false,
  },
} satisfies ClubRecord;

const on: ClubModules = { ...DEFAULT_MODULES, tournaments: true };

describe('/admin/clubs/{id}/modules', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const tokens = new Map<string, string>();
  beforeAll(async () => {
    ctx = await createTestApp();
    ctx.clubs.clubs.set(CLUB, club);
    const sessions = ctx.moduleRef.get(SessionService);
    const roles: [number, StaffRole | null][] = [
      [1, 'admin'],
      [2, 'sales'],
      [3, 'support'],
      [4, 'finance'],
      [5, null], // a club owner: no staff role
    ];
    for (const [n, role] of roles) {
      if (role) ctx.staff.members.set(user(n), { userId: user(n), role, secondFactor: 'totp' });
      tokens.set(
        role ?? 'owner',
        (await sessions.issue(user(n), { mfa: role !== null })).access_token,
      );
    }
  });
  afterAll(() => ctx.app.close());
  const http = () => request(ctx.app.getHttpServer());
  const as = (role: string) => ({ Authorization: `Bearer ${tokens.get(role)}` });

  it('answers 401 without a token and 403 to anyone who is not staff', async () => {
    expect((await http().get(URL)).status).toBe(401);
    const owner = await http().get(URL).set(as('owner'));
    expect(owner.status).toBe(403);
    expect(owner.body.code).toBe('FORBIDDEN');
  });

  it('a club owner cannot change the flags of their own club', async () => {
    const res = await http().put(URL).set(as('owner')).send({ modules: on });
    expect(res.status).toBe(403);
    expect(ctx.modules.rows.has(CLUB)).toBe(false);
  });

  it('every staff role reads, defaults when the club has no row', async () => {
    for (const role of ['admin', 'sales', 'support', 'finance']) {
      const res = await http().get(URL).set(as(role));
      expect(res.status).toBe(200);
      expect(res.body.club_id).toBe(CLUB);
      expect(res.body.modules).toEqual(DEFAULT_MODULES);
    }
  });

  it('admin and sales write; support and finance only read', async () => {
    for (const role of ['support', 'finance']) {
      expect((await http().put(URL).set(as(role)).send({ modules: on })).status).toBe(403);
    }
    expect(ctx.modules.rows.has(CLUB)).toBe(false);
    const res = await http().put(URL).set(as('sales')).send({ modules: on });
    expect(res.status).toBe(200);
    expect(res.body.modules.tournaments).toBe(true);
    expect((await http().get(URL).set(as('support'))).body.modules.tournaments).toBe(true);
  });

  it('validates the body and the club', async () => {
    const bad = await http()
      .put(URL)
      .set(as('admin'))
      .send({ modules: { ...on, deposit: { ...on.deposit, enabled: true } } });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
    const missing = await http().get(`/v1/admin/clubs/${OTHER}/modules`).set(as('admin'));
    expect(missing.status).toBe(404);
    expect((await http().get('/v1/admin/clubs/nope/modules').set(as('admin'))).status).toBe(400);
  });

  it('GET /clubs/{id} carries the modules', async () => {
    const res = await http().get(`/v1/clubs/${CLUB}`);
    expect(res.status).toBe(200);
    expect(res.body.modules.tournaments).toBe(true);
  });
});

describe('INTERNAL_STAFF allowlist', () => {
  it('fails closed on missing or malformed input', () => {
    for (const raw of [
      undefined,
      '',
      '   ',
      'not json',
      '[]',
      '{"x":"admin"}',
      `{"${user(1)}":"root"}`,
    ]) {
      expect(parseStaffAllowlist(raw).size).toBe(0);
    }
    expect(parseStaffAllowlist(`{"${user(1)}":"finance"}`).get(user(1))?.role).toBe('finance');
  });
});
