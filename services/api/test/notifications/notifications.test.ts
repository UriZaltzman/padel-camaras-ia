import type { EventOf } from '@app/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeReminderScheduler,
  InMemorySentLog,
  type NotificationDirectory,
} from '../../src/notifications/ports';
import {
  NotificationsService,
  REMINDER_LEAD_MS,
} from '../../src/notifications/notifications.service';
import { FakeWhatsAppProvider } from '../../src/notifications/whatsapp-provider';
import { bookingConfirmed } from '../events/fixtures';

const NOW = new Date('2026-10-20T10:00:00Z');
const phones: Record<string, string | null> = {
  '0192ef6e-7c1a-7d4e-9b3a-2f6c8e1d4a54': '+5491100000001',
  '01923f6e-7c1a-7d4e-9b3a-2f6c8e1d4a59': '+5491100000002',
  nophone: null,
};

function setup(status = 'confirmed') {
  const provider = new FakeWhatsAppProvider();
  const scheduler = new FakeReminderScheduler();
  const directory: NotificationDirectory = {
    recipient: (userId) => Promise.resolve({ userId, phone: phones[userId] ?? null }),
    booking: (bookingId) =>
      Promise.resolve({
        bookingId,
        clubName: 'Club Prueba',
        courtName: 'Cancha 1',
        status,
        startsAt: '2026-10-20T22:00:00Z',
      }),
    clubName: () => Promise.resolve('Club Prueba'),
  };
  const service = new NotificationsService(
    provider,
    directory,
    new InMemorySentLog(),
    scheduler,
    'https://app.test',
    () => NOW,
  );
  return { provider, scheduler, service };
}

const published: EventOf<'match.published'> = {
  event_id: '0192a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b',
  event_type: 'match.published',
  occurred_at: '2026-10-20T23:30:00Z',
  schema_version: 1,
  payload: {
    match_id: '01920f6e-7c1a-7d4e-9b3a-2f6c8e1d4a56',
    club_id: '0192cf6e-7c1a-7d4e-9b3a-2f6c8e1d4a52',
    status: 'published',
    player_user_ids: [
      '0192ef6e-7c1a-7d4e-9b3a-2f6c8e1d4a54',
      '01923f6e-7c1a-7d4e-9b3a-2f6c8e1d4a59',
      'nophone',
    ],
  },
};

describe('NotificationsService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('confirms the booking and schedules the reminder 1 hour before the start', async () => {
    const event = bookingConfirmed();
    await ctx.service.onBookingConfirmed(event);
    expect(ctx.provider.sent).toHaveLength(1);
    expect(ctx.provider.sent[0]?.to).toBe('+5491100000001');
    expect(ctx.provider.sent[0]?.body).toContain('Club Prueba');
    const runAt = ctx.scheduler.jobs.get(event.payload.booking_id);
    expect(runAt?.getTime()).toBe(new Date(event.payload.starts_at).getTime() - REMINDER_LEAD_MS);
    expect(REMINDER_LEAD_MS).toBe(3_600_000);
  });

  it('does not schedule a reminder that would already be in the past', async () => {
    const event = bookingConfirmed();
    event.payload.starts_at = '2026-10-20T10:30:00Z';
    await ctx.service.onBookingConfirmed(event);
    expect(ctx.scheduler.jobs.size).toBe(0);
  });

  it('sends the confirmation once even if the event repeats', async () => {
    await ctx.service.onBookingConfirmed(bookingConfirmed());
    await ctx.service.onBookingConfirmed(bookingConfirmed());
    expect(ctx.provider.sent).toHaveLength(1);
  });

  it('retries after a provider failure', async () => {
    ctx.provider.failNext = 1;
    await expect(ctx.service.onBookingConfirmed(bookingConfirmed())).rejects.toThrow();
    await ctx.service.onBookingConfirmed(bookingConfirmed());
    expect(ctx.provider.sent).toHaveLength(1);
  });

  it('cancels the reminder when the booking is cancelled', async () => {
    const event = bookingConfirmed();
    await ctx.service.onBookingConfirmed(event);
    await ctx.service.onBookingCancelled({
      ...event,
      event_type: 'booking.cancelled',
    } as unknown as EventOf<'booking.cancelled'>);
    expect(ctx.scheduler.jobs.size).toBe(0);
  });

  it('sends the reminder once, and skips cancelled bookings', async () => {
    const id = '0192bf6e-7c1a-7d4e-9b3a-2f6c8e1d4a51';
    const user = '0192ef6e-7c1a-7d4e-9b3a-2f6c8e1d4a54';
    await ctx.service.sendReminder(id, user);
    await ctx.service.sendReminder(id, user);
    expect(ctx.provider.sent).toHaveLength(1);
    expect(ctx.provider.sent[0]?.body).toContain('1 hora');

    const cancelled = setup('cancelled');
    await cancelled.service.sendReminder(id, user);
    expect(cancelled.provider.sent).toHaveLength(0);
  });

  it('notifies each player with a phone when the match is published', async () => {
    await ctx.service.onMatchPublished(published);
    await ctx.service.onMatchPublished(published);
    expect(ctx.provider.sent.map((m) => m.to)).toEqual(['+5491100000001', '+5491100000002']);
    expect(ctx.provider.sent[0]?.body).toContain('https://app.test/matches/');
  });
});
