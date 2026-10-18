/**
 * Generated from packages/contracts/events/*.schema.json by `pnpm contracts:generate`.
 * Do not edit: change the event schemas and regenerate.
 */

export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    /**
     * Format: uuid
     * @description UUID v7, lowercase. Same as `Uuid` in openapi.yaml.
     */
    Uuid: string;
    /**
     * Format: date-time
     * @description RFC 3339 timestamp in UTC (ends in `Z`). Same as `Timestamp` in openapi.yaml.
     */
    Timestamp: string;
    /** @description Amount in ARS cents. Never decimals. Same as `AmountCents` in openapi.yaml. */
    AmountCents: number;
    /** @description Version of the event schema. A breaking payload change bumps it. */
    SchemaVersion: number;
    /**
     * @description `MatchStatus` of openapi.yaml.
     * @enum {string}
     */
    MatchStatus:
      | 'scheduled'
      | 'recording'
      | 'recorded'
      | 'processing'
      | 'published'
      | 'needs_review'
      | 'archived'
      | 'failed'
      | 'cancelled';
    /**
     * @description `BookingStatus` of openapi.yaml.
     * @enum {string}
     */
    BookingStatus: 'held' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'expired';
    /**
     * @description `ProcessingJobStatus` of openapi.yaml.
     * @enum {string}
     */
    ProcessingJobStatus: 'queued' | 'running' | 'succeeded' | 'failed';
    /**
     * @description `PaymentStatus` of openapi.yaml.
     * @enum {string}
     */
    PaymentStatus: 'pending' | 'approved' | 'rejected' | 'refunded';
    /**
     * @description `SettlementStatus` of openapi.yaml.
     * @enum {string}
     */
    SettlementStatus: 'draft' | 'approved' | 'invoiced' | 'paid';
    /**
     * BookingCancelledEvent
     * @description `booking.cancelled`: A confirmed booking moved `confirmed` -> `cancelled`.
     */
    BookingCancelledEvent: {
      event_id: components['schemas']['Uuid'];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      event_type: 'booking.cancelled';
      occurred_at: components['schemas']['Timestamp'];
      /** @constant */
      schema_version: 1;
      /** BookingCancelledPayload */
      payload: {
        booking_id: components['schemas']['Uuid'];
        club_id: components['schemas']['Uuid'];
        court_id: components['schemas']['Uuid'];
        /** @constant */
        status: 'cancelled';
        /** @description Null when the system cancelled it. */
        cancelled_by_user_id: components['schemas']['Uuid'] | null;
        starts_at: components['schemas']['Timestamp'];
        /** @description Whether the cancellation policy returns the deposit. */
        refund_due: boolean;
      };
    };
    /**
     * BookingConfirmedEvent
     * @description `booking.confirmed`: A held booking was paid (or confirmed by the club) and moved `held` -> `confirmed`.
     */
    BookingConfirmedEvent: {
      event_id: components['schemas']['Uuid'];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      event_type: 'booking.confirmed';
      occurred_at: components['schemas']['Timestamp'];
      /** @constant */
      schema_version: 1;
      /** BookingConfirmedPayload */
      payload: {
        booking_id: components['schemas']['Uuid'];
        club_id: components['schemas']['Uuid'];
        court_id: components['schemas']['Uuid'];
        organizer_user_id: components['schemas']['Uuid'];
        /** @constant */
        status: 'confirmed';
        starts_at: components['schemas']['Timestamp'];
        ends_at: components['schemas']['Timestamp'];
        /** @description Deposit payment; null when the club loaded the booking by hand. */
        payment_id: components['schemas']['Uuid'] | null;
      };
    };
    /**
     * ClipCreatedEvent
     * @description `clip.created`: A clip was cut from a match video (tap in the app, button on court or automatic highlight).
     */
    ClipCreatedEvent: {
      event_id: components['schemas']['Uuid'];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      event_type: 'clip.created';
      occurred_at: components['schemas']['Timestamp'];
      /** @constant */
      schema_version: 1;
      /** ClipCreatedPayload */
      payload: {
        clip_id: components['schemas']['Uuid'];
        match_id: components['schemas']['Uuid'];
        club_id: components['schemas']['Uuid'];
        /** @description Null for automatic highlights. */
        created_by_user_id: components['schemas']['Uuid'] | null;
        /**
         * ClipSource
         * @enum {string}
         */
        source: 'app_tap' | 'court_button' | 'auto_highlight';
        start_ms: number;
        end_ms: number;
      };
    };
    /**
     * DeviceOfflineEvent
     * @description `device.offline`: A club device stopped sending heartbeats.
     */
    DeviceOfflineEvent: {
      event_id: components['schemas']['Uuid'];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      event_type: 'device.offline';
      occurred_at: components['schemas']['Timestamp'];
      /** @constant */
      schema_version: 1;
      /** DeviceOfflinePayload */
      payload: {
        device_id: components['schemas']['Uuid'];
        club_id: components['schemas']['Uuid'];
        last_heartbeat_at: components['schemas']['Timestamp'];
        offline_since: components['schemas']['Timestamp'];
      };
    };
    /**
     * MatchProcessedEvent
     * @description `match.processed`: The analysis job of a match finished, successfully or not. The match leaves `processing` for `published` or `failed`.
     */
    MatchProcessedEvent: {
      event_id: components['schemas']['Uuid'];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      event_type: 'match.processed';
      occurred_at: components['schemas']['Timestamp'];
      /** @constant */
      schema_version: 1;
      /** MatchProcessedPayload */
      payload: {
        match_id: components['schemas']['Uuid'];
        club_id: components['schemas']['Uuid'];
        processing_job_id: components['schemas']['Uuid'];
        /**
         * ProcessingJobOutcome
         * @description Final `ProcessingJobStatus` of the job.
         * @enum {string}
         */
        job_status: 'succeeded' | 'failed';
        /**
         * MatchProcessedStatus
         * @description `MatchStatus` the match moved to from `processing`.
         * @enum {string}
         */
        match_status: 'published' | 'failed';
        /** @description Null when the job succeeded. */
        failure_reason: string | null;
      };
    };
    /**
     * MatchPublishedEvent
     * @description `match.published`: Video, score and stats are visible to the players: the match is `published` (after processing or after a review).
     */
    MatchPublishedEvent: {
      event_id: components['schemas']['Uuid'];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      event_type: 'match.published';
      occurred_at: components['schemas']['Timestamp'];
      /** @constant */
      schema_version: 1;
      /** MatchPublishedPayload */
      payload: {
        match_id: components['schemas']['Uuid'];
        club_id: components['schemas']['Uuid'];
        /** @constant */
        status: 'published';
        /** @description Players already linked to the match, to notify. */
        player_user_ids: components['schemas']['Uuid'][];
      };
    };
    /**
     * MatchRecordedEvent
     * @description `match.recorded`: Recording ended and the video was uploaded: `recording` -> `recorded`.
     */
    MatchRecordedEvent: {
      event_id: components['schemas']['Uuid'];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      event_type: 'match.recorded';
      occurred_at: components['schemas']['Timestamp'];
      /** @constant */
      schema_version: 1;
      /** MatchRecordedPayload */
      payload: {
        match_id: components['schemas']['Uuid'];
        club_id: components['schemas']['Uuid'];
        court_id: components['schemas']['Uuid'];
        device_id: components['schemas']['Uuid'];
        /** @constant */
        status: 'recorded';
        started_at: components['schemas']['Timestamp'];
        ended_at: components['schemas']['Timestamp'];
        duration_seconds: number;
      };
    };
    /**
     * MatchRecordingStartedEvent
     * @description `match.recording_started`: The club device started recording: `scheduled` -> `recording`.
     */
    MatchRecordingStartedEvent: {
      event_id: components['schemas']['Uuid'];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      event_type: 'match.recording_started';
      occurred_at: components['schemas']['Timestamp'];
      /** @constant */
      schema_version: 1;
      /** MatchRecordingStartedPayload */
      payload: {
        match_id: components['schemas']['Uuid'];
        club_id: components['schemas']['Uuid'];
        court_id: components['schemas']['Uuid'];
        device_id: components['schemas']['Uuid'];
        booking_id: components['schemas']['Uuid'] | null;
        /** @constant */
        status: 'recording';
        started_at: components['schemas']['Timestamp'];
      };
    };
    /**
     * MatchScoreCorrectedEvent
     * @description `match.score_corrected`: A player corrected the score: `published` -> `needs_review`.
     */
    MatchScoreCorrectedEvent: {
      event_id: components['schemas']['Uuid'];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      event_type: 'match.score_corrected';
      occurred_at: components['schemas']['Timestamp'];
      /** @constant */
      schema_version: 1;
      /** MatchScoreCorrectedPayload */
      payload: {
        match_id: components['schemas']['Uuid'];
        club_id: components['schemas']['Uuid'];
        corrected_by_user_id: components['schemas']['Uuid'];
        /** @constant */
        status: 'needs_review';
        /** @description Corrected games per set. */
        sets: {
          team_1: number;
          team_2: number;
        }[];
      };
    };
    /**
     * PaymentApprovedEvent
     * @description `payment.approved`: The Mercado Pago webhook approved a payment: `pending` -> `approved`.
     */
    PaymentApprovedEvent: {
      event_id: components['schemas']['Uuid'];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      event_type: 'payment.approved';
      occurred_at: components['schemas']['Timestamp'];
      /** @constant */
      schema_version: 1;
      /** PaymentApprovedPayload */
      payload: {
        payment_id: components['schemas']['Uuid'];
        user_id: components['schemas']['Uuid'];
        club_id: components['schemas']['Uuid'] | null;
        booking_id: components['schemas']['Uuid'] | null;
        /** @constant */
        status: 'approved';
        amount_cents: components['schemas']['AmountCents'];
        /** @constant */
        currency: 'ARS';
        /** @description Mercado Pago payment id. */
        provider_payment_id: string;
      };
    };
    /**
     * PaymentRefundedEvent
     * @description `payment.refunded`: An approved payment was refunded: `approved` -> `refunded`.
     */
    PaymentRefundedEvent: {
      event_id: components['schemas']['Uuid'];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      event_type: 'payment.refunded';
      occurred_at: components['schemas']['Timestamp'];
      /** @constant */
      schema_version: 1;
      /** PaymentRefundedPayload */
      payload: {
        payment_id: components['schemas']['Uuid'];
        user_id: components['schemas']['Uuid'];
        booking_id: components['schemas']['Uuid'] | null;
        /** @constant */
        status: 'refunded';
        amount_cents: components['schemas']['AmountCents'];
        /** @constant */
        currency: 'ARS';
        provider_payment_id: string;
      };
    };
    /**
     * SettlementReadyEvent
     * @description `settlement.ready`: The monthly settlement of a club was drafted (1st of the month) and awaits approval: status `draft`.
     */
    SettlementReadyEvent: {
      event_id: components['schemas']['Uuid'];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      event_type: 'settlement.ready';
      occurred_at: components['schemas']['Timestamp'];
      /** @constant */
      schema_version: 1;
      /** SettlementReadyPayload */
      payload: {
        settlement_id: components['schemas']['Uuid'];
        club_id: components['schemas']['Uuid'];
        /** @description Settled month, `YYYY-MM`. */
        period: string;
        /** @constant */
        status: 'draft';
        gross_cents: components['schemas']['AmountCents'];
        platform_fee_cents: components['schemas']['AmountCents'];
        net_cents: components['schemas']['AmountCents'];
      };
    };
    /**
     * @description Name of a domain event (section 11).
     * @enum {string}
     */
    EventType:
      | 'booking.cancelled'
      | 'booking.confirmed'
      | 'clip.created'
      | 'device.offline'
      | 'match.processed'
      | 'match.published'
      | 'match.recorded'
      | 'match.recording_started'
      | 'match.score_corrected'
      | 'payment.approved'
      | 'payment.refunded'
      | 'settlement.ready';
    /** @description Any domain event, discriminated by `event_type`. */
    DomainEvent:
      | components['schemas']['BookingCancelledEvent']
      | components['schemas']['BookingConfirmedEvent']
      | components['schemas']['ClipCreatedEvent']
      | components['schemas']['DeviceOfflineEvent']
      | components['schemas']['MatchProcessedEvent']
      | components['schemas']['MatchPublishedEvent']
      | components['schemas']['MatchRecordedEvent']
      | components['schemas']['MatchRecordingStartedEvent']
      | components['schemas']['MatchScoreCorrectedEvent']
      | components['schemas']['PaymentApprovedEvent']
      | components['schemas']['PaymentRefundedEvent']
      | components['schemas']['SettlementReadyEvent'];
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type Uuid = components['schemas']['Uuid'];
export type Timestamp = components['schemas']['Timestamp'];
export type AmountCents = components['schemas']['AmountCents'];
export type SchemaVersion = components['schemas']['SchemaVersion'];
export type MatchStatus = components['schemas']['MatchStatus'];
export type BookingStatus = components['schemas']['BookingStatus'];
export type ProcessingJobStatus = components['schemas']['ProcessingJobStatus'];
export type PaymentStatus = components['schemas']['PaymentStatus'];
export type SettlementStatus = components['schemas']['SettlementStatus'];
export type BookingCancelledEvent = components['schemas']['BookingCancelledEvent'];
export type BookingConfirmedEvent = components['schemas']['BookingConfirmedEvent'];
export type ClipCreatedEvent = components['schemas']['ClipCreatedEvent'];
export type DeviceOfflineEvent = components['schemas']['DeviceOfflineEvent'];
export type MatchProcessedEvent = components['schemas']['MatchProcessedEvent'];
export type MatchPublishedEvent = components['schemas']['MatchPublishedEvent'];
export type MatchRecordedEvent = components['schemas']['MatchRecordedEvent'];
export type MatchRecordingStartedEvent = components['schemas']['MatchRecordingStartedEvent'];
export type MatchScoreCorrectedEvent = components['schemas']['MatchScoreCorrectedEvent'];
export type PaymentApprovedEvent = components['schemas']['PaymentApprovedEvent'];
export type PaymentRefundedEvent = components['schemas']['PaymentRefundedEvent'];
export type SettlementReadyEvent = components['schemas']['SettlementReadyEvent'];
export type EventType = components['schemas']['EventType'];
export type DomainEvent = components['schemas']['DomainEvent'];
export type $defs = Record<string, never>;
export type operations = Record<string, never>;

/** Every domain event name, in the order of events/. */
export const EVENT_TYPES = [
  'booking.cancelled',
  'booking.confirmed',
  'clip.created',
  'device.offline',
  'match.processed',
  'match.published',
  'match.recorded',
  'match.recording_started',
  'match.score_corrected',
  'payment.approved',
  'payment.refunded',
  'settlement.ready',
] as const satisfies readonly EventType[];
