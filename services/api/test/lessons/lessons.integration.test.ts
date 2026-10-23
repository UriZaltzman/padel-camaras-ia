import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionService } from '../../src/auth/session/session.service';
import { newId } from '../../src/db/ids';
import { CoachAccessService } from '../../src/lessons/coach-access.service';
import { LessonsRepository } from '../../src/lessons/lessons.repository';
import { adminUrl, createScratchDb, psql } from '../db/scratch-db';
import { createTestApp } from '../helpers';

describe.skipIf(!adminUrl)('lessons against Postgres', () => {
  const db = adminUrl ? createScratchDb('lessons') : { url: '', drop: () => undefined };
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const club = newId();
  const clubOff = newId();
  const court = newId();
  const courtOff = newId();
  const rule = newId();
  const ruleOff = newId();
  const coach = newId();
  const otherCoach = newId();
  const student = newId();
  const minor = newId();
  const stranger = newId();
  // The fake clock starts at 2026-11-01T12:00Z; 2026-11-02 19:00 local is 22:00 UTC.
  const startsAt = '2026-11-02T22:00:00.000Z';
  const body = { court_id: court, starts_at: startsAt, duration_minutes: 60, kind: 'private' };

  const tokenOf = async (userId: string): Promise<string> =>
    (await ctx.app.get(SessionService).issue(userId)).access_token;
  const http = () => request(ctx.app.getHttpServer());
  const as = async (method: 'get' | 'post', url: string, userId: string, payload?: object) => {
    const req = http()
      [method](url)
      .set('Authorization', `Bearer ${await tokenOf(userId)}`);
    return payload ? req.send(payload) : req;
  };

  beforeAll(async () => {
    const rules = (c: string, k: string, r: string) => `
      INSERT INTO courts (id, club_id, name, updated_at) VALUES ('${k}', '${c}', 'Cancha 1', now());
      INSERT INTO booking_slots_rules (id, club_id, court_id, days_of_week, opens_at, closes_at, allowed_durations_minutes, start_interval_minutes, deposit_kind, deposit_bps, updated_at)
        VALUES ('${r}', '${c}', '${k}', '{1,2,3,4,5,6,7}', '08:00', '00:00', '{60,90}', 30, 'percent', 3000, now());
      INSERT INTO booking_rule_price_bands (id, club_id, rule_id, starts_at, ends_at, duration_minutes, price_cents, updated_at)
        VALUES ('${randomUUID()}', '${c}', '${r}', '08:00', '00:00', 60, 1000, now());`;
    const member = (c: string, u: string, role: string) =>
      `INSERT INTO memberships (id, club_id, user_id, role, status, updated_at) VALUES ('${newId()}', '${c}', '${u}', '${role}', 'active', now());`;
    psql(
      db.url,
      `INSERT INTO clubs (id, name, address, plan, updated_at) VALUES ('${club}', 'Club', 'Calle 1', 'loan', now()), ('${clubOff}', 'Club WA', 'Calle 2', 'loan', now());
       ${rules(club, court, rule)} ${rules(clubOff, courtOff, ruleOff)}
       INSERT INTO club_modules (club_id, lesson_mode, updated_at) VALUES ('${clubOff}', 'whatsapp', now());
       INSERT INTO users (id, name, birth_date, updated_at) VALUES
         ('${coach}', 'Coach', NULL, now()), ('${otherCoach}', 'Otro', NULL, now()),
         ('${student}', 'Sofía', '1990-01-01', now()), ('${minor}', 'Peque', '2016-05-05', now()),
         ('${stranger}', 'Nadie', NULL, now());
       ${member(club, coach, 'coach')} ${member(club, otherCoach, 'coach')} ${member(clubOff, coach, 'coach')}
       ${member(club, stranger, 'player')}`,
    );
    ctx = await createTestApp([], { databaseUrl: db.url });
  }, 60_000);

  afterAll(async () => {
    await ctx.app.close();
    db.drop();
  });

  let lessonId = '';

  it('lets a coach schedule a lesson: confirmed booking, lesson match and invited students', async () => {
    const res = await as('post', '/v1/lessons', coach, {
      ...body,
      student_ids: [student],
      price_cents: 2500000,
    });
    expect(res.status).toBe(201);
    lessonId = res.body.id;
    expect(res.body).toMatchObject({
      kind: 'private',
      booking_status: 'confirmed',
      price_cents: 2500000,
      no_record: false,
      no_record_reason: null,
      notes_count: 0,
      coach: { id: coach },
      students: [{ user: { id: student }, accepted: false, payment_status: null }],
    });
    expect(
      psql(
        db.url,
        `SELECT m.type || ' ' || b.status FROM lessons l JOIN matches m ON m.id = l.match_id JOIN bookings b ON b.id = m.booking_id WHERE l.id = '${lessonId}'`,
      ),
    ).toBe('lesson confirmed');
  });

  it('occupies the court like any booking: the same slot is taken (409)', async () => {
    const again = await as('post', '/v1/lessons', coach, body);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('BOOKING_SLOT_TAKEN');
    const booking = await as('post', '/v1/bookings', stranger, {
      court_id: court,
      starts_at: startsAt,
      duration_minutes: 60,
    });
    expect(booking.status).toBe(409);
  });

  it('never records a minor without a guardian, and schools default to not recorded', async () => {
    const withMinor = await as('post', '/v1/lessons', coach, {
      ...body,
      starts_at: '2026-11-02T23:00:00.000Z',
      student_ids: [minor],
      record: true,
    });
    expect(withMinor.body).toMatchObject({
      no_record: true,
      no_record_reason: 'minor_without_guardian',
    });
    const school = await as('post', '/v1/lessons', coach, {
      ...body,
      starts_at: '2026-11-03T14:00:00.000Z',
      kind: 'school',
    });
    expect(school.body).toMatchObject({ no_record: true, no_record_reason: 'club_school' });
  });

  it('rejects non coaches (403) and clubs that run lessons on WhatsApp (CLUB_FEATURE_DISABLED)', async () => {
    const player = await as('post', '/v1/lessons', stranger, body);
    expect(player.status).toBe(403);
    expect(player.body.code).toBe('FORBIDDEN');
    const off = await as('post', '/v1/lessons', coach, { ...body, court_id: courtOff });
    expect(off.status).toBe(403);
    expect(off.body.code).toBe('CLUB_FEATURE_DISABLED');
  });

  it('keeps notes for the lesson coach only', async () => {
    const note = {
      text: 'Cerrá antes la paleta',
      at_ms: 845000,
      student_id: student,
      drawing: {
        strokes: [
          {
            color: '#FFD400',
            width: 0.006,
            points: [
              [0.4, 0.3],
              [0.5, 0.4],
            ],
          },
        ],
      },
    };
    const ok = await as('post', `/v1/lessons/${lessonId}/notes`, coach, note);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({
      lesson_id: lessonId,
      visible_to_students: true,
      is_plan: false,
    });
    const foreign = await as('post', `/v1/lessons/${lessonId}/notes`, otherCoach, note);
    expect(foreign.status).toBe(403);
    expect((await as('post', `/v1/lessons/${lessonId}/notes`, stranger, note)).status).toBe(404);
    const noFrame = await as('post', `/v1/lessons/${lessonId}/notes`, coach, {
      text: 'x',
      drawing: note.drawing,
    });
    expect(noFrame.status).toBe(400);
    const listed = await as('get', '/v1/lessons', coach);
    expect(listed.body.items.find((l: { id: string }) => l.id === lessonId).notes_count).toBe(1);
  });

  it('shows lessons to the coach and, once invited, to the student', async () => {
    const mine = await as('get', '/v1/lessons?limit=2', coach);
    expect(mine.status).toBe(200);
    expect(mine.body.items).toHaveLength(2);
    expect(mine.body.next_cursor).not.toBeNull();
    const next = await as('get', `/v1/lessons?limit=2&cursor=${mine.body.next_cursor}`, coach);
    expect(next.body.items).toHaveLength(1);
    expect(next.body.next_cursor).toBeNull();
    const asStudent = await as('get', '/v1/lessons', student);
    expect(asStudent.body.items.map((l: { id: string }) => l.id)).toEqual([lessonId]);
    expect((await as('get', '/v1/lessons', stranger)).body.items).toEqual([]);
  });

  it('without consent the coach does not see the student matches; with it, until revoked', async () => {
    const repo = ctx.app.get(LessonsRepository);
    const access = ctx.app.get(CoachAccessService);
    expect((await as('get', '/v1/coach/students', coach)).body.items).toEqual([]);
    expect((await as('get', '/v1/coach/students', stranger)).status).toBe(403);

    expect(await repo.acceptInvite(club, lessonId, student, new Date())).toBe(true);
    const students = await as('get', '/v1/coach/students', coach);
    expect(students.body.items).toEqual([
      {
        user: { id: student, name: 'Sofía' },
        access: 'lessons_only',
        lessons_count: 1,
        last_lesson_at: startsAt,
        pending_payment_cents: 0,
      },
    ]);
    await expect(access.assertCanViewMatchesOf(club, coach, student)).rejects.toMatchObject({
      code: 'COACH_ACCESS_NOT_GRANTED',
    });
    // Consent in one club or for one coach does not leak to another.
    await access.setAccess(student, club, coach, 'matches_and_lessons');
    await expect(access.assertCanViewMatchesOf(club, coach, student)).resolves.toBeUndefined();
    await expect(access.assertCanViewMatchesOf(club, otherCoach, student)).rejects.toMatchObject({
      code: 'COACH_ACCESS_NOT_GRANTED',
    });
    expect((await as('get', '/v1/coach/students', coach)).body.items[0].access).toBe(
      'matches_and_lessons',
    );

    await access.setAccess(student, club, coach, 'lessons_only');
    await expect(access.assertCanViewMatchesOf(club, coach, student)).rejects.toMatchObject({
      code: 'COACH_ACCESS_NOT_GRANTED',
    });
  });
});
