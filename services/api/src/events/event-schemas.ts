// Every event JSON schema of packages/contracts/events (section 11). JSON imports are bundled
// by tsup, so the built API does not read the contracts package from disk.
// The validator test fails if an event type of EVENT_TYPES has no schema here.
import bookingCancelled from '@app/contracts/events/booking.cancelled.schema.json';
import bookingConfirmed from '@app/contracts/events/booking.confirmed.schema.json';
import clipCreated from '@app/contracts/events/clip.created.schema.json';
import common from '@app/contracts/events/common.schema.json';
import deviceOffline from '@app/contracts/events/device.offline.schema.json';
import matchProcessed from '@app/contracts/events/match.processed.schema.json';
import matchPublished from '@app/contracts/events/match.published.schema.json';
import matchRecorded from '@app/contracts/events/match.recorded.schema.json';
import matchRecordingStarted from '@app/contracts/events/match.recording_started.schema.json';
import matchScoreCorrected from '@app/contracts/events/match.score_corrected.schema.json';
import paymentApproved from '@app/contracts/events/payment.approved.schema.json';
import paymentRefunded from '@app/contracts/events/payment.refunded.schema.json';
import settlementReady from '@app/contracts/events/settlement.ready.schema.json';

/** Shared definitions referenced by every event schema. */
export const COMMON_SCHEMA: object = common;

/** One schema per event type. */
export const EVENT_SCHEMAS: readonly object[] = [
  bookingCancelled,
  bookingConfirmed,
  clipCreated,
  deviceOffline,
  matchProcessed,
  matchPublished,
  matchRecorded,
  matchRecordingStarted,
  matchScoreCorrected,
  paymentApproved,
  paymentRefunded,
  settlementReady,
];
