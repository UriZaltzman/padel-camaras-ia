import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVENT_SCHEMAS } from '../../src/events/event-schemas';
import { systemContextFor } from '../../src/events/event-context';
import type { DomainEvent } from '@app/contracts';

// Guards for the layers around the database (issue #112): they fail when someone adds a new door
// (a WebSocket gateway, a signed URL, another queue, another Prisma client) without the
// per-club authorisation that docs/security/rls-matrix.md requires. Adding the door is fine:
// do the work the message asks for, then extend the allow-list here in the same PR.

const SRC = join(__dirname, '..', '..', 'src');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}
const sources = files(SRC).map((p) => ({ path: relative(SRC, p), text: readFileSync(p, 'utf8') }));
const using = (pattern: RegExp): string[] =>
  sources.filter((s) => pattern.test(s.text)).map((s) => s.path);

describe('doors that need per-club authorisation', () => {
  it('there is no WebSocket server yet', () => {
    // contracts/realtime/court-channel.schema.json: when the gateway lands it must (1) authenticate
    // with the access token in the first frame, (2) only join a player to a court where they have a
    // booking or match right now, or staff to courts of their club, (3) bind devices by mTLS to
    // their club (DEVICE_CLUB_MISMATCH), (4) publish to `court:{court_id}` rooms only, and (5)
    // re-check membership when a booking/membership is revoked. Cover each with a test.
    expect(using(/WebSocketGateway|socket\.io|from 'ws'|from "ws"/)).toEqual([]);
  });

  it('there are no signed media URLs or object-storage clients yet', () => {
    // Signed URLs must be minted from a row read through PrismaService.run with the caller's
    // context (so RLS already filtered it), expire in <= 1 hour (spec section 12), and the object
    // key must start with `clubs/{club_id}/`. Put the code in one module and test those three.
    expect(
      using(/getSignedUrl|presign|createSignedUrl|@aws-sdk\/client-s3|@google-cloud\/storage/),
    ).toEqual([]);
  });

  it('only the event bus builds queues and workers', () => {
    expect(using(/new (Queue|Worker)\(/)).toEqual(['events/event-bus.ts']);
  });

  it('only PrismaService builds a database client', () => {
    // The seed (a command line tool for the test clubs, never imported by the API) is the only
    // other one; it refuses to run against production (seed/guard.ts).
    expect(using(/new PrismaClient\(/)).toEqual(['db/prisma.service.ts', 'seed/run.ts']);
  });

  it('raw SQL always goes through the transaction handed to a repository (never a global client)', () => {
    const offenders = sources
      .filter(
        (s) =>
          /\$(queryRaw|executeRaw)/.test(s.text) && !/\btx\.\$(queryRaw|executeRaw)/.test(s.text),
      )
      .map((s) => s.path);
    expect(offenders).toEqual([]);
  });

  it('Redis keys are scoped by user, token or event, never by a shared bare id', () => {
    const keys = sources.flatMap((s) =>
      [
        ...s.text.matchAll(
          /`((?:idem|payments|otp|rt|rt-revoked|events|availability|club)[:-][^`]*)`/g,
        ),
      ].map((m) => `${s.path}: ${m[1] ?? ''}`),
    );
    // Every key names who or what it belongs to: a user, a phone, a token id, a consumer+event.
    expect(keys.filter((k) => !/\$\{(userId|phone|id|consumer|familyId|key)/.test(k))).toEqual([]);
  });
});

describe('events carry the club', () => {
  const withPayload = EVENT_SCHEMAS.filter(
    (s) => (s as { properties?: { payload?: unknown } }).properties?.payload !== undefined,
  );
  it('every event payload requires club_id', () => {
    const missing = withPayload
      .filter(
        (s) =>
          !(
            s as { properties: { payload: { required: string[] } } }
          ).properties.payload.required.includes('club_id'),
      )
      .map((s) => (s as { title: string }).title);
    expect(missing).toEqual([]);
    expect(withPayload.length).toBeGreaterThanOrEqual(12);
  });

  it('a consumer acts as the system role of the event club, and refuses an event without one', () => {
    const club = '0192a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c';
    const event = {
      event_type: 'payment.refunded',
      payload: { club_id: club },
    } as unknown as DomainEvent;
    expect(systemContextFor(event)).toEqual({ role: 'system', clubId: club });
    for (const bad of [null, undefined, '']) {
      const forged = {
        event_type: 'payment.approved',
        payload: { club_id: bad },
      } as unknown as DomainEvent;
      expect(() => systemContextFor(forged)).toThrow(/no club_id/);
    }
  });
});
