// Local booking reminders: one notification 1 hour before each booking (decision #254).
// Scheduled on the device with expo-notifications; push from the server comes with its own
// contract. The notifications module is injected so the logic is testable without a device.
import * as ExpoNotifications from 'expo-notifications';

import type { Schema } from '@app/contracts';

export const REMINDER_LEAD_MS = 60 * 60 * 1000;

export type NotificationsModule = Pick<
  typeof ExpoNotifications,
  | 'getPermissionsAsync'
  | 'requestPermissionsAsync'
  | 'scheduleNotificationAsync'
  | 'cancelScheduledNotificationAsync'
  | 'getAllScheduledNotificationsAsync'
>;

type BookingForReminder = Pick<Schema<'Booking'>, 'id' | 'starts_at'>;

export interface ReminderText {
  title: string;
  body: string;
}

/** When the reminder fires, or null when that moment already passed. */
export function reminderDate(startsAt: string, now: Date = new Date()): Date | null {
  const at = new Date(new Date(startsAt).getTime() - REMINDER_LEAD_MS);
  return at.getTime() > now.getTime() ? at : null;
}

export function reminderId(bookingId: string): string {
  return `booking-reminder-${bookingId}`;
}

const REMINDER_PREFIX = 'booking-reminder-';

/** Asks for permission only if it was not decided yet. Returns whether we can notify. */
export async function ensurePermission(n: NotificationsModule): Promise<boolean> {
  const current = await n.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await n.requestPermissionsAsync();
  return asked.granted;
}

/** Schedules (or replaces) the reminder of one booking. Returns false when nothing was set. */
export async function scheduleBookingReminder(
  n: NotificationsModule,
  booking: BookingForReminder,
  text: ReminderText,
  now: Date = new Date(),
): Promise<boolean> {
  const date = reminderDate(booking.starts_at, now);
  const identifier = reminderId(booking.id);
  await n.cancelScheduledNotificationAsync(identifier);
  if (!date) return false;
  const { granted } = await n.getPermissionsAsync();
  if (!granted) return false;
  await n.scheduleNotificationAsync({
    identifier,
    content: { title: text.title, body: text.body, data: { booking_id: booking.id } },
    trigger: { type: ExpoNotifications.SchedulableTriggerInputTypes.DATE, date },
  });
  return true;
}

export async function cancelBookingReminder(
  n: NotificationsModule,
  bookingId: string,
): Promise<void> {
  await n.cancelScheduledNotificationAsync(reminderId(bookingId));
}

/** Removes every pending booking reminder (reminders turned off, or the account is deleted). */
export async function cancelAllBookingReminders(n: NotificationsModule): Promise<void> {
  const scheduled = await n.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((s) => s.identifier.startsWith(REMINDER_PREFIX))
      .map((s) => n.cancelScheduledNotificationAsync(s.identifier)),
  );
}

export const deviceNotifications: NotificationsModule = ExpoNotifications;
