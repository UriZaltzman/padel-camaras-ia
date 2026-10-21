/**
 * Generated from packages/contracts/openapi/openapi.yaml by `pnpm contracts:generate`.
 * Do not edit: change the contract and regenerate.
 */

export interface paths {
  '/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Liveness probe
     * @description The process is up and serving. It does not check the database or Redis yet. No
     *     credentials needed.
     */
    get: operations['getHealth'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/otp/whatsapp': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Send a sign-in code by WhatsApp
     * @description Sends a 6-digit code to the phone by WhatsApp. The code is valid for 5 minutes and allows
     *     5 attempts. Asking again replaces the previous code. The response is the same whether or
     *     not the phone has an account, so it does not reveal who is registered.
     */
    post: operations['requestWhatsappOtp'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/otp/verify': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Sign in with the WhatsApp code
     * @description Checks the code and returns a session. If the phone has no account yet, one is created;
     *     `consent` is then required, otherwise the answer is `403 TERMS_NOT_ACCEPTED` and the
     *     code stays valid so the app can retry with consent. For existing accounts `consent` is
     *     ignored.
     *
     *     Errors: `OTP_INVALID` (with `attempts_remaining`), `OTP_EXPIRED`,
     *     `OTP_ATTEMPTS_EXCEEDED`, `TERMS_NOT_ACCEPTED`.
     */
    post: operations['verifyWhatsappOtp'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/oauth/google': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Sign in with Google
     * @description Exchanges a Google ID token (obtained by the app or web with the Google SDK) for a
     *     session. The server verifies signature, audience and expiry. A new account needs
     *     `consent`, as in `verifyWhatsappOtp`.
     */
    post: operations['signInWithGoogle'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/oauth/apple': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Sign in with Apple
     * @description Exchanges an Apple identity token for a session. Apple sends the user's name only on the
     *     first authorization, so the app forwards it in `full_name` that time. A new account needs
     *     `consent`, as in `verifyWhatsappOtp`.
     */
    post: operations['signInWithApple'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/refresh': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Renew the session
     * @description Exchanges a refresh token (valid 30 days) for a new access token (15 minutes) and a new
     *     refresh token. The old refresh token is revoked on use; presenting it again returns
     *     `REFRESH_TOKEN_INVALID` and revokes the whole token family (reuse detection).
     */
    post: operations['refreshSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/me': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get the signed-in user's profile
     * @description The full own profile, including the consents and the training preference.
     */
    get: operations['getMe'];
    put?: never;
    post?: never;
    /**
     * Delete the signed-in user's account
     * @description Revokes every session at once and schedules the deletion of the profile, stats and own
     *     clips within 30 days (Ley 25.326). Full match videos are deleted after 30 days anyway.
     *     Idempotent: calling it again returns the same scheduled date.
     */
    delete: operations['deleteMe'];
    options?: never;
    head?: never;
    /**
     * Update the signed-in user's profile and preferences
     * @description Partial update: only the fields present change; `null` clears an optional field. Phone
     *     and email are not editable here (they come from the sign-in identities).
     *     `training_opt_out: true` excludes the user's videos from AI training (section 12).
     */
    patch: operations['updateMe'];
    trace?: never;
  };
  '/me/matches': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List the signed-in user's matches
     * @description Matches where the user is a confirmed player, newest first.
     */
    get: operations['listMyMatches'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/me/stats': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get the signed-in user's aggregate stats
     * @description Totals over the user's published matches. Lessons do not count.
     */
    get: operations['getMyStats'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/clubs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List clubs
     * @description Active clubs on the platform, ordered by name. Public: no credentials needed, so the web
     *     and the app can show clubs before sign-in. Returns no personal data and no private
     *     settings (CUIT, Mercado Pago account, contract terms).
     */
    get: operations['listClubs'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/clubs/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get a club with its courts, booking rules and charge settings
     * @description Public detail of a club: courts with their booking rules (days, hours, durations,
     *     prices, deposit, cancellation) and the charge settings players need to know (whether
     *     there is a per-match extra and its price). No credentials needed. A club that is not
     *     active returns `404 NOT_FOUND`.
     */
    get: operations['getClub'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/clubs/{id}/settings': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Update the club's booking rules and charge settings (owner only)
     * @description **Only the club owner** (an active `memberships` row with `role = owner` in this club,
     *     section 12) may call it. Staff, coaches and players of the club get `403 FORBIDDEN`; a
     *     user with no membership in the club gets `404 NOT_FOUND`, so the endpoint does not
     *     reveal which clubs exist behind it. Every change is written to `audit_log`.
     *
     *     Partial update at the top level: `charges` and each listed court's `booking` replace
     *     the current value as a whole; courts not listed keep their rules. Changes apply to
     *     bookings created afterwards, never to existing ones. The plan (`loan` or `purchase`)
     *     is part of the contract with us and is read-only here.
     *
     *     Errors: `VALIDATION_FAILED` with `details.issues`, both for schema errors and for fields
     *     valid one by one but not together (overlapping rules, price bands with gaps or a missing
     *     allowed duration, an enabled extra without a price, a monthly coach plan without a fee);
     *     `NOT_FOUND` (club, or a `court_id` of another club); `FORBIDDEN` (not the owner).
     */
    patch: operations['updateClubSettings'];
    trace?: never;
  };
  '/courts/{id}/availability': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Free start times of a court for one day and duration
     * @description Generates every possible start of the given `date` (local day in the club's time zone)
     *     from the court's booking rules: the rule for that weekday, `opens_at`, `closes_at`,
     *     `start_interval_minutes` and `allowed_durations`. A booking must end by `closes_at`.
     *     Starts that overlap a `held` or `confirmed` booking are dropped, as are starts already in
     *     the past. Each slot carries its price (from the price band where it starts) and its
     *     deposit, both in cents.
     *
     *     Public: no credentials needed, and the answer has no personal data (it never says who
     *     booked). Served in under 300 ms from a 30-second cache per court, so a slot shown here
     *     can still be taken: `POST /bookings` is the only source of truth and answers
     *     `BOOKING_SLOT_TAKEN` in that case.
     *
     *     A court that is not `active`, has no rule for that weekday or does not allow that
     *     duration returns `200` with an empty `slots` list. An unknown court returns `404`.
     */
    get: operations['getCourtAvailability'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/bookings': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Hold a slot (creates a `held` booking)
     * @description Creates the booking in `held` status with `hold_expires_at` 10 minutes ahead, inside a
     *     transaction. The caller takes position 1. The PostgreSQL exclusion constraint on
     *     `(court_id, [starts_at, ends_at))` over `held` and `confirmed` bookings lets only one of
     *     two concurrent requests through; the other gets `409 BOOKING_SLOT_TAKEN` with the
     *     `court_id` and `starts_at` in `details`.
     *
     *     - **Deposit.** If the court asks for a deposit, `deposit_cents` is above 0 and the client
     *       opens the Mercado Pago checkout (`POST /payments/checkout`, Payments module). The
     *       approved webhook moves the booking to `confirmed`. If the hold is not paid in 10
     *       minutes, a job moves it to `expired` and the slot is free again. With no deposit the
     *       booking moves to `confirmed` in the same request, so the response already says
     *       `confirmed` and `hold_expires_at` is `null`.
     *     - **Fixed weekly booking.** With `recurrence`, the slot is stored as a weekly rule and the
     *       bookings of the next 8 weeks are generated (renewed every week, section 9). The first
     *       occurrence follows the normal hold and deposit flow. The other occurrences are created
     *       when the first one is confirmed, and confirmed without a deposit of their own; weeks
     *       whose slot is already taken are skipped and listed in `series.skipped_starts`, and never
     *       fail the request. Only a conflict on the first occurrence returns `BOOKING_SLOT_TAKEN`.
     *     - **Minors (section 12).** A turn with a player under 18 (by `birth_date` on the day of
     *       the booking) is not recorded unless a parent or guardian permission is loaded in the
     *       booking (`guardian_consent` here for the caller, or on `accept` for an invited player).
     *       The booking is still created: it gets `no_record: true` with `no_record_reason:
     *       minor_without_guardian`, and recording is enabled again once every minor has a
     *       permission on file. `no_record: true` in the request marks the turn as "do not record"
     *       on purpose.
     *
     *     Errors: `BOOKING_SLOT_TAKEN` (409); `BOOKING_SLOT_INVALID` (422, the slot breaks the court
     *     rules, the court is not `active` or the start is in the past); `NOT_FOUND` (court);
     *     `TERMS_NOT_ACCEPTED` and `CLUB_SERVICE_SUSPENDED` (403); `VALIDATION_FAILED` (400).
     */
    post: operations['createBooking'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/bookings/{id}/invite': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create an invite link for a free position
     * @description **Only the player in position 1** (who booked) may call it; other players get
     *     `403 FORBIDDEN` and users outside the booking get `404 NOT_FOUND`. Returns a single-use
     *     link the app shares by WhatsApp. The link is valid until the booking starts; asking again
     *     for the same position replaces the previous link.
     *
     *     Errors: `BOOKING_FULL` (409, positions 2 to 4 are taken, or the requested one is);
     *     `BOOKING_INVITE_INVALID` (422, the booking is not `held` or `confirmed`).
     */
    post: operations['inviteToBooking'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/bookings/{id}/accept': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Accept an invite and join the booking
     * @description The signed-in user takes the invite's position. This links the user to the match that is
     *     recorded for the booking. Idempotent: accepting again when the user is already a player
     *     returns `200` with the booking unchanged.
     *
     *     **Minors (section 12).** If the user is under 18 on the day of the booking, send
     *     `guardian_consent`. Without it the user still joins, but the booking becomes
     *     `no_record: true` (`minor_without_guardian`) until a permission is on file for every
     *     minor.
     *
     *     Errors: `BOOKING_INVITE_INVALID` (422, wrong, used or replaced token, or the booking is
     *     no longer `held` or `confirmed`); `BOOKING_FULL` (409); `TERMS_NOT_ACCEPTED` (403).
     */
    post: operations['acceptBookingInvite'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/bookings/{id}/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Cancel a confirmed booking, refunding the deposit if in time
     * @description The player in position 1 or the club's staff or owner may cancel; other players get
     *     `403 FORBIDDEN`. Moves the booking from `confirmed` to `cancelled` and frees the slot.
     *     A `held` booking cannot be cancelled (`409 INVALID_STATE_TRANSITION`): its hold simply
     *     expires.
     *
     *     **Refund.** If the cancellation happens at least `cancellation_refund_hours` (copied from
     *     the court when the booking was made, 24 by default) before `starts_at`, the whole paid
     *     deposit is refunded through the Mercado Pago API: `refund_cents` equals
     *     `deposit_paid_cents` and `refund_status` is `pending` until the refund webhook arrives.
     *     Later cancellations keep the deposit (`refund_cents: 0`, `refund_status: none`), as does a
     *     `no_show`.
     *
     *     `scope: series` on an occurrence of a fixed weekly booking also cancels every later
     *     occurrence and stops renewing the rule; each occurrence gets its own refund decision and
     *     the response reports the one of the booking in the path.
     *
     *     Errors: `INVALID_STATE_TRANSITION` (409); `PAYMENT_PROVIDER_ERROR` (502, the booking is
     *     cancelled anyway and the refund is retried in the background).
     */
    post: operations['cancelBooking'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/club-admin/dashboard': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Today's view of the club (staff and owner)
     * @description Bookings and occupancy of the day (in the club's time zone), live status of every court
     *     and camera, and the club device health. Never includes personal stats (section 12).
     *
     *     `revenue` and `billing` are for the owner; they are `null` for staff.
     *
     *     Errors: `FORBIDDEN` (the caller is not staff or owner of the club), `NOT_FOUND`.
     */
    get: operations['getClubDashboard'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/club-admin/bookings': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List the club's bookings (staff and owner)
     * @description Bookings of the club between `from` and `to` (at most 31 days), ordered by start. Each
     *     carries the booker's name and phone so the front desk can reach them; no stats.
     */
    get: operations['listClubBookings'];
    put?: never;
    /**
     * Quick booking from the front desk (phone and turn)
     * @description For turns that still arrive by WhatsApp (section 9, step 7). The booking is created
     *     `confirmed` with `source: panel`, under the same exclusion constraint as
     *     `POST /bookings`. If the phone has no account, a pending account is created and the
     *     person gets a WhatsApp to activate it and accept the terms and privacy policy.
     *     `deposit: paid_at_club` records a deposit taken in cash or transfer at the desk.
     *     Accepts `recurrence` for fixed weekly turns, like `POST /bookings`.
     *
     *     Errors: `BOOKING_SLOT_TAKEN` (409), `BOOKING_SLOT_INVALID` (422), `FORBIDDEN`,
     *     `NOT_FOUND` (court), `VALIDATION_FAILED` (400).
     */
    post: operations['createClubBooking'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/club-admin/recording/{court}/stop': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Cut the recording of a court now (staff and owner)
     * @description Ends the current recording of the court before the turn ends (players left early). The
     *     match moves `recording` → `recorded` and the club device receives the stop over the
     *     court channel; `match.recorded` is emitted. Idempotent for 60 seconds: a second call for
     *     the same match returns the same result.
     *
     *     Errors: `RECORDING_NOT_ACTIVE` (409), `FORBIDDEN`, `NOT_FOUND`.
     */
    post: operations['stopCourtRecording'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/club-admin/settlements': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List the club's monthly settlements (owner only)
     * @description One settlement per month, newest first (section 10). The subscription line is priced by
     *     the tier of active players in the last 90 days (decision of 21/10/2026, #253), not by
     *     number of courts. Staff get `FORBIDDEN`.
     */
    get: operations['listClubSettlements'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    /**
     * Format: uuid
     * @description UUID v7.
     * @example 01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b
     */
    Uuid: string;
    /**
     * Format: date-time
     * @description RFC 3339 timestamp in UTC.
     * @example 2026-10-17T21:30:00Z
     */
    Timestamp: string;
    /**
     * @description Amount in ARS cents. Never decimals.
     * @example 1500000
     */
    AmountCents: number;
    /**
     * @description Status of a match (`matches.status`). Recording and analysis move it forward; a score
     *     correction sends it to `needs_review`, and after 30 days the full video is deleted and it
     *     is `archived`.
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
     * @description Status of a booking (`bookings.status`). A new booking is `held` for 10 minutes while the
     *     deposit is paid; if it is not paid in time it is `expired` and the slot is released.
     * @enum {string}
     */
    BookingStatus: 'held' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'expired';
    /**
     * @description Status of an analysis job (`processing_jobs.status`). The job also stores its pipeline
     *     stage, so it resumes from there after a power cut.
     * @enum {string}
     */
    ProcessingJobStatus: 'queued' | 'running' | 'succeeded' | 'failed';
    /**
     * @description Status of a payment (`payments.status`). Only the Mercado Pago webhook changes it, never
     *     the app.
     * @enum {string}
     */
    PaymentStatus: 'pending' | 'approved' | 'rejected' | 'refunded';
    /**
     * @description Status of a monthly settlement (`settlements.status`). It is drafted on the 1st of each
     *     month, approved by the team, invoiced and then paid.
     * @enum {string}
     */
    SettlementStatus: 'draft' | 'approved' | 'invoiced' | 'paid';
    /** @description Liveness result. */
    HealthStatus: {
      /** @enum {string} */
      status: 'ok';
    };
    /**
     * @description Phone in E.164 format, with country code (WhatsApp number).
     * @example +5491155550123
     */
    PhoneNumber: string;
    /**
     * @description Acceptance of the terms and the privacy policy (Ley 25.326), required to create an
     *     account. Sending it means the user accepted the given versions; the server stores the
     *     versions and the time.
     */
    SignUpConsent: {
      /** @description Version of the terms the user saw, e.g. `2026-10-01`. */
      terms_version: string;
      /** @description Version of the privacy policy the user saw. */
      privacy_version: string;
    };
    OtpRequest: {
      phone: components['schemas']['PhoneNumber'];
    };
    OtpChallenge: {
      /** @description Seconds until the code expires (300). */
      expires_in_seconds: number;
      /** @description Seconds before the app may ask for a new code. */
      resend_after_seconds: number;
    };
    OtpVerifyRequest: {
      phone: components['schemas']['PhoneNumber'];
      /** @description The 6-digit code received by WhatsApp. */
      code: string;
      consent?: components['schemas']['SignUpConsent'];
    };
    OAuthSignInRequest: {
      /** @description ID token issued by the provider to this app. */
      id_token: string;
      /** @description Raw nonce used when asking for the token, checked against its `nonce` claim. */
      nonce?: string;
      consent?: components['schemas']['SignUpConsent'];
    };
    AppleSignInRequest: components['schemas']['OAuthSignInRequest'] & {
      /** @description Name Apple sent on the first authorization only. */
      full_name?: string;
    };
    RefreshRequest: {
      refresh_token: string;
    };
    TokenPair: {
      /** @description JWT for the `Authorization` header. Valid for 15 minutes. */
      access_token: string;
      /** @description Opaque, single-use token valid for 30 days. Store it securely. */
      refresh_token: string;
      /** @enum {string} */
      token_type: 'Bearer';
      /** @description Seconds until the access token expires (900). */
      expires_in: number;
    };
    AuthSession: components['schemas']['TokenPair'] & {
      user: components['schemas']['User'];
      /** @description True when this request created the account. */
      is_new_user: boolean;
    };
    /**
     * @description Self-declared Argentine padel category, from 8va (`8`) to 1ra (`1`).
     * @enum {string}
     */
    DeclaredCategory: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
    /** @enum {string} */
    DominantHand: 'right' | 'left';
    /**
     * @description Preferred side of the court. `drive` is the right side, `reves` the left.
     * @enum {string}
     */
    PlayingSide: 'drive' | 'reves' | 'both';
    /** @description The signed-in user's own profile. Only the owner sees phone, email and birth date. */
    User: {
      id: components['schemas']['Uuid'];
      display_name: string;
      /** @description Verified WhatsApp phone in E.164, or `null` if the user signed in only with Google or Apple. */
      phone: string | null;
      /**
       * @description Email from Google or Apple, or `null`. Plain string on purpose (no `format: email`), so
       *     the Python models do not need `email-validator`.
       */
      email: string | null;
      /** Format: uri */
      photo_url: string | null;
      declared_category: components['schemas']['DeclaredCategory'] | null;
      dominant_hand: components['schemas']['DominantHand'] | null;
      playing_side: components['schemas']['PlayingSide'] | null;
      /**
       * Format: date
       * @description Used to apply the minors rule (no recording without a guardian's permission).
       */
      birth_date: string | null;
      /** @description True when the user asked that their videos not be used to train the AI. */
      training_opt_out: boolean;
      /** @description Version of the terms the user accepted. */
      terms_version: string;
      terms_accepted_at: components['schemas']['Timestamp'];
      /** @description Version of the privacy policy the user accepted. */
      privacy_version: string;
      created_at: components['schemas']['Timestamp'];
    };
    /** @description Fields of `User` the owner may change. At least one is required. */
    UserUpdate: {
      display_name?: string;
      /** Format: uri */
      photo_url?: string | null;
      declared_category?: components['schemas']['DeclaredCategory'] | null;
      dominant_hand?: components['schemas']['DominantHand'] | null;
      playing_side?: components['schemas']['PlayingSide'] | null;
      /** Format: date */
      birth_date?: string | null;
      training_opt_out?: boolean;
    };
    AccountDeletion: {
      deletion_scheduled_for: components['schemas']['Timestamp'];
    };
    /** @description Id and display name of a related entity. */
    EntityRef: {
      id: components['schemas']['Uuid'];
      name: string;
    };
    /** @description Games won by each team in one set. */
    SetScore: {
      team_1: number;
      team_2: number;
    };
    /** @description A match in the user's list, seen from that user's side. */
    MatchSummary: {
      id: components['schemas']['Uuid'];
      /** @enum {string} */
      type: 'match' | 'lesson';
      status: components['schemas']['MatchStatus'];
      starts_at: components['schemas']['Timestamp'];
      ends_at: components['schemas']['Timestamp'];
      club: components['schemas']['EntityRef'];
      court: components['schemas']['EntityRef'];
      /**
       * @description The user's team, or `null` while not assigned.
       * @enum {integer|null}
       */
      team: 1 | 2 | null;
      /** @description Whether the user's team won, or `null` until the match is published. */
      won: boolean | null;
      /** @description Final score per set; empty until the match is published. */
      sets: components['schemas']['SetScore'][];
    };
    MatchSummaryPage: components['schemas']['Page'] & {
      items: components['schemas']['MatchSummary'][];
    };
    /** @description Aggregate stats over the user's published matches. */
    UserStats: {
      matches_played: number;
      matches_won: number;
      sets_won: number;
      sets_lost: number;
      points_won: number;
      points_played: number;
      /** @description Current level estimate, or `null` until enough matches are published. */
      rating: number | null;
      last_match_at: components['schemas']['Timestamp'] | null;
    };
    /**
     * @description How the club got the camera kit: `loan` (comodato, we keep ownership) or `purchase`.
     *     Set by the contract with us; read-only for the club.
     * @enum {string}
     */
    ClubPlan: 'loan' | 'purchase';
    /** @description A club in the public list. */
    ClubSummary: {
      id: components['schemas']['Uuid'];
      name: string;
      address: string;
      city: string;
      /** Format: uri */
      logo_url: string | null;
      courts_count: number;
    };
    ClubSummaryPage: components['schemas']['Page'] & {
      items: components['schemas']['ClubSummary'][];
    };
    /** @description Public detail of a club with its courts and settings. */
    Club: {
      id: components['schemas']['Uuid'];
      name: string;
      address: string;
      city: string;
      /**
       * @description IANA time zone of the club. Booking rule hours are local times in this zone.
       * @example America/Argentina/Buenos_Aires
       */
      timezone: string;
      /** Format: uri */
      logo_url: string | null;
      sponsor_name: string | null;
      plan: components['schemas']['ClubPlan'];
      courts: components['schemas']['Court'][];
      charges: components['schemas']['ChargeSettings'];
    };
    /**
     * @description `active` takes bookings; `maintenance` is temporarily closed (no new bookings);
     *     `inactive` is out of service.
     * @enum {string}
     */
    CourtStatus: 'active' | 'maintenance' | 'inactive';
    Court: {
      id: components['schemas']['Uuid'];
      name: string;
      /** @description True for an indoor (techada) court. */
      covered: boolean;
      status: components['schemas']['CourtStatus'];
      booking: components['schemas']['CourtBookingSettings'];
    };
    /** @enum {string} */
    Weekday: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
    /**
     * @description Local time `HH:MM` in the club's time zone. `24:00` is allowed as an end time and means
     *     midnight at the end of the day.
     * @example 18:00
     */
    LocalTime: string;
    /**
     * @description Allowed booking length in minutes.
     * @enum {integer}
     */
    BookingDuration: 60 | 90 | 120;
    DurationPrice: {
      duration_minutes: components['schemas']['BookingDuration'];
      amount_cents: components['schemas']['AmountCents'];
    };
    /**
     * @description Price of a booking that starts in `[starts_at, ends_at)`, for example peak hours from
     *     18:00 to 23:00. The bands of a rule must cover its opening hours without gaps or
     *     overlaps, and have a price for every allowed duration.
     */
    PriceBand: {
      starts_at: components['schemas']['LocalTime'];
      ends_at: components['schemas']['LocalTime'];
      prices: components['schemas']['DurationPrice'][];
    };
    /**
     * @description Opening hours of a court on some weekdays (`booking_slots_rules`). A booking must start
     *     on a step of `start_interval_minutes` from `opens_at` and end by `closes_at`. Rules of
     *     one court must not overlap on the same day.
     */
    BookingRule: {
      days: components['schemas']['Weekday'][];
      opens_at: components['schemas']['LocalTime'];
      closes_at: components['schemas']['LocalTime'];
      allowed_durations: components['schemas']['BookingDuration'][];
      /**
       * @description Every how many minutes a booking may start (30 by default).
       * @default 30
       * @enum {integer}
       */
      start_interval_minutes: 15 | 30 | 60;
      price_bands: components['schemas']['PriceBand'][];
    };
    /** @description No deposit; the booking is confirmed right away. */
    DepositNone: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: 'none';
    };
    /** @description Deposit as a percent of the booking price, rounded down to whole cents. */
    DepositPercent: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: 'percent';
      percent: number;
    };
    /** @description Fixed deposit amount in ARS cents, capped at the booking price. */
    DepositFixed: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: 'fixed';
      amount_cents: number;
    };
    /** @description Deposit asked to confirm a booking, paid with Mercado Pago (section 9). */
    Deposit:
      | components['schemas']['DepositNone']
      | components['schemas']['DepositPercent']
      | components['schemas']['DepositFixed'];
    /** @description Booking rules, deposit and cancellation policy of one court. */
    CourtBookingSettings: {
      /** @description Empty means the court takes no bookings from the app. */
      rules: components['schemas']['BookingRule'][];
      deposit: components['schemas']['Deposit'];
      /**
       * @description Cancelling at least this many hours before the start refunds the deposit (24 by
       *     default). Later cancellations and `no_show` keep it.
       * @default 24
       */
      cancellation_refund_hours: number;
    };
    /**
     * @description Per-match extra charged to each player to unlock the full analysis (`player_extra`
     *     payments). The money goes to the club's Mercado Pago account.
     */
    PlayerExtraSettings: {
      /** @description False means everything is free for players. */
      enabled: boolean;
      /** @description Price per player and match in ARS cents. Required when `enabled` is true. */
      amount_cents: number | null;
    };
    /**
     * @description Who pays for the coach tools: `included` in the club's subscription, or
     *     `coach_monthly`, a monthly fee each coach pays.
     */
    CoachPlan: {
      /** @enum {string} */
      type: 'included' | 'coach_monthly';
      /** @description Monthly fee per coach in ARS cents. Required when `type` is `coach_monthly`. */
      monthly_fee_cents?: number;
    };
    /** @description How the club charges players and coaches (section 10). */
    ChargeSettings: {
      player_extra: components['schemas']['PlayerExtraSettings'];
      coach_plan: components['schemas']['CoachPlan'];
      /** @description True lets the club's coaches charge their lessons in the app (`lesson` payments). */
      lesson_payments_enabled: boolean;
    };
    CourtSettingsUpdate: {
      court_id: components['schemas']['Uuid'];
      booking: components['schemas']['CourtBookingSettings'];
    };
    /** @description Settings the owner may change. At least one field is required. */
    ClubSettingsUpdate: {
      charges?: components['schemas']['ChargeSettings'];
      courts?: components['schemas']['CourtSettingsUpdate'][];
    };
    /** @description A free start time for the requested duration. */
    AvailabilitySlot: {
      starts_at: components['schemas']['Timestamp'];
      ends_at: components['schemas']['Timestamp'];
      amount_cents: components['schemas']['AmountCents'];
      deposit_cents: components['schemas']['AmountCents'];
    };
    CourtAvailability: {
      court_id: components['schemas']['Uuid'];
      /**
       * Format: date
       * @description Local day asked for, in the club's time zone.
       */
      date: string;
      /** @description IANA time zone of the club. */
      timezone: string;
      duration_minutes: components['schemas']['BookingDuration'];
      slots: components['schemas']['AvailabilitySlot'][];
    };
    /** @enum {string} */
    GuardianRelationship: 'mother' | 'father' | 'guardian';
    /**
     * @description Permission of a parent or legal guardian to record a minor's turn (section 12). Sending
     *     it means the guardian accepted the given version of the consent text; the server stores
     *     who, the version and the time. Only the club's staff and the player see it.
     */
    GuardianConsent: {
      guardian_name: string;
      guardian_phone: components['schemas']['PhoneNumber'];
      relationship: components['schemas']['GuardianRelationship'];
      /** @description Version of the consent text the guardian accepted, e.g. `2026-10-01`. */
      consent_version: string;
    };
    /** @description Fixed weekly turn on the same weekday and local time, generated 8 weeks ahead. */
    BookingRecurrence: {
      /** @enum {string} */
      frequency: 'weekly';
      /**
       * @description Weeks generated ahead, renewed every week (section 9).
       * @enum {integer}
       */
      weeks_ahead: 8;
    };
    BookingCreate: {
      court_id: components['schemas']['Uuid'];
      starts_at: components['schemas']['Timestamp'];
      duration_minutes: components['schemas']['BookingDuration'];
      recurrence?: components['schemas']['BookingRecurrence'];
      /**
       * @description True marks the turn as "do not record" on purpose.
       * @default false
       */
      no_record: boolean;
      guardian_consent?: components['schemas']['GuardianConsent'];
    };
    /**
     * @description Where the booking was made.
     * @enum {string}
     */
    BookingSource: 'app' | 'panel';
    /**
     * @description Why the turn will not be recorded: `requested` by the booker, a `club_school` marked by
     *     the club, or a `minor_without_guardian` (section 12).
     * @enum {string}
     */
    NoRecordReason: 'requested' | 'club_school' | 'minor_without_guardian';
    /** @description A position of the booking. Position 1 is who booked. */
    BookingPlayer: {
      position: number;
      /** @description The player, or `null` while the position is free or the invite is pending. */
      user: components['schemas']['EntityRef'] | null;
      accepted: boolean;
      /** @description True when a guardian permission is loaded for this player (minors only). */
      guardian_consent_on_file: boolean;
    };
    /** @description The fixed weekly rule an occurrence belongs to. */
    BookingSeries: {
      id: components['schemas']['Uuid'];
      /** @enum {integer} */
      weeks_ahead: 8;
      /** @description Starts of the next weeks not generated because the slot was taken. */
      skipped_starts: components['schemas']['Timestamp'][];
    };
    Booking: {
      id: components['schemas']['Uuid'];
      club_id: components['schemas']['Uuid'];
      court_id: components['schemas']['Uuid'];
      starts_at: components['schemas']['Timestamp'];
      ends_at: components['schemas']['Timestamp'];
      duration_minutes: components['schemas']['BookingDuration'];
      status: components['schemas']['BookingStatus'];
      /** @description When a `held` booking expires (10 minutes after creation); `null` otherwise. */
      hold_expires_at: components['schemas']['Timestamp'] | null;
      price_cents: components['schemas']['AmountCents'];
      deposit_cents: components['schemas']['AmountCents'];
      deposit_paid_cents: components['schemas']['AmountCents'];
      /** @description Court policy copied when the booking was created; later changes do not apply. */
      cancellation_refund_hours: number;
      source: components['schemas']['BookingSource'];
      players: components['schemas']['BookingPlayer'][];
      /** @description True means the club device will not record this turn. */
      no_record: boolean;
      no_record_reason: components['schemas']['NoRecordReason'] | null;
      series: components['schemas']['BookingSeries'] | null;
      created_at: components['schemas']['Timestamp'];
    };
    BookingInviteRequest: {
      /** @description Position to invite to. Omitted means the lowest free one. */
      position?: number;
    };
    BookingInvite: {
      booking_id: components['schemas']['Uuid'];
      position: number;
      /** @description Single-use invite token. */
      token: string;
      /**
       * Format: uri
       * @description Link to share by WhatsApp; opens the app or the web on the invite.
       */
      url: string;
      expires_at: components['schemas']['Timestamp'];
    };
    BookingAcceptRequest: {
      token: string;
      guardian_consent?: components['schemas']['GuardianConsent'];
    };
    /**
     * @description `series` also cancels the later occurrences of a fixed weekly booking.
     * @enum {string}
     */
    BookingCancelScope: 'this' | 'series';
    BookingCancelRequest: {
      scope?: components['schemas']['BookingCancelScope'];
    };
    /**
     * @description `none` when the deposit is kept or there was none; `pending` until Mercado Pago confirms
     *     the refund.
     * @enum {string}
     */
    RefundStatus: 'none' | 'pending';
    BookingCancellation: {
      booking_id: components['schemas']['Uuid'];
      status: components['schemas']['BookingStatus'];
      cancelled_at: components['schemas']['Timestamp'];
      refund_cents: components['schemas']['AmountCents'];
      refund_status: components['schemas']['RefundStatus'];
      /** @description Every booking cancelled by the request (more than one with `scope` `series`). */
      cancelled_booking_ids: components['schemas']['Uuid'][];
    };
    /**
     * @description `recording` (a turn is being recorded), `idle`, `camera_offline` (one or both cameras
     *     down) or `maintenance` (court not active).
     * @enum {string}
     */
    CourtLiveStatus: 'recording' | 'idle' | 'camera_offline' | 'maintenance';
    /**
     * @description End of the court where the camera is mounted (section 5).
     * @enum {string}
     */
    CameraEnd: 'A' | 'B';
    CameraState: {
      end: components['schemas']['CameraEnd'];
      online: boolean;
    };
    CourtLive: {
      court: components['schemas']['EntityRef'];
      status: components['schemas']['CourtLiveStatus'];
      cameras: components['schemas']['CameraState'][];
      current_match_id: components['schemas']['Uuid'] | null;
      /** @description Scheduled end of the current recording. */
      current_until: components['schemas']['Timestamp'] | null;
      next_booking_at: components['schemas']['Timestamp'] | null;
    };
    /** @description Last heartbeat of a club device (section 4, `health`). */
    DeviceHealthSummary: {
      device_id: components['schemas']['Uuid'];
      /** @description False when no heartbeat arrived in the last 3 minutes. */
      online: boolean;
      last_seen_at: components['schemas']['Timestamp'];
      disk_free_pct: number;
      gpu_temp_c: number | null;
      /** @description Estimated minutes to empty the upload queue. */
      upload_queue_minutes: number;
    };
    /**
     * @description Band of active players (distinct players with at least one recorded match in the club in
     *     the last 90 days) that sets the monthly subscription (decision of 21/10/2026, #253).
     *     Bands and prices live in the contract with the club; see `docs/pendientes.md`.
     */
    PricingTier: {
      name: string;
      min_active_players: number;
      /** @description `null` for the top band. */
      max_active_players: number | null;
    };
    /** @description Owner only. Where the club stands on its subscription this month. */
    ClubBillingSummary: {
      active_players_90d: number;
      tier: components['schemas']['PricingTier'];
      subscription_cents: components['schemas']['AmountCents'];
      /** @description Unpaid subscription; shown after 15 days, service cut at 30 (section 10). */
      debt_cents: components['schemas']['AmountCents'];
    };
    /** @description Owner only. Money of the day, in ARS cents. */
    ClubRevenueSummary: {
      bookings_cents: components['schemas']['AmountCents'];
      deposits_cents: components['schemas']['AmountCents'];
      player_extras_cents: components['schemas']['AmountCents'];
    };
    ClubDashboard: {
      club_id: components['schemas']['Uuid'];
      /** Format: date */
      date: string;
      bookings_count: number;
      /** @description Booked minutes over open minutes of every active court. */
      occupancy_pct: number;
      matches_published: number;
      matches_failed: number;
      courts: components['schemas']['CourtLive'][];
      devices: components['schemas']['DeviceHealthSummary'][];
      /** @description `null` for staff. */
      revenue: components['schemas']['ClubRevenueSummary'] | null;
      /** @description `null` for staff. */
      billing: components['schemas']['ClubBillingSummary'] | null;
    };
    /** @description Who booked, so the front desk can reach them. No stats. */
    ClubBookingContact: {
      user_id: components['schemas']['Uuid'];
      name: string | null;
      phone: components['schemas']['PhoneNumber'] | null;
      /** @description True when the account was created from the panel and not activated yet. */
      account_pending: boolean;
    };
    ClubBooking: components['schemas']['Booking'] & {
      court_name: string;
      booker: components['schemas']['ClubBookingContact'];
      /** @description The recorded match, once recording started. */
      match_id: components['schemas']['Uuid'] | null;
    };
    ClubBookingPage: components['schemas']['Page'] & {
      items: components['schemas']['ClubBooking'][];
    };
    ClubBookingCreate: {
      court_id: components['schemas']['Uuid'];
      starts_at: components['schemas']['Timestamp'];
      duration_minutes: components['schemas']['BookingDuration'];
      phone: components['schemas']['PhoneNumber'];
      /** @description Name for a new pending account. Ignored if the phone has an account. */
      name?: string;
      /**
       * @description `none` or `paid_at_club` (cash or transfer at the desk). Defaults to `none`.
       * @enum {string}
       */
      deposit?: 'none' | 'paid_at_club';
      recurrence?: components['schemas']['BookingRecurrence'];
      /** @description Marks the turn "do not record" (for example an escuelita). */
      no_record?: boolean;
    };
    RecordingStop: {
      court_id: components['schemas']['Uuid'];
      match_id: components['schemas']['Uuid'];
      match_status: components['schemas']['MatchStatus'];
      stopped_at: components['schemas']['Timestamp'];
    };
    SettlementSubscription: {
      /** @description Active players at the close of the period. */
      active_players_90d: number;
      tier: components['schemas']['PricingTier'];
      amount_cents: components['schemas']['AmountCents'];
    };
    /**
     * @description Monthly summary of a club (section 10). All amounts in ARS cents.
     *     `net_payable_by_club_cents` = subscription + commissions − `collected_by_platform_cents`
     *     (money we collected because the club had not connected its Mercado Pago account, which
     *     we owe the club), floored at 0; when we owe more than the club does, we transfer the
     *     difference to the club.
     */
    Settlement: {
      id: components['schemas']['Uuid'];
      /** @description Month, `YYYY-MM`. */
      period: string;
      status: components['schemas']['SettlementStatus'];
      subscription: components['schemas']['SettlementSubscription'];
      player_payments_cents: components['schemas']['AmountCents'];
      lesson_payments_cents: components['schemas']['AmountCents'];
      deposits_cents: components['schemas']['AmountCents'];
      commissions_cents: components['schemas']['AmountCents'];
      collected_by_platform_cents: components['schemas']['AmountCents'];
      net_payable_by_club_cents: components['schemas']['AmountCents'];
      /** @description ARCA invoice number, once `invoiced`. */
      invoice_number: string | null;
      created_at: components['schemas']['Timestamp'];
    };
    SettlementPage: components['schemas']['Page'] & {
      items: components['schemas']['Settlement'][];
    };
    /**
     * @description Base of every paginated response. A list operation combines it with `allOf` and adds an
     *     `items` array of its own type.
     */
    Page: {
      /** @description Cursor for the next page, or `null` on the last page. */
      next_cursor: string | null;
    };
    /**
     * @description Body of every 4xx and 5xx response.
     * @example {
     *       "code": "BOOKING_SLOT_TAKEN",
     *       "message": "Ese turno se acaba de ocupar. Elegí otro horario.",
     *       "details": {
     *         "court_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b",
     *         "starts_at": "2026-10-17T21:30:00Z"
     *       }
     *     }
     */
    Error: {
      code: components['schemas']['ErrorCode'];
      /** @description Short text for the end user, in es-AR, from the API translation files. */
      message: string;
      /** @description Optional machine-readable detail. Shape per code in the `ErrorCode` catalog. */
      details?: {
        [key: string]: unknown;
      };
    };
    /** @description One invalid field, used in `details.issues` of `VALIDATION_FAILED`. */
    ValidationIssue: {
      /** @description JSON pointer or parameter name of the invalid value, e.g. `/players/0/phone`. */
      path: string;
      /** @description Machine-readable rule that failed, e.g. `required`, `max`, `format`. */
      rule: string;
    };
    /**
     * @description Stable error codes. The catalog in `x-error-catalog` gives the HTTP status, the meaning
     *     and the `details` shape of each one. Codes are only added, never renamed or reused.
     * @enum {string}
     */
    ErrorCode:
      | 'VALIDATION_FAILED'
      | 'INVALID_CURSOR'
      | 'UNAUTHENTICATED'
      | 'ACCESS_TOKEN_EXPIRED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'INVALID_STATE_TRANSITION'
      | 'RATE_LIMITED'
      | 'INTERNAL_ERROR'
      | 'SERVICE_UNAVAILABLE'
      | 'OTP_INVALID'
      | 'OTP_EXPIRED'
      | 'OTP_ATTEMPTS_EXCEEDED'
      | 'REFRESH_TOKEN_INVALID'
      | 'TERMS_NOT_ACCEPTED'
      | 'CLUB_FEATURE_DISABLED'
      | 'CLUB_SERVICE_SUSPENDED'
      | 'BOOKING_SLOT_TAKEN'
      | 'BOOKING_SLOT_INVALID'
      | 'BOOKING_HOLD_EXPIRED'
      | 'BOOKING_FULL'
      | 'BOOKING_INVITE_INVALID'
      | 'MATCH_NOT_PUBLISHED'
      | 'MATCH_PLAYER_SLOT_TAKEN'
      | 'MATCH_ALREADY_JOINED'
      | 'MEDIA_NOT_READY'
      | 'MEDIA_EXPIRED'
      | 'COACH_ACCESS_NOT_GRANTED'
      | 'PAYMENT_PROVIDER_ERROR'
      | 'WEBHOOK_SIGNATURE_INVALID'
      | 'RECORDING_NOT_ACTIVE'
      | 'DEVICE_CERTIFICATE_INVALID'
      | 'DEVICE_CLUB_MISMATCH';
  };
  responses: {
    /** @description Malformed request (`VALIDATION_FAILED`, `INVALID_CURSOR`). */
    BadRequest: {
      headers: {
        'X-Request-Id': components['headers']['X-Request-Id'];
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    /** @description Missing or invalid credentials. */
    Unauthorized: {
      headers: {
        'X-Request-Id': components['headers']['X-Request-Id'];
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    /** @description The caller is not allowed to do this. */
    Forbidden: {
      headers: {
        'X-Request-Id': components['headers']['X-Request-Id'];
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    /** @description The resource does not exist or is not visible to the caller. */
    NotFound: {
      headers: {
        'X-Request-Id': components['headers']['X-Request-Id'];
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    /** @description Conflict with the current state of the resource. */
    Conflict: {
      headers: {
        'X-Request-Id': components['headers']['X-Request-Id'];
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    /** @description The resource was deleted for good. */
    Gone: {
      headers: {
        'X-Request-Id': components['headers']['X-Request-Id'];
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    /** @description Well-formed request that breaks a business rule. */
    UnprocessableEntity: {
      headers: {
        'X-Request-Id': components['headers']['X-Request-Id'];
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    /** @description Rate limit exceeded (`RATE_LIMITED`). */
    TooManyRequests: {
      headers: {
        'X-Request-Id': components['headers']['X-Request-Id'];
        'Retry-After': components['headers']['Retry-After'];
        'RateLimit-Limit': components['headers']['RateLimit-Limit'];
        'RateLimit-Remaining': components['headers']['RateLimit-Remaining'];
        'RateLimit-Reset': components['headers']['RateLimit-Reset'];
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    /** @description Unexpected server error (`INTERNAL_ERROR`). */
    InternalError: {
      headers: {
        'X-Request-Id': components['headers']['X-Request-Id'];
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    /** @description An external provider failed (`PAYMENT_PROVIDER_ERROR`). */
    BadGateway: {
      headers: {
        'X-Request-Id': components['headers']['X-Request-Id'];
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    /** @description Temporarily unavailable (`SERVICE_UNAVAILABLE`). */
    ServiceUnavailable: {
      headers: {
        'X-Request-Id': components['headers']['X-Request-Id'];
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
  };
  parameters: {
    /** @description Opaque cursor from a previous page's `next_cursor`. Omit it for the first page. */
    Cursor: string;
    /** @description Maximum number of items in the page. */
    Limit: number;
    /** @description Club the panel acts on. The caller must be staff or owner of it. */
    ClubIdQuery: components['schemas']['Uuid'];
    /** @description Club id. */
    ClubId: components['schemas']['Uuid'];
    /** @description Court id. */
    CourtId: components['schemas']['Uuid'];
    /** @description Booking id. */
    BookingId: components['schemas']['Uuid'];
  };
  requestBodies: never;
  headers: {
    /** @description Unique id of the request, also present in the structured logs. */
    'X-Request-Id': string;
    /** @description Requests allowed in the current window (60). */
    'RateLimit-Limit': number;
    /** @description Requests left in the current window. */
    'RateLimit-Remaining': number;
    /** @description Seconds until the current window resets. */
    'RateLimit-Reset': number;
    /** @description Seconds to wait before retrying. */
    'Retry-After': number;
  };
  pathItems: never;
}
export type SchemaUuid = components['schemas']['Uuid'];
export type SchemaTimestamp = components['schemas']['Timestamp'];
export type SchemaAmountCents = components['schemas']['AmountCents'];
export type SchemaMatchStatus = components['schemas']['MatchStatus'];
export type SchemaBookingStatus = components['schemas']['BookingStatus'];
export type SchemaProcessingJobStatus = components['schemas']['ProcessingJobStatus'];
export type SchemaPaymentStatus = components['schemas']['PaymentStatus'];
export type SchemaSettlementStatus = components['schemas']['SettlementStatus'];
export type SchemaHealthStatus = components['schemas']['HealthStatus'];
export type SchemaPhoneNumber = components['schemas']['PhoneNumber'];
export type SchemaSignUpConsent = components['schemas']['SignUpConsent'];
export type SchemaOtpRequest = components['schemas']['OtpRequest'];
export type SchemaOtpChallenge = components['schemas']['OtpChallenge'];
export type SchemaOtpVerifyRequest = components['schemas']['OtpVerifyRequest'];
export type SchemaOAuthSignInRequest = components['schemas']['OAuthSignInRequest'];
export type SchemaAppleSignInRequest = components['schemas']['AppleSignInRequest'];
export type SchemaRefreshRequest = components['schemas']['RefreshRequest'];
export type SchemaTokenPair = components['schemas']['TokenPair'];
export type SchemaAuthSession = components['schemas']['AuthSession'];
export type SchemaDeclaredCategory = components['schemas']['DeclaredCategory'];
export type SchemaDominantHand = components['schemas']['DominantHand'];
export type SchemaPlayingSide = components['schemas']['PlayingSide'];
export type SchemaUser = components['schemas']['User'];
export type SchemaUserUpdate = components['schemas']['UserUpdate'];
export type SchemaAccountDeletion = components['schemas']['AccountDeletion'];
export type SchemaEntityRef = components['schemas']['EntityRef'];
export type SchemaSetScore = components['schemas']['SetScore'];
export type SchemaMatchSummary = components['schemas']['MatchSummary'];
export type SchemaMatchSummaryPage = components['schemas']['MatchSummaryPage'];
export type SchemaUserStats = components['schemas']['UserStats'];
export type SchemaClubPlan = components['schemas']['ClubPlan'];
export type SchemaClubSummary = components['schemas']['ClubSummary'];
export type SchemaClubSummaryPage = components['schemas']['ClubSummaryPage'];
export type SchemaClub = components['schemas']['Club'];
export type SchemaCourtStatus = components['schemas']['CourtStatus'];
export type SchemaCourt = components['schemas']['Court'];
export type SchemaWeekday = components['schemas']['Weekday'];
export type SchemaLocalTime = components['schemas']['LocalTime'];
export type SchemaBookingDuration = components['schemas']['BookingDuration'];
export type SchemaDurationPrice = components['schemas']['DurationPrice'];
export type SchemaPriceBand = components['schemas']['PriceBand'];
export type SchemaBookingRule = components['schemas']['BookingRule'];
export type SchemaDepositNone = components['schemas']['DepositNone'];
export type SchemaDepositPercent = components['schemas']['DepositPercent'];
export type SchemaDepositFixed = components['schemas']['DepositFixed'];
export type SchemaDeposit = components['schemas']['Deposit'];
export type SchemaCourtBookingSettings = components['schemas']['CourtBookingSettings'];
export type SchemaPlayerExtraSettings = components['schemas']['PlayerExtraSettings'];
export type SchemaCoachPlan = components['schemas']['CoachPlan'];
export type SchemaChargeSettings = components['schemas']['ChargeSettings'];
export type SchemaCourtSettingsUpdate = components['schemas']['CourtSettingsUpdate'];
export type SchemaClubSettingsUpdate = components['schemas']['ClubSettingsUpdate'];
export type SchemaAvailabilitySlot = components['schemas']['AvailabilitySlot'];
export type SchemaCourtAvailability = components['schemas']['CourtAvailability'];
export type SchemaGuardianRelationship = components['schemas']['GuardianRelationship'];
export type SchemaGuardianConsent = components['schemas']['GuardianConsent'];
export type SchemaBookingRecurrence = components['schemas']['BookingRecurrence'];
export type SchemaBookingCreate = components['schemas']['BookingCreate'];
export type SchemaBookingSource = components['schemas']['BookingSource'];
export type SchemaNoRecordReason = components['schemas']['NoRecordReason'];
export type SchemaBookingPlayer = components['schemas']['BookingPlayer'];
export type SchemaBookingSeries = components['schemas']['BookingSeries'];
export type SchemaBooking = components['schemas']['Booking'];
export type SchemaBookingInviteRequest = components['schemas']['BookingInviteRequest'];
export type SchemaBookingInvite = components['schemas']['BookingInvite'];
export type SchemaBookingAcceptRequest = components['schemas']['BookingAcceptRequest'];
export type SchemaBookingCancelScope = components['schemas']['BookingCancelScope'];
export type SchemaBookingCancelRequest = components['schemas']['BookingCancelRequest'];
export type SchemaRefundStatus = components['schemas']['RefundStatus'];
export type SchemaBookingCancellation = components['schemas']['BookingCancellation'];
export type SchemaCourtLiveStatus = components['schemas']['CourtLiveStatus'];
export type SchemaCameraEnd = components['schemas']['CameraEnd'];
export type SchemaCameraState = components['schemas']['CameraState'];
export type SchemaCourtLive = components['schemas']['CourtLive'];
export type SchemaDeviceHealthSummary = components['schemas']['DeviceHealthSummary'];
export type SchemaPricingTier = components['schemas']['PricingTier'];
export type SchemaClubBillingSummary = components['schemas']['ClubBillingSummary'];
export type SchemaClubRevenueSummary = components['schemas']['ClubRevenueSummary'];
export type SchemaClubDashboard = components['schemas']['ClubDashboard'];
export type SchemaClubBookingContact = components['schemas']['ClubBookingContact'];
export type SchemaClubBooking = components['schemas']['ClubBooking'];
export type SchemaClubBookingPage = components['schemas']['ClubBookingPage'];
export type SchemaClubBookingCreate = components['schemas']['ClubBookingCreate'];
export type SchemaRecordingStop = components['schemas']['RecordingStop'];
export type SchemaSettlementSubscription = components['schemas']['SettlementSubscription'];
export type SchemaSettlement = components['schemas']['Settlement'];
export type SchemaSettlementPage = components['schemas']['SettlementPage'];
export type SchemaPage = components['schemas']['Page'];
export type SchemaError = components['schemas']['Error'];
export type SchemaValidationIssue = components['schemas']['ValidationIssue'];
export type SchemaErrorCode = components['schemas']['ErrorCode'];
export type ResponseBadRequest = components['responses']['BadRequest'];
export type ResponseUnauthorized = components['responses']['Unauthorized'];
export type ResponseForbidden = components['responses']['Forbidden'];
export type ResponseNotFound = components['responses']['NotFound'];
export type ResponseConflict = components['responses']['Conflict'];
export type ResponseGone = components['responses']['Gone'];
export type ResponseUnprocessableEntity = components['responses']['UnprocessableEntity'];
export type ResponseTooManyRequests = components['responses']['TooManyRequests'];
export type ResponseInternalError = components['responses']['InternalError'];
export type ResponseBadGateway = components['responses']['BadGateway'];
export type ResponseServiceUnavailable = components['responses']['ServiceUnavailable'];
export type ParameterCursor = components['parameters']['Cursor'];
export type ParameterLimit = components['parameters']['Limit'];
export type ParameterClubIdQuery = components['parameters']['ClubIdQuery'];
export type ParameterClubId = components['parameters']['ClubId'];
export type ParameterCourtId = components['parameters']['CourtId'];
export type ParameterBookingId = components['parameters']['BookingId'];
export type HeaderXRequestId = components['headers']['X-Request-Id'];
export type HeaderRateLimitLimit = components['headers']['RateLimit-Limit'];
export type HeaderRateLimitRemaining = components['headers']['RateLimit-Remaining'];
export type HeaderRateLimitReset = components['headers']['RateLimit-Reset'];
export type HeaderRetryAfter = components['headers']['Retry-After'];
export type $defs = Record<string, never>;
export interface operations {
  getHealth: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The API is up. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "status": "ok"
           *     }
           */
          'application/json': components['schemas']['HealthStatus'];
        };
      };
      429: components['responses']['TooManyRequests'];
      503: components['responses']['ServiceUnavailable'];
    };
  };
  requestWhatsappOtp: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "phone": "+5491155550123"
         *     }
         */
        'application/json': components['schemas']['OtpRequest'];
      };
    };
    responses: {
      /** @description The code was sent (or queued for sending). */
      202: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "expires_in_seconds": 300,
           *       "resend_after_seconds": 60
           *     }
           */
          'application/json': components['schemas']['OtpChallenge'];
        };
      };
      400: components['responses']['BadRequest'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
      503: components['responses']['ServiceUnavailable'];
    };
  };
  verifyWhatsappOtp: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['OtpVerifyRequest'];
      };
    };
    responses: {
      /** @description Signed in. `is_new_user` tells the app whether to show onboarding. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthSession'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  signInWithGoogle: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...",
         *       "nonce": "3f9c2a7b1e",
         *       "consent": {
         *         "terms_version": "2026-10-01",
         *         "privacy_version": "2026-10-01"
         *       }
         *     }
         */
        'application/json': components['schemas']['OAuthSignInRequest'];
      };
    };
    responses: {
      /** @description Signed in. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthSession'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  signInWithApple: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "id_token": "eyJraWQiOiJXNldjT0tCIiwiYWxnIjoiUlMyNTYifQ...",
         *       "nonce": "8d1e4b6a0c",
         *       "full_name": "Sofía Pérez",
         *       "consent": {
         *         "terms_version": "2026-10-01",
         *         "privacy_version": "2026-10-01"
         *       }
         *     }
         */
        'application/json': components['schemas']['AppleSignInRequest'];
      };
    };
    responses: {
      /** @description Signed in. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthSession'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  refreshSession: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "refresh_token": "rt_01928f6e7c1a7d4e9b3a2f6c8e1d4a5b.Zx8kQ2"
         *     }
         */
        'application/json': components['schemas']['RefreshRequest'];
      };
    };
    responses: {
      /** @description New token pair. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "access_token": "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIwMTky...",
           *       "refresh_token": "rt_01928f6e7c1a7d4e9b3a2f6c8e1d4a5c.Yp3nR7",
           *       "token_type": "Bearer",
           *       "expires_in": 900
           *     }
           */
          'application/json': components['schemas']['TokenPair'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  getMe: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The profile. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['User'];
        };
      };
      401: components['responses']['Unauthorized'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  deleteMe: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Deletion scheduled. */
      202: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "deletion_scheduled_for": "2026-11-16T21:30:00Z"
           *     }
           */
          'application/json': components['schemas']['AccountDeletion'];
        };
      };
      401: components['responses']['Unauthorized'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  updateMe: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "display_name": "Sofi Pérez",
         *       "declared_category": "6",
         *       "playing_side": "drive",
         *       "training_opt_out": true
         *     }
         */
        'application/json': components['schemas']['UserUpdate'];
      };
    };
    responses: {
      /** @description The updated profile. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['User'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  listMyMatches: {
    parameters: {
      query?: {
        /** @description Opaque cursor from a previous page's `next_cursor`. Omit it for the first page. */
        cursor?: components['parameters']['Cursor'];
        /** @description Maximum number of items in the page. */
        limit?: components['parameters']['Limit'];
        /** @description Only matches in this status. */
        status?: components['schemas']['MatchStatus'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description One page of matches. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "items": [
           *         {
           *           "id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b",
           *           "type": "match",
           *           "status": "published",
           *           "starts_at": "2026-10-15T22:00:00Z",
           *           "ends_at": "2026-10-15T23:30:00Z",
           *           "club": {
           *             "id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60",
           *             "name": "Pádel Norte"
           *           },
           *           "court": {
           *             "id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61",
           *             "name": "Cancha 2"
           *           },
           *           "team": 1,
           *           "won": true,
           *           "sets": [
           *             {
           *               "team_1": 6,
           *               "team_2": 4
           *             },
           *             {
           *               "team_1": 7,
           *               "team_2": 5
           *             }
           *           ]
           *         }
           *       ],
           *       "next_cursor": "eyJzdGFydHNfYXQiOiIyMDI2LTEwLTE1In0"
           *     }
           */
          'application/json': components['schemas']['MatchSummaryPage'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  getMyStats: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The stats. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "matches_played": 24,
           *       "matches_won": 14,
           *       "sets_won": 31,
           *       "sets_lost": 22,
           *       "points_won": 812,
           *       "points_played": 1530,
           *       "rating": 4.35,
           *       "last_match_at": "2026-10-15T23:30:00Z"
           *     }
           */
          'application/json': components['schemas']['UserStats'];
        };
      };
      401: components['responses']['Unauthorized'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  listClubs: {
    parameters: {
      query?: {
        /** @description Opaque cursor from a previous page's `next_cursor`. Omit it for the first page. */
        cursor?: components['parameters']['Cursor'];
        /** @description Maximum number of items in the page. */
        limit?: components['parameters']['Limit'];
        /** @description Case- and accent-insensitive search on the club name or city. */
        q?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description One page of clubs. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "items": [
           *         {
           *           "id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60",
           *           "name": "Club Demo Palermo",
           *           "address": "Av. Santa Fe 4000",
           *           "city": "CABA",
           *           "logo_url": null,
           *           "courts_count": 4
           *         }
           *       ],
           *       "next_cursor": null
           *     }
           */
          'application/json': components['schemas']['ClubSummaryPage'];
        };
      };
      400: components['responses']['BadRequest'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  getClub: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Club id. */
        id: components['parameters']['ClubId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The club. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Club'];
        };
      };
      400: components['responses']['BadRequest'];
      404: components['responses']['NotFound'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  updateClubSettings: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Club id. */
        id: components['parameters']['ClubId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ClubSettingsUpdate'];
      };
    };
    responses: {
      /** @description The club with the new settings. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Club'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  getCourtAvailability: {
    parameters: {
      query: {
        /**
         * @description Local day in the club's time zone, `YYYY-MM-DD`. Today up to 60 days ahead.
         * @example 2026-10-23
         */
        date: string;
        /**
         * @description Booking length to look for.
         * @example 90
         */
        duration_minutes: components['schemas']['BookingDuration'];
      };
      header?: never;
      path: {
        /** @description Court id. */
        id: components['parameters']['CourtId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Free slots, ordered by start. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CourtAvailability'];
        };
      };
      400: components['responses']['BadRequest'];
      404: components['responses']['NotFound'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  createBooking: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['BookingCreate'];
      };
    };
    responses: {
      /** @description The booking, `held` (deposit pending) or `confirmed` (no deposit). */
      201: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Booking'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      409: components['responses']['Conflict'];
      422: components['responses']['UnprocessableEntity'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  inviteToBooking: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Booking id. */
        id: components['parameters']['BookingId'];
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        /**
         * @example {
         *       "position": 2
         *     }
         */
        'application/json': components['schemas']['BookingInviteRequest'];
      };
    };
    responses: {
      /** @description The invite. */
      201: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "booking_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a70",
           *       "position": 2,
           *       "token": "inv_7Hq2LmZx9KpR4tWc",
           *       "url": "https://example.com/i/inv_7Hq2LmZx9KpR4tWc",
           *       "expires_at": "2026-10-23T22:00:00Z"
           *     }
           */
          'application/json': components['schemas']['BookingInvite'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      409: components['responses']['Conflict'];
      422: components['responses']['UnprocessableEntity'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  acceptBookingInvite: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Booking id. */
        id: components['parameters']['BookingId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "token": "inv_7Hq2LmZx9KpR4tWc"
         *     }
         */
        'application/json': components['schemas']['BookingAcceptRequest'];
      };
    };
    responses: {
      /** @description The booking with the user in the invite's position. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Booking'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      409: components['responses']['Conflict'];
      422: components['responses']['UnprocessableEntity'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  cancelBooking: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Booking id. */
        id: components['parameters']['BookingId'];
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        /**
         * @example {
         *       "scope": "this"
         *     }
         */
        'application/json': components['schemas']['BookingCancelRequest'];
      };
    };
    responses: {
      /** @description The cancelled booking and the refund decision. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "booking_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a70",
           *       "status": "cancelled",
           *       "cancelled_at": "2026-10-21T15:00:00Z",
           *       "refund_cents": 900000,
           *       "refund_status": "pending",
           *       "cancelled_booking_ids": [
           *         "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a70"
           *       ]
           *     }
           */
          'application/json': components['schemas']['BookingCancellation'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      409: components['responses']['Conflict'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
      502: components['responses']['BadGateway'];
    };
  };
  getClubDashboard: {
    parameters: {
      query: {
        /** @description Club the panel acts on. The caller must be staff or owner of it. */
        club_id: components['parameters']['ClubIdQuery'];
        /** @description Local date in the club's time zone. Defaults to today. */
        date?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The dashboard. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ClubDashboard'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  listClubBookings: {
    parameters: {
      query: {
        /** @description Club the panel acts on. The caller must be staff or owner of it. */
        club_id: components['parameters']['ClubIdQuery'];
        /** @description Opaque cursor from a previous page's `next_cursor`. Omit it for the first page. */
        cursor?: components['parameters']['Cursor'];
        /** @description Maximum number of items in the page. */
        limit?: components['parameters']['Limit'];
        from: components['schemas']['Timestamp'];
        to: components['schemas']['Timestamp'];
        court_id?: components['schemas']['Uuid'];
        status?: components['schemas']['BookingStatus'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description One page of bookings. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ClubBookingPage'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  createClubBooking: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "court_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61",
         *       "starts_at": "2026-10-23T22:00:00Z",
         *       "duration_minutes": 90,
         *       "phone": "+5491155550188",
         *       "name": "Diego Ruiz",
         *       "deposit": "none"
         *     }
         */
        'application/json': components['schemas']['ClubBookingCreate'];
      };
    };
    responses: {
      /** @description The confirmed booking. */
      201: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ClubBooking'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      409: components['responses']['Conflict'];
      422: components['responses']['UnprocessableEntity'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  stopCourtRecording: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Court id. */
        court: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The recording was stopped. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "court_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61",
           *       "match_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b",
           *       "match_status": "recorded",
           *       "stopped_at": "2026-10-23T23:12:00Z"
           *     }
           */
          'application/json': components['schemas']['RecordingStop'];
        };
      };
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      409: components['responses']['Conflict'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  listClubSettlements: {
    parameters: {
      query: {
        /** @description Club the panel acts on. The caller must be staff or owner of it. */
        club_id: components['parameters']['ClubIdQuery'];
        /** @description Opaque cursor from a previous page's `next_cursor`. Omit it for the first page. */
        cursor?: components['parameters']['Cursor'];
        /** @description Maximum number of items in the page. */
        limit?: components['parameters']['Limit'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description One page of settlements. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "items": [
           *         {
           *           "id": "0192f9e4-5a6b-7c8d-9e0f-1a2b3c4d5e6f",
           *           "period": "2026-10",
           *           "status": "invoiced",
           *           "subscription": {
           *             "active_players_90d": 212,
           *             "tier": {
           *               "name": "Tramo 2",
           *               "min_active_players": 151,
           *               "max_active_players": 300
           *             },
           *             "amount_cents": 45000000
           *           },
           *           "player_payments_cents": 18000000,
           *           "lesson_payments_cents": 9000000,
           *           "deposits_cents": 24000000,
           *           "commissions_cents": 2700000,
           *           "collected_by_platform_cents": 0,
           *           "net_payable_by_club_cents": 47700000,
           *           "invoice_number": "0003-00000123",
           *           "created_at": "2026-11-01T03:00:00Z"
           *         }
           *       ],
           *       "next_cursor": null
           *     }
           */
          'application/json': components['schemas']['SettlementPage'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
}
