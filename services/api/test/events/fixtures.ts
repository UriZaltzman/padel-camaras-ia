import type { EventOf } from '@app/contracts';

/** A valid `booking.confirmed` (the schema's example), with a chosen event_id. */
export function bookingConfirmed(
  eventId = '0192a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b',
): EventOf<'booking.confirmed'> {
  return {
    event_id: eventId,
    event_type: 'booking.confirmed',
    occurred_at: '2026-10-20T23:30:00Z',
    schema_version: 1,
    payload: {
      booking_id: '0192bf6e-7c1a-7d4e-9b3a-2f6c8e1d4a51',
      club_id: '0192cf6e-7c1a-7d4e-9b3a-2f6c8e1d4a52',
      court_id: '0192df6e-7c1a-7d4e-9b3a-2f6c8e1d4a53',
      organizer_user_id: '0192ef6e-7c1a-7d4e-9b3a-2f6c8e1d4a54',
      status: 'confirmed',
      starts_at: '2026-10-20T22:00:00Z',
      ends_at: '2026-10-20T23:30:00Z',
      payment_id: '0192ff6e-7c1a-7d4e-9b3a-2f6c8e1d4a55',
    },
  };
}
