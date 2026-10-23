import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionService } from '../../src/auth/session/session.service';
import { newId } from '../../src/db/ids';
import { adminUrl, createScratchDb, psql } from '../db/scratch-db';
import { createTestApp } from '../helpers';

describe.skipIf(!adminUrl)('lesson requests against Postgres', () => {
  const db = adminUrl ? createScratchDb('lessonreq') : { url: '', drop: () => undefined };
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const club = newId();
  const clubWa = newId();
  const court = newId();
  const courtWa = newId();
  const coach = newId();
  const coachWa = newId();
  const otherCoach = newId();
  const student = newId();
  const other = newId();
  const slot = (hourUtc: number) => `2026-11-02T${hourUtc}:00:00.000Z`;
  const ask = (hourUtc: number) => ({
    club_id: club,
    coach_id: coach,
    court_id: court,
    starts_at: slot(hourUtc),
    duration_minutes: 60,
    message: 'Quiero mejorar la bandeja',
  });

  const http = () => request(ctx.app.getHttpServer());
  const as = async (method: 'get' | 'post', url: string, userId: string, payload?: object) => {
    const token = (await ctx.app.get(SessionService).issue(userId)).access_token;
    const req = http()[method](url).set('Authorization', `Bearer ${token}`);
    return payload ? req.send(payload) : req;
  };

  beforeAll(async () => {
    const rules = (c: string, k: string) => {
      const r = newId();
      return `
      INSERT INTO courts (id, club_id, name, updated_at) VALUES ('${k}', '${c}', 'Cancha 1', now());
      INSERT INTO booking_slots_rules (id, club_id, court_id, days_of_week, opens_at, closes_at, allowed_durations_minutes, start_interval_minutes, deposit_kind, deposit_bps, updated_at)
        VALUES ('${r}', '${c}', '${k}', '{1,2,3,4,5,6,7}', '08:00', '00:00', '{60,90}', 30, 'percent', 3000, now());
      INSERT INTO booking_rule_price_bands (id, club_id, rule_id, starts_at, ends_at, duration_minutes, price_cents, updated_at)
        VALUES ('${randomUUID()}', '${c}', '${r}', '08:00', '00:00', 60, 1000, now());`;
    };
    const member = (c: string, u: string, role: string) =>
      `INSERT INTO memberships (id, club_id, user_id, role, status, updated_at) VALUES ('${newId()}', '${c}', '${u}', '${role}', 'active', now());`;
    psql(
      db.url,
      `INSERT INTO clubs (id, name, address, plan, updated_at) VALUES ('${club}', 'Club', 'Calle 1', 'loan', now()), ('${clubWa}', 'Club WA', 'Calle 2', 'loan', now());
       ${rules(club, court)} ${rules(clubWa, courtWa)}
       INSERT INTO club_modules (club_id, lesson_mode, updated_at) VALUES ('${clubWa}', 'whatsapp', now());
       INSERT INTO users (id, name, phone, updated_at) VALUES
         ('${coach}', 'Coach', '+5491122334455', now()), ('${coachWa}', 'Coach WA', '+54 9 11 5555-0000', now()),
         ('${otherCoach}', 'Otro', NULL, now()), ('${student}', 'Sofía', NULL, now()), ('${other}', 'Nadie', NULL, now());
       ${member(club, coach, 'coach')} ${member(club, otherCoach, 'coach')} ${member(clubWa, coachWa, 'coach')} ${member(clubWa, otherCoach, 'coach')}`,
    );
    ctx = await createTestApp([], { databaseUrl: db.url });
  }, 60_000);

  afterAll(async () => {
    await ctx.app.close();
    db.drop();
  });

  let accepted = '';

  it('in-app mode: stores a pending request and books nothing', async () => {
    const res = await as('post', '/v1/lessons/requests', student, ask(22));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      mode: 'app',
      whatsapp_url: null,
      request: {
        status: 'pending',
        lesson_id: null,
        coach: { id: coach },
        student: { id: student },
      },
    });
    accepted = res.body.request.id;
    expect(psql(db.url, `SELECT count(*) FROM bookings WHERE club_id = '${club}'`)).toBe('0');
  });

  it('shows the request to its coach and student only', async () => {
    const coachList = await as('get', '/v1/lessons/requests?role=coach', coach);
    expect(coachList.body.items.map((r: { id: string }) => r.id)).toEqual([accepted]);
    const studentList = await as('get', '/v1/lessons/requests?role=student', student);
    expect(studentList.body.items).toHaveLength(1);
    const stranger = await as('get', '/v1/lessons/requests?role=coach', other);
    expect(stranger.body.items).toEqual([]);
    const peek = await as('post', `/v1/lessons/requests/${accepted}/accept`, other);
    expect(peek.status).toBe(404);
  });

  it('only the addressed coach accepts; accepting books a confirmed lesson for the student', async () => {
    const wrong = await as('post', `/v1/lessons/requests/${accepted}/accept`, otherCoach);
    expect(wrong.status).toBe(404);
    const byStudent = await as('post', `/v1/lessons/requests/${accepted}/accept`, student);
    expect(byStudent.status).toBe(403);

    const res = await as('post', `/v1/lessons/requests/${accepted}/accept`, coach);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'accepted' });
    expect(res.body.lesson_id).toEqual(expect.any(String));
    expect(
      psql(
        db.url,
        `SELECT m.type || ' ' || b.status || ' ' || s.accepted FROM lessons l JOIN matches m ON m.id = l.match_id JOIN bookings b ON b.id = m.booking_id JOIN lesson_students s ON s.lesson_id = l.id WHERE l.id = '${res.body.lesson_id}'`,
      ),
    ).toBe('lesson confirmed true');

    const again = await as('post', `/v1/lessons/requests/${accepted}/accept`, coach);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('the accepted lesson occupies the court: the slot is taken for everyone (409)', async () => {
    const res = await as('post', '/v1/lessons/requests', other, ask(22));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_SLOT_TAKEN');
  });

  it('when the slot was taken meanwhile, accepting fails and the request stays pending', async () => {
    const res = await as('post', '/v1/lessons/requests', student, ask(23));
    const id = res.body.request.id;
    await as('post', '/v1/bookings', other, {
      court_id: court,
      starts_at: slot(23),
      duration_minutes: 60,
    });
    const fail = await as('post', `/v1/lessons/requests/${id}/accept`, coach);
    expect(fail.status).toBe(409);
    expect(fail.body.code).toBe('BOOKING_SLOT_TAKEN');
    expect(psql(db.url, `SELECT status FROM lesson_requests WHERE id = '${id}'`)).toBe('pending');
  });

  it('the coach rejects with a reason and the student can withdraw their own', async () => {
    const a = await as('post', '/v1/lessons/requests', student, ask(14));
    const rejected = await as('post', `/v1/lessons/requests/${a.body.request.id}/reject`, coach, {
      reason: 'No tengo ese horario',
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({ status: 'rejected', reason: 'No tengo ese horario' });

    const b = await as('post', '/v1/lessons/requests', student, ask(15));
    const notOwner = await as('post', `/v1/lessons/requests/${b.body.request.id}/cancel`, coach);
    expect(notOwner.status).toBe(403);
    const cancelled = await as('post', `/v1/lessons/requests/${b.body.request.id}/cancel`, student);
    expect(cancelled.body.status).toBe('cancelled');
    const late = await as('post', `/v1/lessons/requests/${b.body.request.id}/accept`, coach);
    expect(late.status).toBe(409);
    expect(psql(db.url, `SELECT count(*) FROM bookings WHERE starts_at = '${slot(15)}'`)).toBe('0');
  });

  it('validates the request and the coach', async () => {
    const noSlot = await as('post', '/v1/lessons/requests', student, {
      club_id: club,
      coach_id: coach,
    });
    expect(noSlot.status).toBe(400);
    const notCoach = await as('post', '/v1/lessons/requests', student, {
      ...ask(16),
      coach_id: other,
    });
    expect(notCoach.status).toBe(404);
    const self = await as('post', '/v1/lessons/requests', coach, ask(16));
    expect(self.status).toBe(400);
  });

  it('WhatsApp mode: returns the coach wa.me link and stores or books nothing', async () => {
    const res = await as('post', '/v1/lessons/requests', student, {
      club_id: clubWa,
      coach_id: coachWa,
      message: 'Hola profe',
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      mode: 'whatsapp',
      request: null,
      whatsapp_url: 'https://wa.me/5491155550000?text=Hola%20profe',
    });
    const bare = await as('post', '/v1/lessons/requests', student, {
      club_id: clubWa,
      coach_id: coachWa,
    });
    expect(bare.body.whatsapp_url).toBe('https://wa.me/5491155550000');
    expect(psql(db.url, `SELECT count(*) FROM lesson_requests WHERE club_id = '${clubWa}'`)).toBe(
      '0',
    );
    const noPhone = await as('post', '/v1/lessons/requests', student, {
      club_id: clubWa,
      coach_id: otherCoach,
    });
    expect(noPhone.status).toBe(400);
  });

  it('RLS: a club never reads the requests of another', () => {
    const count = (clubId: string) =>
      psql(
        db.url,
        `BEGIN; SET LOCAL ROLE app_runtime; SET LOCAL app.role = 'system'; SET LOCAL app.club_id = '${clubId}'; SELECT count(*) FROM lesson_requests; COMMIT`,
      )
        .split('\n')
        .filter((l) => /^\d+$/.test(l))
        .pop();
    expect(Number(count(club))).toBeGreaterThan(0);
    expect(count(clubWa)).toBe('0');
  });
});
