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
  '/device/schedule': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Turns to record in the next 48 hours (club device)
     * @description The `scheduler` process calls this every minute and stores the answer in its local
     *     SQLite, so it keeps recording from the stored copy for up to 48 hours without internet
     *     (section 4). The device is identified by its client certificate (mTLS); it only gets
     *     its own club's courts. Recording starts at `record_from` (2 minutes before the turn)
     *     and ends at `record_until` (2 minutes after). Turns with `no_record: true` are listed
     *     so the device knows the court is busy, but must not be recorded.
     *
     *     Not paginated: 48 hours of a club fit in one response. `ETag` / `If-None-Match` avoid
     *     resending an unchanged schedule (`304`).
     *
     *     Errors: `DEVICE_CERTIFICATE_INVALID` (401).
     */
    get: operations['getDeviceSchedule'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/device/heartbeat': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Health report every 60 seconds (club device)
     * @description The `health` process reports free disk, GPU temperature, each camera and the queues
     *     (section 4). Three missed heartbeats mark the device offline and emit `device.offline`;
     *     a camera down for more than 5 minutes during a turn alerts the club and support. The
     *     response carries the server time (to detect clock drift beyond NTP) and the software
     *     version the `updater` should run.
     *
     *     Errors: `DEVICE_CERTIFICATE_INVALID` (401), `DEVICE_CLUB_MISMATCH` (403, a camera of
     *     another club), `VALIDATION_FAILED` (400).
     */
    post: operations['postDeviceHeartbeat'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/device/matches/{id}/results': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Upload the pipeline results of a match (club device)
     * @description The `uploader` sends this first, before clips and video (priority 1, section 4). The
     *     body is the `MatchResults` format shared by `ml` (which produces it) and
     *     `services/edge-agent` (which sends it); its full example is `MatchResultsExample`.
     *
     *     - The match moves `processing` → `published` (or `failed` with `status: failed`), and
     *       `match.processed` is emitted. The cloud stores points, shots and bounces, takes the
     *       device stats as a first version and recomputes them with the same versioned formulas
     *       after any score correction.
     *     - Idempotent by `run_id`: resending the same run returns `202` without changes. A new
     *       `run_id` (reprocess) replaces the previous results.
     *     - Media is referenced by the `media_id` returned by `POST /device/uploads`; uploads may
     *       finish after the results.
     *
     *     Errors: `DEVICE_CERTIFICATE_INVALID` (401), `DEVICE_CLUB_MISMATCH` (403),
     *     `INVALID_STATE_TRANSITION` (409, the match is not `recorded` or `processing`),
     *     `VALIDATION_FAILED` (400), `NOT_FOUND`.
     */
    post: operations['postMatchResults'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/device/uploads': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Get signed multipart upload links for a video, clip, reel or thumbnail
     * @description Starts a resumable multipart upload to private storage (section 4, `uploader`). The
     *     device uploads each part with `PUT` to its signed `url` (valid 1 hour; call again with
     *     the same `upload_id` to get fresh links for missing parts), then calls
     *     `POST /device/uploads/{id}/complete`. Idempotent by `sha256` + `match_id` + `kind`.
     *     The device never receives permanent links.
     *
     *     Errors: `DEVICE_CERTIFICATE_INVALID` (401), `DEVICE_CLUB_MISMATCH` (403),
     *     `VALIDATION_FAILED` (400), `NOT_FOUND` (match or upload).
     */
    post: operations['createDeviceUpload'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/device/uploads/{id}/complete': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Finish a multipart upload
     * @description Closes the multipart upload with the `ETag` of each part. The API checks size and
     *     `sha256`, marks the media `ready` and, for clips, emits `clip.created`. After this the
     *     device may delete its original once the analysis is done (section 4, disk).
     *
     *     Errors: `DEVICE_CLUB_MISMATCH` (403), `VALIDATION_FAILED` (400, missing part or checksum
     *     mismatch), `NOT_FOUND`.
     */
    post: operations['completeDeviceUpload'];
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
  '/matches/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get a match with its players, score, stats and clips
     * @description Visible to the match players (any status), to coaches the player gave access to, and to
     *     the club staff and owner. Staff and owner get the match without personal stats: every
     *     `players[].stats` and `insights` is `null` for them (section 12).
     *
     *     Before the match is published, `sets`, `points_to_review`, `insights` and stats are empty
     *     or `null`. The four `players` positions exist from `published` on, one per tracked
     *     player, each with a `thumbnail_media_id`; the app shows them for "este soy yo"
     *     (`POST /matches/{id}/claim-player`). Media is referenced by id only and fetched with
     *     `GET /media/{id}/url`: no field here is a permanent video URL.
     *
     *     Errors: `NOT_FOUND` (also when the caller may not see the match),
     *     `COACH_ACCESS_NOT_GRANTED` (403).
     */
    get: operations['getMatch'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/matches/{id}/claim-player': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Claim a player position ("este soy yo")
     * @description The signed-in user says which of the four tracked players they are (section 5, step 4).
     *     No facial recognition: the user picks the thumbnail. Each confirmation narrows the
     *     options of the others. Stats of an unclaimed position stay stored until someone claims
     *     it. A user who was in the booking (`booking_players`) or scanned the court QR may claim;
     *     so may anyone with the match invite link.
     *
     *     Errors: `MATCH_NOT_PUBLISHED` (409, positions exist only after the analysis),
     *     `MATCH_PLAYER_SLOT_TAKEN` (409), `MATCH_ALREADY_JOINED` (409, the user already holds
     *     another position), `TERMS_NOT_ACCEPTED` (403), `NOT_FOUND`.
     */
    post: operations['claimMatchPlayer'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/matches/{id}/score-correction': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Correct the score (final result or a doubtful point)
     * @description A confirmed player of the match corrects the score (section 6, correction layers 2
     *     and 3):
     *
     *     - `point_winner`: confirms who won one point flagged in `points_to_review`
     *       (confidence under 0.7).
     *     - `final_score`: loads the real result (for example 6-4 6-3); a Viterbi-style alignment
     *       picks the most likely sequence of point winners that ends in that result.
     *
     *     The match moves `published` → `needs_review` and back to `published` when the stats are
     *     recomputed; `match.score_corrected` is emitted. Every correction is stored and used to
     *     retrain the models. The response is `202` because the recomputation is asynchronous.
     *
     *     Errors: `MATCH_NOT_PUBLISHED` (409), `INVALID_STATE_TRANSITION` (409, a correction is
     *     already being applied), `FORBIDDEN` (the caller is not a confirmed player),
     *     `VALIDATION_FAILED` (400, impossible score or unknown point), `NOT_FOUND`.
     */
    post: operations['correctMatchScore'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/matches/{id}/clips': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List the clips of a match
     * @description Clips of the match (app taps, court button and automatic highlights), in video order.
     *     Visible to whoever may see the match. Each clip references its media by id.
     */
    get: operations['listMatchClips'];
    put?: never;
    /**
     * Cut a clip from the match video in the app
     * @description A player of the match cuts a clip after the fact, choosing start and end on the video
     *     (at most 60 seconds). Live taps during the turn travel over the court WebSocket channel
     *     instead. The clip is cut by the club device, or in the cloud if the full video is
     *     already there; it starts `processing` and `clip.created` is emitted when its media is
     *     `ready`.
     *
     *     Errors: `MATCH_NOT_PUBLISHED` (409), `MEDIA_EXPIRED` (410, the full video was deleted
     *     after 30 days), `VALIDATION_FAILED` (400, `end_ms` not after `start_ms`, longer than
     *     60 s or past the end of the video), `FORBIDDEN` (not a player), `NOT_FOUND`.
     */
    post: operations['createMatchClip'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/media/{id}/url': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get a signed link to a video, clip, reel or thumbnail (valid 1 hour)
     * @description Videos are private in storage. This returns a signed link that expires in at most 1 hour
     *     (`expires_at`); clients request a new one when it expires and never store it. It is the
     *     only way to reach media: no other response carries a media URL.
     *
     *     Support staff get a link only with a permission registered in `audit_log` (section 12).
     *
     *     Errors: `MEDIA_NOT_READY` (409), `MEDIA_EXPIRED` (410), `NOT_FOUND` (also when the
     *     caller may not see the media).
     */
    get: operations['getMediaUrl'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/media/{id}/download': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Ask for a downloadable file of a video, clip or reel
     * @description Returns a signed download link (`Content-Disposition: attachment`) valid for 1 hour when
     *     the file is in the cloud (`status: ready`). When the full video stayed in the club
     *     because its upload is slow (section 4), this asks the club device to upload it with top
     *     priority and returns `status: preparing` with `url: null`; the player gets a WhatsApp
     *     notice when it is ready and calls this again. Calling it again while `preparing` is
     *     safe.
     *
     *     Errors: `MEDIA_EXPIRED` (410), `CLUB_FEATURE_DISABLED` (403, full video download is an
     *     extra the club has not enabled), `NOT_FOUND`.
     */
    post: operations['requestMediaDownload'];
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
    /** @description How the match is scored (section 6), from the club settings at booking time. */
    ScoringRules: {
      /** @description True plays golden point at 40-40; false plays advantage. */
      golden_point: boolean;
      /**
       * @description A normal set with tie-break at 6-6, or a super tie-break to 10.
       * @enum {string}
       */
      third_set: 'set' | 'super_tiebreak';
    };
    DeviceScheduleItem: {
      match_id: components['schemas']['Uuid'];
      /** @description `null` for a recording started by hand from the panel. */
      booking_id: components['schemas']['Uuid'] | null;
      court_id: components['schemas']['Uuid'];
      /** @enum {string} */
      match_type: 'match' | 'lesson';
      starts_at: components['schemas']['Timestamp'];
      ends_at: components['schemas']['Timestamp'];
      record_from: components['schemas']['Timestamp'];
      record_until: components['schemas']['Timestamp'];
      no_record: boolean;
      scoring: components['schemas']['ScoringRules'];
      updated_at: components['schemas']['Timestamp'];
    };
    DeviceSchedule: {
      club_id: components['schemas']['Uuid'];
      generated_at: components['schemas']['Timestamp'];
      /** @description End of the 48-hour window. */
      valid_until: components['schemas']['Timestamp'];
      /** @description Ordered by `record_from`. A cancelled turn disappears from the list. */
      items: components['schemas']['DeviceScheduleItem'][];
    };
    DeviceCameraHealth: {
      camera_id: components['schemas']['Uuid'];
      online: boolean;
      fps: number | null;
      recording: boolean;
    };
    DeviceHeartbeat: {
      sent_at: components['schemas']['Timestamp'];
      software_version: string;
      uptime_seconds: number;
      disk_free_bytes: number;
      disk_total_bytes: number;
      gpu_temp_c: number | null;
      cpu_temp_c?: number | null;
      cameras: components['schemas']['DeviceCameraHealth'][];
      upload_queue: {
        items: number;
        bytes: number;
        eta_minutes: number;
      };
      /** @description Local analysis backlog. Over 6 hours the oldest matches go to the cloud GPU. */
      processing_backlog_minutes: number;
    };
    DeviceHeartbeatAck: {
      server_time: components['schemas']['Timestamp'];
      /** @description Version the `updater` installs between 4 and 6 a.m. */
      desired_software_version: string;
    };
    /**
     * @description End of the court (camera end, or the side a team starts on).
     * @enum {string}
     */
    CourtEnd: 'A' | 'B';
    /**
     * @description Position in meters (see the format note above). `z` is `null` without 3D (the ball is
     *     triangulated only when both cameras see it). Values outside the court (lobs, exits,
     *     players behind the glass) are allowed within the 1.5 m mask and beyond for the ball.
     */
    CourtPosition: {
      x: number;
      y: number;
      z?: number | null;
    };
    /**
     * @description One of the 4 tracks (section 5, step 3).
     * @enum {integer}
     */
    PipelinePosition: 1 | 2 | 3 | 4;
    /** @enum {integer} */
    PipelineTeam: 1 | 2;
    /**
     * @description Section 5, step 9. `unknown` under 0.6 confidence.
     * @enum {string}
     */
    PipelineShotType:
      | 'serve'
      | 'forehand'
      | 'backhand'
      | 'forehand_volley'
      | 'backhand_volley'
      | 'bandeja'
      | 'vibora'
      | 'smash'
      | 'lob'
      | 'wall_exit'
      | 'unknown';
    /**
     * @description Section 5, step 8.
     * @enum {string}
     */
    BounceSurface: 'floor' | 'back_glass' | 'side_glass' | 'fence' | 'net';
    /**
     * @description Rule of section 6 that closed the point, in evaluation order.
     * @enum {string}
     */
    PipelinePointEndReason:
      | 'double_fault'
      | 'own_floor_before_net'
      | 'net'
      | 'rival_wall_before_floor'
      | 'double_bounce'
      | 'out_after_bounce'
      | 'ball_lost';
    ResultPlayer: {
      position: components['schemas']['PipelinePosition'];
      team: components['schemas']['PipelineTeam'];
      initial_side: components['schemas']['CourtEnd'];
      /** @description Thumbnail for "este soy yo", from `POST /device/uploads`. */
      thumbnail_media_id: components['schemas']['Uuid'] | null;
      /** @description Share of rally frames where this track was seen. */
      track_coverage_pct: number;
    };
    ResultEventRef: {
      /** @enum {string} */
      kind: 'shot' | 'bounce';
      /** @description Index in `shots` or `bounces`. */
      index: number;
    };
    ResultPoint: {
      /** @description 1-based, consecutive over the match. */
      number: number;
      set: number;
      /** @description 1-based within the set; the tie-break is game 13. */
      game: number;
      server_position: components['schemas']['PipelinePosition'];
      serve_faults: number;
      winner_team: components['schemas']['PipelineTeam'];
      end_reason: components['schemas']['PipelinePointEndReason'];
      /** @description The event that closed the point; `null` for `ball_lost`. */
      deciding_event: components['schemas']['ResultEventRef'] | null;
      /** @description Product of the confidence of the deciding events (section 6, layer 2). */
      confidence: number;
      /** @description Confidence under the review threshold of `ml/config/thresholds.yaml` (0.7). */
      needs_review: boolean;
      start_ms: number;
      end_ms: number;
    };
    ResultShot: {
      point_number: number;
      t_ms: number;
      player_position: components['schemas']['PipelinePosition'];
      shot_type: components['schemas']['PipelineShotType'];
      shot_type_confidence: number;
      /** @description Player's foot point at contact. */
      player_at: components['schemas']['CourtPosition'];
      /** @description Ball at contact. */
      ball_at: components['schemas']['CourtPosition'];
      /** @description Estimated, only with 3D positions. */
      speed_kmh: number | null;
      after_bounce: boolean;
      /** @description The ball came off a wall before the shot (salida de pared). */
      off_wall: boolean;
      camera: components['schemas']['CourtEnd'];
    };
    ResultBounce: {
      point_number: number;
      t_ms: number;
      surface: components['schemas']['BounceSurface'];
      ball_at: components['schemas']['CourtPosition'];
      confidence: number;
    };
    /** @description A point changed by serve coherence (section 6, layer 1). */
    ResultCorrection: {
      /** @enum {string} */
      layer: 'serve_coherence';
      point_number: number;
      from_winner_team: components['schemas']['PipelineTeam'];
      to_winner_team: components['schemas']['PipelineTeam'];
    };
    /**
     * @description Stats of one position computed on the device with the versioned formulas of section 7.
     *     `values` keys are the metric names of `ml` (for example `points_won`, `winners`,
     *     `net_time_pct`, `distance_m`); the cloud recomputes them after a score correction.
     */
    ResultStats: {
      position: components['schemas']['PipelinePosition'];
      formula_version: string;
      values: {
        [key: string]: number;
      };
    };
    ResultHighlight: {
      point_number: number;
      /** @description Highlight score of section 7. */
      score: number;
      start_ms: number;
      end_ms: number;
      clip_media_id: components['schemas']['Uuid'] | null;
    };
    ResultCalibration: {
      camera: components['schemas']['CourtEnd'];
      calibration_id: components['schemas']['Uuid'];
      reprojection_error_cm: number;
    };
    ResultModelVersions: {
      player_detector: string;
      ball_tracker: string;
      pose: string;
      shot_classifier: string;
      reid: string;
    };
    /**
     * @description Output of the club pipeline for one match (schema version 1). `points`, `shots` and
     *     `bounces` are each ordered by time; shots and bounces link to their point by
     *     `point_number`. On `status: failed` only the run metadata and `failure` are sent.
     */
    MatchResults: {
      /** @constant */
      schema_version: 1;
      run_id: components['schemas']['Uuid'];
      match_id: components['schemas']['Uuid'];
      /** @enum {string} */
      status: 'succeeded' | 'failed';
      failure?: {
        /** @example ball_tracking */
        stage: string;
        code: string;
      } | null;
      /** @enum {string} */
      processed_on: 'club' | 'cloud';
      pipeline_version: string;
      model_versions: components['schemas']['ResultModelVersions'];
      /** @description Hash of `ml/config/thresholds.yaml` used in the run. */
      thresholds_sha256: string;
      started_at: components['schemas']['Timestamp'];
      finished_at: components['schemas']['Timestamp'];
      video: {
        duration_ms: number;
        fps: number;
        /** @description Fine offset of camera B relative to A, from ball trajectory alignment. */
        camera_offset_ms: number;
      };
      calibrations: components['schemas']['ResultCalibration'][];
      scoring: components['schemas']['ScoringRules'];
      players: components['schemas']['ResultPlayer'][];
      points: components['schemas']['ResultPoint'][];
      shots: components['schemas']['ResultShot'][];
      bounces: components['schemas']['ResultBounce'][];
      score: {
        sets: components['schemas']['SetScore'][];
        winner_team: components['schemas']['PipelineTeam'] | null;
        /** @description False when the turn ended before the match did. */
        completed: boolean;
      };
      corrections: components['schemas']['ResultCorrection'][];
      stats: components['schemas']['ResultStats'][];
      highlights: components['schemas']['ResultHighlight'][];
    };
    MatchResultsAck: {
      match_id: components['schemas']['Uuid'];
      run_id: components['schemas']['Uuid'];
      match_status: components['schemas']['MatchStatus'];
    };
    /** @enum {string} */
    DeviceUploadKind: 'full' | 'clip' | 'reel' | 'thumbnail';
    DeviceUploadRequest: {
      match_id: components['schemas']['Uuid'];
      kind: components['schemas']['DeviceUploadKind'];
      /** @enum {string} */
      content_type: 'video/mp4' | 'image/jpeg';
      size_bytes: number;
      sha256: string;
      duration_ms?: number | null;
      /** @description Required for `kind: clip`. */
      clip?: {
        start_ms: number;
        end_ms: number;
        /** @enum {string} */
        source: 'app' | 'button' | 'auto';
        /** @description The player who tapped in the app, from the court channel. */
        requested_by_user_id?: components['schemas']['Uuid'] | null;
      } | null;
      /** @description Resume an existing upload and get fresh part links. */
      upload_id?: components['schemas']['Uuid'] | null;
    };
    DeviceUploadPart: {
      number: number;
      /**
       * Format: uri
       * @description Signed `PUT` link for this part, valid 1 hour.
       */
      url: string;
    };
    DeviceUpload: {
      upload_id: components['schemas']['Uuid'];
      media_id: components['schemas']['Uuid'];
      part_size_bytes: number;
      /** @description Links for the parts not uploaded yet. */
      parts: components['schemas']['DeviceUploadPart'][];
      expires_at: components['schemas']['Timestamp'];
    };
    DeviceUploadComplete: {
      parts: {
        number: number;
        etag: string;
      }[];
    };
    DeviceUploadDone: {
      upload_id: components['schemas']['Uuid'];
      media_id: components['schemas']['Uuid'];
      /** @enum {string} */
      status: 'ready';
    };
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
    /**
     * @description One of the four tracked players of a match (the 4 tracks of section 5).
     * @enum {integer}
     */
    MatchPosition: 1 | 2 | 3 | 4;
    /**
     * @description Team 1 or 2, fixed by the side of the net at the first serve.
     * @enum {integer}
     */
    Team: 1 | 2;
    /**
     * @description One of the 9 zones of each half (section 7): width `left`, `center`, `right` by depth
     *     `net` (0 to 3 m from the net), `mid` (3 to 6.95 m) and `back` (6.95 to 10 m).
     * @enum {string}
     */
    CourtZone:
      | 'net_left'
      | 'net_center'
      | 'net_right'
      | 'mid_left'
      | 'mid_center'
      | 'mid_right'
      | 'back_left'
      | 'back_center'
      | 'back_right';
    /**
     * @description Shot type from the classifier (section 5, step 9). `unknown` when confidence is under
     *     0.6; it does not count in per-type stats.
     * @enum {string}
     */
    ShotType:
      | 'serve'
      | 'forehand'
      | 'backhand'
      | 'forehand_volley'
      | 'backhand_volley'
      | 'bandeja'
      | 'vibora'
      | 'smash'
      | 'lob'
      | 'wall_exit'
      | 'unknown';
    /** @description Count and outcome of one shot type for a player. */
    ShotTypeStats: {
      shot_type: components['schemas']['ShotType'];
      count: number;
      winners: number;
      errors: number;
    };
    /** @description Points lost whose decisive event was in a zone (section 7, "dónde se fue el partido"). */
    ZoneCount: {
      zone: components['schemas']['CourtZone'];
      points: number;
    };
    /**
     * @description One player's stats for one match (`match_stats`), computed with fixed, versioned formulas
     *     (section 7). Percentages are 0 to 100. `max_ball_speed_kmh` is an estimate and is `null`
     *     without 3D ball positions.
     */
    PlayerMatchStats: {
      /** @example 1.0.0 */
      formula_version: string;
      points_won: number;
      winners: number;
      forced_errors: number;
      unforced_errors: number;
      net_time_pct: number;
      net_approaches: number;
      distance_m: number;
      serve_points_won_pct: number | null;
      first_serve_in_pct: number | null;
      max_ball_speed_kmh: number | null;
      shots_by_type: components['schemas']['ShotTypeStats'][];
      lost_points_by_zone: components['schemas']['ZoneCount'][];
    };
    /**
     * @description One of the four tracked players. `user` is `null` until someone claims the position.
     *     `stats` is `null` for club staff and owner, and before the match is published.
     */
    MatchPlayer: {
      position: components['schemas']['MatchPosition'];
      team: components['schemas']['Team'];
      user: components['schemas']['MatchPlayerUser'] | null;
      /** @description True when the user confirmed the position ("este soy yo"). */
      confirmed: boolean;
      /**
       * @description True when this position is suggested to the caller because they scanned the court QR
       *     and were the closest player to the camera at that moment.
       */
      suggested?: boolean;
      /** @description Thumbnail used to pick "este soy yo". Fetch it with `GET /media/{id}/url`. */
      thumbnail_media_id: components['schemas']['Uuid'] | null;
      stats: components['schemas']['PlayerMatchStats'] | null;
    };
    /** @description Public view of a player inside a match they share with the caller. */
    MatchPlayerUser: {
      id: components['schemas']['Uuid'];
      display_name: string;
      /**
       * Format: uri
       * @description Profile photo (not a video).
       */
      photo_url: string | null;
    };
    /**
     * @description Rule of section 6 that closed the point.
     * @enum {string}
     */
    PointEndReason:
      | 'double_fault'
      | 'own_floor_before_net'
      | 'net'
      | 'rival_wall_before_floor'
      | 'double_bounce'
      | 'out_after_bounce'
      | 'ball_lost';
    /**
     * @description A point with confidence under 0.7 (section 6, layer 2). The app shows its clip so the
     *     players confirm who won it.
     */
    PointToReview: {
      id: components['schemas']['Uuid'];
      number: number;
      set: number;
      game: number;
      winner_team: components['schemas']['Team'];
      end_reason: components['schemas']['PointEndReason'];
      confidence: number;
      clip_media_id: components['schemas']['Uuid'] | null;
    };
    /**
     * @description One sentence about the caller's match (section 7), written from a computed fact, with a
     *     tip for the next match. Text is `es-AR`, produced by the insights pipeline.
     */
    Insight: {
      id: components['schemas']['Uuid'];
      /** @example net_uncovered */
      kind: string;
      text: string;
      tip: string | null;
      order: number;
    };
    /** @enum {string} */
    MediaKind: 'full' | 'clip' | 'reel' | 'thumbnail';
    /**
     * @description `processing` while it is cut, encoded or uploaded; `ready` when a signed link can be
     *     issued; `in_club` when the full video stayed in the club (ask with
     *     `POST /media/{id}/download`); `expired` after it was deleted (full videos after 30 days).
     * @enum {string}
     */
    MediaStatus: 'processing' | 'in_club' | 'ready' | 'expired';
    /** @description A video, clip, reel or thumbnail, by id. Never carries its storage path or URL. */
    MediaAsset: {
      id: components['schemas']['Uuid'];
      kind: components['schemas']['MediaKind'];
      status: components['schemas']['MediaStatus'];
      /** @description `null` for thumbnails. */
      duration_ms: number | null;
      /** @description When the media is deleted (full video 30 days after the match), or `null`. */
      expires_at: components['schemas']['Timestamp'] | null;
    };
    /**
     * @description `app` (tap or cut in the app), `button` (court button) or `auto` (highlight).
     * @enum {string}
     */
    ClipSource: 'app' | 'button' | 'auto';
    Clip: {
      id: components['schemas']['Uuid'];
      match_id: components['schemas']['Uuid'];
      source: components['schemas']['ClipSource'];
      /** @description Offset from the start of the match video. */
      start_ms: number;
      end_ms: number;
      /** @description Automatic highlight score (section 7); `null` for app and button clips. */
      highlight_score: number | null;
      /** @description `null` for button clips and automatic highlights. */
      created_by_user_id: components['schemas']['Uuid'] | null;
      media: components['schemas']['MediaAsset'];
      thumbnail_media_id: components['schemas']['Uuid'] | null;
      created_at: components['schemas']['Timestamp'];
    };
    ClipPage: components['schemas']['Page'] & {
      items: components['schemas']['Clip'][];
    };
    ClipCreate: {
      start_ms: number;
      /** @description After `start_ms`, at most 60 000 ms later. */
      end_ms: number;
    };
    /** @description A match seen by the caller. See `GET /matches/{id}` for what each role gets. */
    MatchDetail: {
      id: components['schemas']['Uuid'];
      /** @enum {string} */
      type: 'match' | 'lesson';
      status: components['schemas']['MatchStatus'];
      starts_at: components['schemas']['Timestamp'];
      ends_at: components['schemas']['Timestamp'];
      club: components['schemas']['EntityRef'];
      court: components['schemas']['EntityRef'];
      /** @description `null` for a recording started by hand from the club panel. */
      booking_id: components['schemas']['Uuid'] | null;
      /** @description True plays golden point at deuce; false plays advantage. */
      golden_point: boolean;
      /** @description Score per set; empty until published. */
      sets: components['schemas']['SetScore'][];
      winner_team: components['schemas']['Team'] | null;
      /** @description The four positions; empty until published. */
      players: components['schemas']['MatchPlayer'][];
      /** @description Points under 0.7 confidence, for the players to confirm. Empty for staff. */
      points_to_review: components['schemas']['PointToReview'][];
      /** @description The caller's 3 insights; `null` for staff and owner or when not a player. */
      insights: components['schemas']['Insight'][] | null;
      full_video: components['schemas']['MediaAsset'] | null;
      /** @description The caller's vertical reel, or `null` until generated. */
      reel: components['schemas']['MediaAsset'] | null;
      published_at: components['schemas']['Timestamp'] | null;
    };
    ClaimPlayerRequest: {
      position: components['schemas']['MatchPosition'];
    };
    ScoreCorrectionFinalScore: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: 'final_score';
      sets: components['schemas']['SetScore'][];
    };
    ScoreCorrectionPointWinner: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: 'point_winner';
      point_id: components['schemas']['Uuid'];
      winner_team: components['schemas']['Team'];
    };
    ScoreCorrectionRequest:
      | components['schemas']['ScoreCorrectionFinalScore']
      | components['schemas']['ScoreCorrectionPointWinner'];
    ScoreCorrection: {
      id: components['schemas']['Uuid'];
      match_id: components['schemas']['Uuid'];
      /** @enum {string} */
      type: 'final_score' | 'point_winner';
      match_status: components['schemas']['MatchStatus'];
      created_at: components['schemas']['Timestamp'];
    };
    /** @description A signed, temporary link. Never store it; ask again when it expires. */
    SignedMediaUrl: {
      media_id: components['schemas']['Uuid'];
      /**
       * Format: uri
       * @description Signed storage URL, valid until `expires_at` (at most 1 hour).
       */
      url: string;
      expires_at: components['schemas']['Timestamp'];
      /**
       * @example video/mp4
       * @example image/jpeg
       */
      content_type: string;
    };
    MediaDownload: {
      media_id: components['schemas']['Uuid'];
      /** @enum {string} */
      status: 'ready' | 'preparing';
      /**
       * Format: uri
       * @description Signed download link valid at most 1 hour; `null` while `preparing`.
       */
      url: string | null;
      expires_at: components['schemas']['Timestamp'] | null;
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
    /** @description Club id. */
    ClubId: components['schemas']['Uuid'];
    /** @description Court id. */
    CourtId: components['schemas']['Uuid'];
    /** @description Match id (must belong to the device's club). */
    DeviceMatchId: components['schemas']['Uuid'];
    /** @description Upload id from `POST /device/uploads`. */
    DeviceUploadId: components['schemas']['Uuid'];
    /** @description Booking id. */
    BookingId: components['schemas']['Uuid'];
    /** @description Match id. */
    MatchId: components['schemas']['Uuid'];
    /** @description Media asset id (video, clip, reel or thumbnail). */
    MediaId: components['schemas']['Uuid'];
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
export type SchemaScoringRules = components['schemas']['ScoringRules'];
export type SchemaDeviceScheduleItem = components['schemas']['DeviceScheduleItem'];
export type SchemaDeviceSchedule = components['schemas']['DeviceSchedule'];
export type SchemaDeviceCameraHealth = components['schemas']['DeviceCameraHealth'];
export type SchemaDeviceHeartbeat = components['schemas']['DeviceHeartbeat'];
export type SchemaDeviceHeartbeatAck = components['schemas']['DeviceHeartbeatAck'];
export type SchemaCourtEnd = components['schemas']['CourtEnd'];
export type SchemaCourtPosition = components['schemas']['CourtPosition'];
export type SchemaPipelinePosition = components['schemas']['PipelinePosition'];
export type SchemaPipelineTeam = components['schemas']['PipelineTeam'];
export type SchemaPipelineShotType = components['schemas']['PipelineShotType'];
export type SchemaBounceSurface = components['schemas']['BounceSurface'];
export type SchemaPipelinePointEndReason = components['schemas']['PipelinePointEndReason'];
export type SchemaResultPlayer = components['schemas']['ResultPlayer'];
export type SchemaResultEventRef = components['schemas']['ResultEventRef'];
export type SchemaResultPoint = components['schemas']['ResultPoint'];
export type SchemaResultShot = components['schemas']['ResultShot'];
export type SchemaResultBounce = components['schemas']['ResultBounce'];
export type SchemaResultCorrection = components['schemas']['ResultCorrection'];
export type SchemaResultStats = components['schemas']['ResultStats'];
export type SchemaResultHighlight = components['schemas']['ResultHighlight'];
export type SchemaResultCalibration = components['schemas']['ResultCalibration'];
export type SchemaResultModelVersions = components['schemas']['ResultModelVersions'];
export type SchemaMatchResults = components['schemas']['MatchResults'];
export type SchemaMatchResultsAck = components['schemas']['MatchResultsAck'];
export type SchemaDeviceUploadKind = components['schemas']['DeviceUploadKind'];
export type SchemaDeviceUploadRequest = components['schemas']['DeviceUploadRequest'];
export type SchemaDeviceUploadPart = components['schemas']['DeviceUploadPart'];
export type SchemaDeviceUpload = components['schemas']['DeviceUpload'];
export type SchemaDeviceUploadComplete = components['schemas']['DeviceUploadComplete'];
export type SchemaDeviceUploadDone = components['schemas']['DeviceUploadDone'];
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
export type SchemaMatchPosition = components['schemas']['MatchPosition'];
export type SchemaTeam = components['schemas']['Team'];
export type SchemaCourtZone = components['schemas']['CourtZone'];
export type SchemaShotType = components['schemas']['ShotType'];
export type SchemaShotTypeStats = components['schemas']['ShotTypeStats'];
export type SchemaZoneCount = components['schemas']['ZoneCount'];
export type SchemaPlayerMatchStats = components['schemas']['PlayerMatchStats'];
export type SchemaMatchPlayer = components['schemas']['MatchPlayer'];
export type SchemaMatchPlayerUser = components['schemas']['MatchPlayerUser'];
export type SchemaPointEndReason = components['schemas']['PointEndReason'];
export type SchemaPointToReview = components['schemas']['PointToReview'];
export type SchemaInsight = components['schemas']['Insight'];
export type SchemaMediaKind = components['schemas']['MediaKind'];
export type SchemaMediaStatus = components['schemas']['MediaStatus'];
export type SchemaMediaAsset = components['schemas']['MediaAsset'];
export type SchemaClipSource = components['schemas']['ClipSource'];
export type SchemaClip = components['schemas']['Clip'];
export type SchemaClipPage = components['schemas']['ClipPage'];
export type SchemaClipCreate = components['schemas']['ClipCreate'];
export type SchemaMatchDetail = components['schemas']['MatchDetail'];
export type SchemaClaimPlayerRequest = components['schemas']['ClaimPlayerRequest'];
export type SchemaScoreCorrectionFinalScore = components['schemas']['ScoreCorrectionFinalScore'];
export type SchemaScoreCorrectionPointWinner = components['schemas']['ScoreCorrectionPointWinner'];
export type SchemaScoreCorrectionRequest = components['schemas']['ScoreCorrectionRequest'];
export type SchemaScoreCorrection = components['schemas']['ScoreCorrection'];
export type SchemaSignedMediaUrl = components['schemas']['SignedMediaUrl'];
export type SchemaMediaDownload = components['schemas']['MediaDownload'];
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
export type ParameterClubId = components['parameters']['ClubId'];
export type ParameterCourtId = components['parameters']['CourtId'];
export type ParameterDeviceMatchId = components['parameters']['DeviceMatchId'];
export type ParameterDeviceUploadId = components['parameters']['DeviceUploadId'];
export type ParameterBookingId = components['parameters']['BookingId'];
export type ParameterMatchId = components['parameters']['MatchId'];
export type ParameterMediaId = components['parameters']['MediaId'];
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
  getDeviceSchedule: {
    parameters: {
      query?: never;
      header?: {
        'If-None-Match'?: string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The schedule. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          ETag?: string;
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "club_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60",
           *       "generated_at": "2026-10-23T21:00:00Z",
           *       "valid_until": "2026-10-25T21:00:00Z",
           *       "items": [
           *         {
           *           "match_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b",
           *           "booking_id": "0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e6f",
           *           "court_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61",
           *           "match_type": "match",
           *           "starts_at": "2026-10-23T22:00:00Z",
           *           "ends_at": "2026-10-23T23:30:00Z",
           *           "record_from": "2026-10-23T21:58:00Z",
           *           "record_until": "2026-10-23T23:32:00Z",
           *           "no_record": false,
           *           "scoring": {
           *             "golden_point": true,
           *             "third_set": "super_tiebreak"
           *           },
           *           "updated_at": "2026-10-22T15:04:00Z"
           *         }
           *       ]
           *     }
           */
          'application/json': components['schemas']['DeviceSchedule'];
        };
      };
      /** @description Unchanged since the given `ETag`. */
      304: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content?: never;
      };
      401: components['responses']['Unauthorized'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  postDeviceHeartbeat: {
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
         *       "sent_at": "2026-10-23T22:41:00Z",
         *       "software_version": "0.4.2",
         *       "uptime_seconds": 86400,
         *       "disk_free_bytes": 1374389534720,
         *       "disk_total_bytes": 2000398934016,
         *       "gpu_temp_c": 71,
         *       "cpu_temp_c": 58.5,
         *       "cameras": [
         *         {
         *           "camera_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a90",
         *           "online": true,
         *           "fps": 25,
         *           "recording": true
         *         },
         *         {
         *           "camera_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a91",
         *           "online": true,
         *           "fps": 24.9,
         *           "recording": true
         *         }
         *       ],
         *       "upload_queue": {
         *         "items": 14,
         *         "bytes": 5368709120,
         *         "eta_minutes": 95
         *       },
         *       "processing_backlog_minutes": 40
         *     }
         */
        'application/json': components['schemas']['DeviceHeartbeat'];
      };
    };
    responses: {
      /** @description Heartbeat stored. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "server_time": "2026-10-23T22:41:00Z",
           *       "desired_software_version": "0.4.2"
           *     }
           */
          'application/json': components['schemas']['DeviceHeartbeatAck'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  postMatchResults: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Match id (must belong to the device's club). */
        id: components['parameters']['DeviceMatchId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['MatchResults'];
      };
    };
    responses: {
      /** @description Results accepted. */
      202: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "match_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b",
           *       "run_id": "0192f0a0-1b2c-7d3e-8f4a-5b6c7d8e9f00",
           *       "match_status": "published"
           *     }
           */
          'application/json': components['schemas']['MatchResultsAck'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      409: components['responses']['Conflict'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  createDeviceUpload: {
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
         *       "match_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b",
         *       "kind": "full",
         *       "content_type": "video/mp4",
         *       "size_bytes": 1073741824,
         *       "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
         *       "duration_ms": 5520000
         *     }
         */
        'application/json': components['schemas']['DeviceUploadRequest'];
      };
    };
    responses: {
      /** @description The upload with its signed part links. */
      201: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "upload_id": "0192f0b0-1b2c-7d3e-8f4a-5b6c7d8e9f01",
           *       "media_id": "0192af6e-7c1a-7d4e-9b3a-2f6c8e1d4a55",
           *       "part_size_bytes": 67108864,
           *       "parts": [
           *         {
           *           "number": 1,
           *           "url": "https://storage.example.com/full/0192af6e.mp4?partNumber=1&uploadId=abc&X-Amz-Signature=1a2b"
           *         }
           *       ],
           *       "expires_at": "2026-10-24T05:00:00Z"
           *     }
           */
          'application/json': components['schemas']['DeviceUpload'];
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
  completeDeviceUpload: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Upload id from `POST /device/uploads`. */
        id: components['parameters']['DeviceUploadId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "parts": [
         *         {
         *           "number": 1,
         *           "etag": "\"a54357aff0632cce46d942af68356b38\""
         *         }
         *       ]
         *     }
         */
        'application/json': components['schemas']['DeviceUploadComplete'];
      };
    };
    responses: {
      /** @description Upload completed. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "upload_id": "0192f0b0-1b2c-7d3e-8f4a-5b6c7d8e9f01",
           *       "media_id": "0192af6e-7c1a-7d4e-9b3a-2f6c8e1d4a55",
           *       "status": "ready"
           *     }
           */
          'application/json': components['schemas']['DeviceUploadDone'];
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
  getMatch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Match id. */
        id: components['parameters']['MatchId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The match. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MatchDetail'];
        };
      };
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  claimMatchPlayer: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Match id. */
        id: components['parameters']['MatchId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "position": 3
         *     }
         */
        'application/json': components['schemas']['ClaimPlayerRequest'];
      };
    };
    responses: {
      /** @description The match, with the caller in the claimed position. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MatchDetail'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      409: components['responses']['Conflict'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  correctMatchScore: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Match id. */
        id: components['parameters']['MatchId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ScoreCorrectionRequest'];
      };
    };
    responses: {
      /** @description Correction accepted; the match is `needs_review` until stats are recomputed. */
      202: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "id": "0192d1e4-5a6b-7c8d-9e0f-1a2b3c4d5e70",
           *       "match_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b",
           *       "type": "final_score",
           *       "match_status": "needs_review",
           *       "created_at": "2026-10-16T01:10:00Z"
           *     }
           */
          'application/json': components['schemas']['ScoreCorrection'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      409: components['responses']['Conflict'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  listMatchClips: {
    parameters: {
      query?: {
        /** @description Opaque cursor from a previous page's `next_cursor`. Omit it for the first page. */
        cursor?: components['parameters']['Cursor'];
        /** @description Maximum number of items in the page. */
        limit?: components['parameters']['Limit'];
      };
      header?: never;
      path: {
        /** @description Match id. */
        id: components['parameters']['MatchId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description One page of clips. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ClipPage'];
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
  createMatchClip: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Match id. */
        id: components['parameters']['MatchId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "start_ms": 1835000,
         *       "end_ms": 1850000
         *     }
         */
        'application/json': components['schemas']['ClipCreate'];
      };
    };
    responses: {
      /** @description The clip, `processing` until its media is ready. */
      202: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "id": "0192af6e-7c1a-7d4e-9b3a-2f6c8e1d4a50",
           *       "match_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5b",
           *       "source": "app",
           *       "start_ms": 1835000,
           *       "end_ms": 1850000,
           *       "highlight_score": null,
           *       "created_by_user_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5f",
           *       "media": {
           *         "id": "0192af6e-7c1a-7d4e-9b3a-2f6c8e1d4a51",
           *         "kind": "clip",
           *         "status": "processing",
           *         "duration_ms": 15000,
           *         "expires_at": null
           *       },
           *       "thumbnail_media_id": null,
           *       "created_at": "2026-10-16T00:05:00Z"
           *     }
           */
          'application/json': components['schemas']['Clip'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      409: components['responses']['Conflict'];
      410: components['responses']['Gone'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  getMediaUrl: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Media asset id (video, clip, reel or thumbnail). */
        id: components['parameters']['MediaId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The signed link. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          /** @description Always `private, no-store`. */
          'Cache-Control'?: string;
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "media_id": "0192af6e-7c1a-7d4e-9b3a-2f6c8e1d4a51",
           *       "url": "https://media.example.com/clips/0192af6e.mp4?X-Amz-Expires=3600&X-Amz-Signature=3f9a",
           *       "expires_at": "2026-10-16T01:05:00Z",
           *       "content_type": "video/mp4"
           *     }
           */
          'application/json': components['schemas']['SignedMediaUrl'];
        };
      };
      401: components['responses']['Unauthorized'];
      404: components['responses']['NotFound'];
      409: components['responses']['Conflict'];
      410: components['responses']['Gone'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  requestMediaDownload: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Media asset id (video, clip, reel or thumbnail). */
        id: components['parameters']['MediaId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The download, ready or being prepared. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MediaDownload'];
        };
      };
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      410: components['responses']['Gone'];
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
}
