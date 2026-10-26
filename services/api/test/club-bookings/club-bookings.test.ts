import { describe, expect, it } from 'vitest';
import type { AccessIdentity } from '../../src/auth/session/session.service';
import {
  ClubBookingsRepository,
  type ClubBookingFilter,
  type ClubBookingRow,
} from '../../src/club-bookings/club-bookings.repository';
import { ClubBookingsService } from '../../src/club-bookings/club-bookings.service';
import type { ClubAccessService } from '../../src/clubs/club-access.service';
import { loadEnv } from '../../src/config/env';
import { AppError } from '../../src/errors/app-error';
import {
  SelfApprovingPaymentProvider,
  type PreferenceRequest,
} from '../../src/payments/payment-provider';

const CLUB = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60';
const auth = { userId: 'u1' } as unknown as AccessIdentity;

class FakeRepo extends ClubBookingsRepository {
  filters: ClubBookingFilter[] = [];
  constructor(private readonly rows: ClubBookingRow[]) {
    super();
  }
  list(_ctx: unknown, filter: ClubBookingFilter): Promise<ClubBookingRow[]> {
    this.filters.push(filter);
    return Promise.resolve(this.rows.slice(filter.skip, filter.skip + filter.take));
  }
}

function row(i: number): ClubBookingRow {
  return {
    id: `b${i}`,
    clubId: CLUB,
    courtId: 'c1',
    courtName: 'Cancha 1',
    startsAt: new Date(Date.UTC(2026, 9, 27, 12 + i)),
    endsAt: new Date(Date.UTC(2026, 9, 27, 13 + i)),
    status: 'confirmed',
    holdExpiresAt: null,
    priceCents: 100,
    depositPaidCents: 50,
    origin: 'app',
    noRecord: false,
    createdAt: new Date(Date.UTC(2026, 9, 26)),
    bookerId: 'p1',
    bookerName: 'Lucía Pérez',
    bookerPhone: '+5491155501011',
  };
}

const access = {
  authorize: (_a: unknown, _c: string, _p: string) =>
    Promise.resolve({ role: 'staff', db: { role: 'staff', userId: 'u1', clubId: CLUB } }),
} as unknown as ClubAccessService;

const range = { from: new Date('2026-10-27T03:00:00Z'), to: new Date('2026-10-28T03:00:00Z') };

describe('ClubBookingsService', () => {
  it('lists bookings with the booker and pages with a cursor', async () => {
    const service = new ClubBookingsService(new FakeRepo([row(0), row(1), row(2)]), access);
    const first = await service.list(auth, CLUB, { ...range, limit: 2 });
    expect(first.items.map((b) => b.id)).toEqual(['b0', 'b1']);
    expect(first.items[0]).toMatchObject({
      court_name: 'Cancha 1',
      duration_minutes: 60,
      booker: { name: 'Lucía Pérez', phone: '+5491155501011' },
    });
    expect(first.next_cursor).not.toBeNull();
    const second = await service.list(auth, CLUB, {
      ...range,
      limit: 2,
      cursor: first.next_cursor ?? undefined,
    });
    expect(second.items.map((b) => b.id)).toEqual(['b2']);
    expect(second.next_cursor).toBeNull();
  });

  it('refuses ranges longer than 31 days and backwards ranges', async () => {
    const service = new ClubBookingsService(new FakeRepo([]), access);
    await expect(
      service.list(auth, CLUB, {
        from: range.from,
        to: new Date('2026-12-01T00:00:00Z'),
        limit: 5,
      }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      service.list(auth, CLUB, { from: range.to, to: range.from, limit: 5 }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('fake payment provider for the e2e stack', () => {
  const request: PreferenceRequest = {
    externalReference: `${CLUB}:01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4aaa`,
    title: 'Seña',
    amountCents: 800_000,
    marketplaceFeeCents: 0,
    collectorId: null,
    expiresAt: null,
  };

  it('pays in full the preferences it created and knows no others', async () => {
    const provider = new SelfApprovingPaymentProvider();
    const { preferenceId } = await provider.createPreference(request);
    await expect(provider.getPayment(preferenceId)).resolves.toMatchObject({
      status: 'approved',
      amountCents: 800_000,
      externalReference: request.externalReference,
    });
    await expect(provider.getPayment('fake-unknown')).rejects.toBeInstanceOf(AppError);
    await provider.refund(preferenceId);
    await expect(provider.getPayment(preferenceId)).resolves.toMatchObject({ status: 'refunded' });
  });

  it('is refused in production', () => {
    const base = { DATABASE_URL: 'postgresql://u@localhost/app', REDIS_URL: 'redis://localhost' };
    expect(loadEnv({ ...base, NODE_ENV: 'development', PAYMENT_PROVIDER: 'fake' })).toMatchObject({
      PAYMENT_PROVIDER: 'fake',
    });
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        PAYMENT_PROVIDER: 'fake',
        AUTH_OTP_SECRET: 'x'.repeat(32),
        AUTH_JWT_PRIVATE_KEY: 'key',
      }),
    ).toThrow(/PAYMENT_PROVIDER/);
    expect(loadEnv({ ...base }).PAYMENT_PROVIDER).toBe('mercadopago');
  });
});
