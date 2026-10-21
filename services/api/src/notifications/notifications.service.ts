import type { EventOf } from '@app/contracts';
import { interpolate } from '../i18n/messages';
import messages from '../i18n/es-AR/notifications.json';
import type { NotificationDirectory, ReminderScheduler, SentLog } from './ports';
import type { WhatsAppProvider } from './whatsapp-provider';

/** Decision #254: the reminder goes out 1 hour before the booking. */
export const REMINDER_LEAD_MS = 60 * 60 * 1000;

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export class NotificationsService {
  constructor(
    private readonly provider: WhatsAppProvider,
    private readonly directory: NotificationDirectory,
    private readonly sentLog: SentLog,
    private readonly scheduler: ReminderScheduler,
    private readonly appUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Sends the confirmation and schedules the reminder for 1 hour before the start. */
  async onBookingConfirmed(event: EventOf<'booking.confirmed'>): Promise<void> {
    const p = event.payload;
    const [recipient, booking] = await Promise.all([
      this.directory.recipient(p.organizer_user_id),
      this.directory.booking(p.booking_id),
    ]);
    const runAt = new Date(new Date(p.starts_at).getTime() - REMINDER_LEAD_MS);
    if (runAt.getTime() > this.now().getTime()) {
      await this.scheduler.schedule(p.booking_id, runAt);
    }
    if (!booking) return;
    await this.deliver(`booking_confirmed:${p.booking_id}`, recipient, messages.booking_confirmed, {
      club: booking.clubName,
      court: booking.courtName,
      when: formatWhen(p.starts_at),
    });
  }

  async onBookingCancelled(event: EventOf<'booking.cancelled'>): Promise<void> {
    await this.scheduler.cancel(event.payload.booking_id);
  }

  /** Runs when the delayed job fires. Skips bookings that were cancelled in the meantime. */
  async sendReminder(bookingId: string, organizerUserId: string): Promise<void> {
    const booking = await this.directory.booking(bookingId);
    if (booking?.status !== 'confirmed') return;
    const recipient = await this.directory.recipient(organizerUserId);
    await this.deliver(`booking_reminder:${bookingId}`, recipient, messages.booking_reminder, {
      club: booking.clubName,
      when: formatWhen(booking.startsAt),
    });
  }

  async onMatchPublished(event: EventOf<'match.published'>): Promise<void> {
    const p = event.payload;
    const club = await this.directory.clubName(p.club_id);
    const link = `${this.appUrl}/matches/${p.match_id}`;
    for (const userId of p.player_user_ids) {
      const recipient = await this.directory.recipient(userId);
      await this.deliver(
        `match_published:${p.match_id}:${userId}`,
        recipient,
        messages.match_published,
        {
          club,
          link,
        },
      );
    }
  }

  /** Sends at most once per key. On failure the claim is released so the retry sends again. */
  private async deliver(
    key: string,
    recipient: { phone: string | null } | null,
    template: string,
    params: Record<string, string>,
  ): Promise<void> {
    if (!recipient?.phone) return;
    if (!(await this.sentLog.claim(key))) return;
    try {
      await this.provider.send({
        to: recipient.phone,
        body: interpolate(template, params),
        idempotencyKey: key,
      });
    } catch (error) {
      await this.sentLog.release(key);
      throw error;
    }
  }
}
