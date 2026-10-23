import { describe, expect, it } from 'vitest';
import type { AccessIdentity } from '../../src/auth/session/session.service';
import { AvailabilityService } from '../../src/bookings/availability.service';
import { SlotTakenError } from '../../src/bookings/bookings.repository';
import type { CancellationService } from '../../src/bookings/cancellation.service';
import {
  BlockNotifier,
  CourtBlocksRepository,
  type BlockCourt,
  type ConflictingBooking,
  type NewBlock,
  type StoredBlock,
} from '../../src/bookings/court-blocks.repository';
import { CourtBlocksService } from '../../src/bookings/court-blocks.service';
import type { ClubAccessService } from '../../src/clubs/club-access.service';
import { FakeClock } from '../../src/common/clock';
import { loadEnv } from '../../src/config/env';
import type { AppError } from '../../src/errors/app-error';
import { VALID_ENV } from '../helpers';
import { FakeBookingsRepository } from './fake-repo';

const CLUB = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e01';
const C1 = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e11';
const C2 = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e12';
const BOOKING = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e21';
const PLAYER = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e31';
const staff: AccessIdentity = { userId: '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e41', sessionId: 's' };
// Clock: 2026-11-01T12:00Z. 18:00 local on 11-05 = 21:00Z.
const START = '2026-11-05T21:00:00.000Z';
const END = '2026-11-05T22:30:00.000Z';

class FakeBlocksRepo extends CourtBlocksRepository {
  bookings: ConflictingBooking[] = [];
  blocks: StoredBlock[] = [];
  courtList: BlockCourt[] = [
    { id: C1, status: 'active', timezone: 'America/Argentina/Buenos_Aires' },
    { id: C2, status: 'active', timezone: 'America/Argentina/Buenos_Aires' },
  ];
  courts(_c: unknown, _club: string, ids: string[]) {
    return Promise.resolve(this.courtList.filter((c) => ids.includes(c.id)));
  }
  expireHolds() {
    return Promise.resolve();
  }
  private overlap(courtId: string, from: Date, to: Date) {
    return (r: { courtId: string; startsAt: Date; endsAt: Date }) =>
      r.courtId === courtId && r.startsAt < to && r.endsAt > from;
  }
  conflicts(_c: unknown, courtId: string, from: Date, to: Date) {
    const blocks = this.blocks.filter(this.overlap(courtId, from, to)).map((b) => ({
      id: b.id,
      courtId: b.courtId,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      status: 'confirmed' as const,
      isBlock: true,
      playerUserId: null,
    }));
    return Promise.resolve([...this.bookings.filter(this.overlap(courtId, from, to)), ...blocks]);
  }
  freeCourts(_c: unknown, _club: string, except: string[], from: Date, to: Date) {
    return Promise.resolve(
      this.courtList
        .filter((c) => c.status === 'active' && !except.includes(c.id))
        .filter((c) => !this.bookings.some(this.overlap(c.id, from, to)) || false)
        .map((c) => c.id),
    );
  }
  moveBooking(_c: unknown, id: string, courtId: string) {
    const b = this.bookings.find((x) => x.id === id);
    if (b) b.courtId = courtId;
    return Promise.resolve();
  }
  cancelHold(_c: unknown, id: string) {
    this.bookings = this.bookings.filter((b) => b.id !== id);
    return Promise.resolve();
  }
  insert(_c: unknown, block: NewBlock) {
    const clash = [...this.bookings, ...this.blocks].some(
      this.overlap(block.courtId, block.startsAt, block.endsAt),
    );
    if (clash) return Promise.reject(new SlotTakenError());
    this.blocks.push(block);
    return Promise.resolve(block);
  }
  list() {
    return Promise.resolve(this.blocks);
  }
  remove(_c: unknown, _club: string, id: string) {
    const n = this.blocks.length;
    this.blocks = this.blocks.filter((b) => b.id !== id);
    return Promise.resolve(this.blocks.length < n);
  }
}

class Notices extends BlockNotifier {
  sent: { bookingId: string; userId: string; refundCents: number }[] = [];
  bookingCancelledByClub(i: { bookingId: string; userId: string; refundCents: number }) {
    this.sent.push(i);
    return Promise.resolve();
  }
}

function setup() {
  const repo = new FakeBlocksRepo();
  repo.bookings.push({
    id: BOOKING,
    courtId: C1,
    startsAt: new Date(START),
    endsAt: new Date(END),
    status: 'confirmed',
    isBlock: false,
    playerUserId: PLAYER,
  });
  const cancelled: string[] = [];
  const cancellation = {
    cancelByClub: (_a: unknown, id: string) => {
      cancelled.push(id);
      repo.bookings = repo.bookings.filter((b) => b.id !== id);
      return Promise.resolve({ refund_cents: 500 });
    },
  } as unknown as CancellationService;
  const access = {
    authorize: () => Promise.resolve({ role: 'staff', db: { role: 'staff', clubId: CLUB } }),
  } as unknown as ClubAccessService;
  const notices = new Notices();
  const clock = new FakeClock();
  const service = new CourtBlocksService(
    repo,
    access,
    cancellation,
    new AvailabilityService(new FakeBookingsRepository({} as never), clock),
    notices,
    clock,
    loadEnv(VALID_ENV),
  );
  return { repo, service, cancelled, notices };
}

const base = { court_ids: [C1], starts_at: START, ends_at: END, kind: 'maintenance' as const };
const code = async (p: Promise<unknown>): Promise<string> =>
  p.then(
    () => 'ok',
    (e: AppError) => e.code,
  );

describe('court blocks', () => {
  it('blocks a free court', async () => {
    const { service, repo } = setup();
    const r = await service.create(staff, CLUB, { ...base, court_ids: [C2] });
    expect(r.blocks).toHaveLength(1);
    expect(repo.blocks[0]?.kind).toBe('maintenance');
  });

  it('answers 409 over a booking without a policy, and changes nothing', async () => {
    const { service, repo, cancelled } = setup();
    await expect(code(service.create(staff, CLUB, base))).resolves.toBe('BOOKING_SLOT_TAKEN');
    expect(repo.blocks).toHaveLength(0);
    expect(cancelled).toHaveLength(0);
  });

  it('answers 409 on abort', async () => {
    const { service } = setup();
    const p = service.create(staff, CLUB, { ...base, existing_bookings_policy: 'abort' });
    await expect(code(p)).resolves.toBe('BOOKING_SLOT_TAKEN');
  });

  it('cancel_and_refund cancels, refunds and tells the player', async () => {
    const { service, repo, cancelled, notices } = setup();
    const r = await service.create(staff, CLUB, {
      ...base,
      reason: 'Cancha en reparación',
      existing_bookings_policy: 'cancel_and_refund',
    });
    expect(cancelled).toEqual([BOOKING]);
    expect(r.cancelled_booking_ids).toEqual([BOOKING]);
    expect(r.refunded_cents).toBe(500);
    expect(notices.sent).toMatchObject([{ bookingId: BOOKING, userId: PLAYER, refundCents: 500 }]);
    expect(repo.blocks).toHaveLength(1);
  });

  it('move puts the booking on another free court', async () => {
    const { service, repo } = setup();
    const r = await service.create(staff, CLUB, { ...base, existing_bookings_policy: 'move' });
    expect(r.moved).toEqual([{ booking_id: BOOKING, court_id: C2 }]);
    expect(repo.bookings[0]?.courtId).toBe(C2);
    expect(repo.blocks).toHaveLength(1);
  });

  it('move answers 409 when no other court is free', async () => {
    const { service, repo } = setup();
    const p = service.create(staff, CLUB, {
      ...base,
      court_ids: [C1, C2],
      existing_bookings_policy: 'move',
    });
    await expect(code(p)).resolves.toBe('BOOKING_SLOT_TAKEN');
    expect(repo.blocks).toHaveLength(0);
  });

  it('never cancels another block', async () => {
    const { service } = setup();
    await service.create(staff, CLUB, { ...base, court_ids: [C2] });
    const p = service.create(staff, CLUB, {
      ...base,
      court_ids: [C2],
      existing_bookings_policy: 'cancel_and_refund',
    });
    await expect(code(p)).resolves.toBe('BOOKING_SLOT_TAKEN');
  });

  it('repeats weekly in local time with a shared series id', async () => {
    const { service } = setup();
    const r = await service.create(staff, CLUB, {
      ...base,
      court_ids: [C2],
      recurrence: { frequency: 'weekly', until: '2026-11-26' },
    });
    expect(r.blocks.map((b) => b.starts_at)).toEqual([
      '2026-11-05T21:00:00.000Z',
      '2026-11-12T21:00:00.000Z',
      '2026-11-19T21:00:00.000Z',
      '2026-11-26T21:00:00.000Z',
    ]);
    expect(new Set(r.blocks.map((b) => b.series_id)).size).toBe(1);
  });

  it('rejects a recurrence longer than a year', async () => {
    const { service } = setup();
    const p = service.create(staff, CLUB, {
      ...base,
      court_ids: [C2],
      recurrence: { frequency: 'daily', until: '2027-12-31' },
    });
    await expect(code(p)).resolves.toBe('VALIDATION_FAILED');
  });

  it('imports the year holidays as full local days, skipping past ones', async () => {
    const { service } = setup();
    const r = await service.importHolidays(staff, CLUB, { year: 2026, court_ids: [C2] });
    expect(r.blocks.every((b) => b.kind === 'holiday')).toBe(true);
    expect(r.blocks.some((b) => b.starts_at.startsWith('2026-01'))).toBe(false);
    const dec25 = r.blocks.find((b) => b.starts_at === '2026-12-25T03:00:00.000Z');
    expect(dec25?.ends_at).toBe('2026-12-26T03:00:00.000Z');
  });

  it('a block removed frees the court', async () => {
    const { service, repo } = setup();
    const r = await service.create(staff, CLUB, { ...base, court_ids: [C2] });
    await service.remove(staff, CLUB, r.blocks[0]?.id ?? '');
    expect(repo.blocks).toHaveLength(0);
  });
});
