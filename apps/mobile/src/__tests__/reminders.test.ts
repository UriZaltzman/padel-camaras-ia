import {
  REMINDER_LEAD_MS,
  cancelAllBookingReminders,
  ensurePermission,
  reminderDate,
  reminderId,
  scheduleBookingReminder,
  type NotificationsModule,
} from '../notifications/reminders';

function fakeNotifications(perm = { granted: true, canAskAgain: true }) {
  const scheduled = new Map<string, unknown>();
  const n = {
    getPermissionsAsync: jest.fn(async () => perm),
    requestPermissionsAsync: jest.fn(async () => ({ ...perm, granted: true })),
    scheduleNotificationAsync: jest.fn(async (req: { identifier: string }) => {
      scheduled.set(req.identifier, req);
      return req.identifier;
    }),
    cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
      scheduled.delete(id);
    }),
    getAllScheduledNotificationsAsync: jest.fn(async () =>
      [...scheduled.keys()].map((identifier) => ({ identifier })),
    ),
  };
  return { n: n as unknown as NotificationsModule, mocks: n, scheduled };
}

const text = { title: 't', body: 'b' };
const now = new Date('2026-10-21T12:00:00Z');

describe('booking reminders', () => {
  it('fires exactly 1 hour before the booking (decision #254)', () => {
    expect(REMINDER_LEAD_MS).toBe(3_600_000);
    expect(reminderDate('2026-10-21T20:00:00Z', now)?.toISOString()).toBe(
      '2026-10-21T19:00:00.000Z',
    );
  });

  it('skips reminders whose moment already passed', () => {
    expect(reminderDate('2026-10-21T12:30:00Z', now)).toBeNull();
  });

  it('schedules a date trigger with the booking id', async () => {
    const { n, mocks } = fakeNotifications();
    const ok = await scheduleBookingReminder(
      n,
      { id: 'b1', starts_at: '2026-10-21T20:00:00Z' },
      text,
      now,
    );
    expect(ok).toBe(true);
    expect(mocks.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: reminderId('b1'),
      content: { title: 't', body: 'b', data: { booking_id: 'b1' } },
      trigger: { type: 'date', date: new Date('2026-10-21T19:00:00Z') },
    });
  });

  it('does not schedule without permission', async () => {
    const { n, mocks } = fakeNotifications({ granted: false, canAskAgain: true });
    const ok = await scheduleBookingReminder(
      n,
      { id: 'b1', starts_at: '2026-10-21T20:00:00Z' },
      text,
      now,
    );
    expect(ok).toBe(false);
    expect(mocks.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('asks for permission only when the system still allows it', async () => {
    const denied = fakeNotifications({ granted: false, canAskAgain: false });
    expect(await ensurePermission(denied.n)).toBe(false);
    expect(denied.mocks.requestPermissionsAsync).not.toHaveBeenCalled();
    const ask = fakeNotifications({ granted: false, canAskAgain: true });
    expect(await ensurePermission(ask.n)).toBe(true);
  });

  it('cancels only booking reminders', async () => {
    const { n, scheduled } = fakeNotifications();
    scheduled.set(reminderId('b1'), {});
    scheduled.set('other', {});
    await cancelAllBookingReminders(n);
    expect([...scheduled.keys()]).toEqual(['other']);
  });
});
