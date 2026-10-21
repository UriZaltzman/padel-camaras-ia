export interface Recipient {
  userId: string;
  /** E.164; null when the user has no WhatsApp number. */
  phone: string | null;
}

export interface BookingInfo {
  bookingId: string;
  clubName: string;
  courtName: string;
  /** Booking status, so a reminder is skipped if it was cancelled in the meantime. */
  status: string;
  startsAt: string;
}

/** Reads the data a message needs. Backed by Prisma once the schema lands. */
export interface NotificationDirectory {
  recipient(userId: string): Promise<Recipient | null>;
  booking(bookingId: string): Promise<BookingInfo | null>;
  clubName(clubId: string): Promise<string>;
}

/** Remembers what was already sent, so a retry or a repeated event never double-sends. */
export interface SentLog {
  /** Returns true if the key was newly claimed, false if it was already there. */
  claim(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
}

/** Delayed jobs: the reminder fires once, at `runAt`, and can be cancelled. */
export interface ReminderScheduler {
  schedule(bookingId: string, runAt: Date): Promise<void>;
  cancel(bookingId: string): Promise<void>;
}

export class InMemorySentLog implements SentLog {
  private readonly keys = new Set<string>();
  claim(key: string): Promise<boolean> {
    if (this.keys.has(key)) return Promise.resolve(false);
    this.keys.add(key);
    return Promise.resolve(true);
  }
  release(key: string): Promise<void> {
    this.keys.delete(key);
    return Promise.resolve();
  }
}

export class FakeReminderScheduler implements ReminderScheduler {
  readonly jobs = new Map<string, Date>();
  schedule(bookingId: string, runAt: Date): Promise<void> {
    this.jobs.set(bookingId, runAt);
    return Promise.resolve();
  }
  cancel(bookingId: string): Promise<void> {
    this.jobs.delete(bookingId);
    return Promise.resolve();
  }
}
