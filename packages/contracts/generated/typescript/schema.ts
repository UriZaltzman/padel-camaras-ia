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
  '/lessons': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List the caller's lessons (as coach or as student)
     * @description A coach sees the lessons they teach; a student sees the lessons they take. Newest first.
     */
    get: operations['listLessons'];
    put?: never;
    /**
     * Schedule a lesson (coach)
     * @description A coach of the club books the court for a lesson, with the same availability and
     *     exclusion rules as `POST /bookings`. The booking is created `confirmed` (the coach does
     *     not pay a deposit) with `source: panel` when made from the club panel or `app`
     *     otherwise, and the match that comes from it has `type: lesson` (lesson stats never count
     *     in `/me/stats`).
     *
     *     - **Recording.** `kind: school` (escuelita) is "do not record" by default
     *       (`no_record_reason: club_school`); `record: true` turns it on only when every minor has a
     *       guardian permission on file (section 12).
     *     - **Charging.** With `price_cents` and the club's `lesson_payments_enabled`, each student
     *       pays with `POST /payments/checkout` (`concept: lesson`) into the coach's Mercado Pago
     *       account.
     *     - **Students.** Listed students get a WhatsApp invite and must accept to be linked; a
     *       student that accepts gives the coach access to that lesson's video and stats.
     *
     *     Errors: `BOOKING_SLOT_TAKEN` (409), `BOOKING_SLOT_INVALID` (422), `FORBIDDEN` (the caller
     *     is not a coach of the club), `CLUB_FEATURE_DISABLED` (403, `price_cents` while the club
     *     has lesson payments off), `CLUB_SERVICE_SUSPENDED` (403), `VALIDATION_FAILED` (400).
     */
    post: operations['createLesson'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/lessons/{id}/notes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Add a note, drawing or plan to a lesson (coach)
     * @description The lesson's coach leaves a note for the lesson or for one moment of its video
     *     (`at_ms`), optionally with a drawing over the frame (normalized 0..1 coordinates, so it
     *     scales to any screen) and a plan item for the next lessons. Notes are visible to the
     *     students of the lesson when `visible_to_students` is true.
     *
     *     Errors: `FORBIDDEN` (not the lesson's coach), `NOT_FOUND`, `VALIDATION_FAILED` (400).
     */
    post: operations['addLessonNote'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/coach/students': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List the coach's students and what they shared
     * @description Students who took at least one lesson with the caller. `access` says whether the student
     *     gave the coach access to their matches (section 12); without it the coach sees only the
     *     lessons they taught, and `GET /matches/{id}` of the student's other matches returns
     *     `COACH_ACCESS_NOT_GRANTED`.
     *
     *     Errors: `FORBIDDEN` (the caller is not a coach in any club).
     */
    get: operations['listCoachStudents'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/payments/checkout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Open a Mercado Pago checkout for a deposit, extra or lesson
     * @description Creates a `pending` payment and a Mercado Pago preference in the marketplace model
     *     (section 10): the money goes straight to the club's account (`deposit`,
     *     `player_extra`) or the coach's (`lesson`), and Mercado Pago splits our
     *     `marketplace_fee` in the same payment (10%; 0 for deposits during the pilot). If the
     *     club has not connected its account yet, we collect and transfer in the monthly
     *     settlement. The client opens `checkout_url`; only the webhook changes the payment
     *     status, never the app.
     *
     *     Send an `Idempotency-Key`: retrying with the same key returns the same checkout instead
     *     of a second payment.
     *
     *     Errors: `BOOKING_HOLD_EXPIRED` (409, the 10-minute hold ended), `INVALID_STATE_TRANSITION`
     *     (409, already paid), `CLUB_FEATURE_DISABLED` (403, extra or lesson payments off),
     *     `PAYMENT_PROVIDER_ERROR` (502), `NOT_FOUND` (booking, match or lesson),
     *     `VALIDATION_FAILED` (400).
     */
    post: operations['createCheckout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/webhooks/mercadopago': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Mercado Pago payment notification
     * @description Called by Mercado Pago, not by our clients, so it takes no bearer token: it is
     *     authenticated by the `x-signature` header.
     *
     *     **Signature verification (before anything else):**
     *
     *     1. Parse `x-signature` (`ts=<unix seconds>,v1=<hex>`) into `ts` and `v1`.
     *     2. Build the manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, with `data.id`
     *        from the query string (lower-cased if alphanumeric). Omit a part whose value is
     *        missing.
     *     3. Compute HMAC-SHA256 of the manifest with the webhook secret of the application (from
     *        the secret manager, never in the repo) and compare it with `v1` in constant time.
     *     4. Reject a `ts` more than 5 minutes away from the server clock (replay).
     *
     *     A failure returns `401 WEBHOOK_SIGNATURE_INVALID` and is logged without the body.
     *
     *     **Processing:** the API fetches the payment from Mercado Pago by `data.id` (the body is
     *     never trusted for amounts or status), and applies it once per Mercado Pago payment id
     *     (unique index), even if the notification arrives many times. It moves `payments.status`
     *     and emits `payment.approved` or `payment.refunded`; an approved deposit confirms its
     *     booking. It answers `200` quickly; work that fails is retried from the queue, so
     *     Mercado Pago does not need to resend. Unknown `type` values are acknowledged and
     *     ignored.
     */
    post: operations['receiveMercadoPagoWebhook'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
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
     * @description `private` or `group` lesson, or a `school` (escuelita), which is "do not record" by
     *     default (section 12).
     * @enum {string}
     */
    LessonKind: 'private' | 'group' | 'school';
    LessonCreate: {
      court_id: components['schemas']['Uuid'];
      starts_at: components['schemas']['Timestamp'];
      duration_minutes: components['schemas']['BookingDuration'];
      kind: components['schemas']['LessonKind'];
      /** @description Students with an account. Others join with the invite link. */
      student_ids?: components['schemas']['Uuid'][];
      /** @description Price per student in ARS cents, or `null` if the lesson is not charged in the app. */
      price_cents?: number | null;
      /**
       * @description Record the lesson. Defaults to true, and to false for `school`. A minor without a
       *     guardian permission is never recorded.
       */
      record?: boolean;
      /** @description What the lesson works on, shown to the students. */
      focus?: string | null;
    };
    LessonStudent: {
      user: components['schemas']['EntityRef'];
      accepted: boolean;
      /** @description Status of this student's lesson payment, or `null` if not charged or not started. */
      payment_status: components['schemas']['PaymentStatus'] | null;
    };
    Lesson: {
      id: components['schemas']['Uuid'];
      club: components['schemas']['EntityRef'];
      court: components['schemas']['EntityRef'];
      coach: components['schemas']['EntityRef'];
      kind: components['schemas']['LessonKind'];
      starts_at: components['schemas']['Timestamp'];
      ends_at: components['schemas']['Timestamp'];
      booking_id: components['schemas']['Uuid'];
      booking_status: components['schemas']['BookingStatus'];
      /** @description The recorded lesson (`type: lesson`), once recording started. */
      match_id: components['schemas']['Uuid'] | null;
      students: components['schemas']['LessonStudent'][];
      price_cents: number | null;
      no_record: boolean;
      no_record_reason: components['schemas']['NoRecordReason'] | null;
      focus: string | null;
      notes_count: number;
    };
    LessonPage: components['schemas']['Page'] & {
      items: components['schemas']['Lesson'][];
    };
    DrawingStroke: {
      color: string;
      /** @description Stroke width as a fraction of the frame width. */
      width: number;
      /** @description `[x, y]` pairs, each 0..1 relative to the video frame. */
      points: number[][];
    };
    /** @description A drawing over one video frame. */
    Drawing: {
      strokes: components['schemas']['DrawingStroke'][];
    };
    LessonNoteCreate: {
      text: string;
      /** @description Moment of the lesson video the note refers to, or `null` for the whole lesson. */
      at_ms?: number | null;
      /** @description The student the note is for, or `null` for all of them. */
      student_id?: components['schemas']['Uuid'] | null;
      /** @description Requires `at_ms`. */
      drawing?: components['schemas']['Drawing'] | null;
      /** @description True marks the note as a plan item for the next lessons. */
      is_plan?: boolean;
      /** @description Defaults to true. */
      visible_to_students?: boolean;
    };
    LessonNote: {
      id: components['schemas']['Uuid'];
      lesson_id: components['schemas']['Uuid'];
      text: string;
      at_ms: number | null;
      student_id: components['schemas']['Uuid'] | null;
      drawing: components['schemas']['Drawing'] | null;
      is_plan: boolean;
      visible_to_students: boolean;
      created_at: components['schemas']['Timestamp'];
    };
    /**
     * @description What the student shares with the coach: `lessons_only` (the lessons this coach taught)
     *     or `matches_and_lessons` (also their matches and stats, section 12).
     * @enum {string}
     */
    CoachAccess: 'lessons_only' | 'matches_and_lessons';
    CoachStudent: {
      user: components['schemas']['EntityRef'];
      access: components['schemas']['CoachAccess'];
      lessons_count: number;
      last_lesson_at: components['schemas']['Timestamp'] | null;
      pending_payment_cents: components['schemas']['AmountCents'];
    };
    CoachStudentPage: components['schemas']['Page'] & {
      items: components['schemas']['CoachStudent'][];
    };
    /**
     * @description `payments.concept`. Players pay `deposit`, `player_extra` and `lesson` through checkout;
     *     `subscription` is the club's monthly fee, charged by a Mercado Pago subscription in our
     *     company's name (never through checkout).
     * @enum {string}
     */
    PaymentConcept: 'deposit' | 'player_extra' | 'lesson' | 'subscription';
    CheckoutDeposit: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      concept: 'deposit';
      booking_id: components['schemas']['Uuid'];
    };
    CheckoutPlayerExtra: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      concept: 'player_extra';
      match_id: components['schemas']['Uuid'];
    };
    CheckoutLesson: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      concept: 'lesson';
      lesson_id: components['schemas']['Uuid'];
    };
    /** @description What is being paid. The amount comes from the server, never from the client. */
    CheckoutRequest:
      | components['schemas']['CheckoutDeposit']
      | components['schemas']['CheckoutPlayerExtra']
      | components['schemas']['CheckoutLesson'];
    Checkout: {
      payment_id: components['schemas']['Uuid'];
      concept: components['schemas']['PaymentConcept'];
      status: components['schemas']['PaymentStatus'];
      amount_cents: components['schemas']['AmountCents'];
      marketplace_fee_cents: components['schemas']['AmountCents'];
      /**
       * @description Whose Mercado Pago account receives the money: the `club`, the `coach`, or
       *     `platform` when the club or coach has not connected an account yet (we transfer in
       *     the monthly settlement).
       * @enum {string}
       */
      payee: 'club' | 'coach' | 'platform';
      /**
       * Format: uri
       * @description Mercado Pago checkout (`init_point`) to open in the browser or app.
       */
      checkout_url: string;
      /** @description For deposits, the end of the 10-minute hold. */
      expires_at: components['schemas']['Timestamp'] | null;
    };
    /**
     * @description Body Mercado Pago sends (webhooks v1). Only `type` and `data.id` are used; amounts and
     *     status are always read back from Mercado Pago's API.
     */
    MercadoPagoNotification: {
      id?: number;
      live_mode?: boolean;
      /** @example payment */
      type: string;
      date_created?: string;
      user_id?: number;
      api_version?: string;
      /**
       * @example payment.created
       * @example payment.updated
       */
      action?: string;
      data: {
        id: string;
      };
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
    /** @description Lesson id. */
    LessonId: components['schemas']['Uuid'];
    /** @description Court id. */
    CourtId: components['schemas']['Uuid'];
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
export type SchemaLessonKind = components['schemas']['LessonKind'];
export type SchemaLessonCreate = components['schemas']['LessonCreate'];
export type SchemaLessonStudent = components['schemas']['LessonStudent'];
export type SchemaLesson = components['schemas']['Lesson'];
export type SchemaLessonPage = components['schemas']['LessonPage'];
export type SchemaDrawingStroke = components['schemas']['DrawingStroke'];
export type SchemaDrawing = components['schemas']['Drawing'];
export type SchemaLessonNoteCreate = components['schemas']['LessonNoteCreate'];
export type SchemaLessonNote = components['schemas']['LessonNote'];
export type SchemaCoachAccess = components['schemas']['CoachAccess'];
export type SchemaCoachStudent = components['schemas']['CoachStudent'];
export type SchemaCoachStudentPage = components['schemas']['CoachStudentPage'];
export type SchemaPaymentConcept = components['schemas']['PaymentConcept'];
export type SchemaCheckoutDeposit = components['schemas']['CheckoutDeposit'];
export type SchemaCheckoutPlayerExtra = components['schemas']['CheckoutPlayerExtra'];
export type SchemaCheckoutLesson = components['schemas']['CheckoutLesson'];
export type SchemaCheckoutRequest = components['schemas']['CheckoutRequest'];
export type SchemaCheckout = components['schemas']['Checkout'];
export type SchemaMercadoPagoNotification = components['schemas']['MercadoPagoNotification'];
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
export type ParameterLessonId = components['parameters']['LessonId'];
export type ParameterCourtId = components['parameters']['CourtId'];
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
  listLessons: {
    parameters: {
      query?: {
        /** @description Opaque cursor from a previous page's `next_cursor`. Omit it for the first page. */
        cursor?: components['parameters']['Cursor'];
        /** @description Maximum number of items in the page. */
        limit?: components['parameters']['Limit'];
        /** @description `coach` (default for users with a coach membership) or `student`. */
        role?: 'coach' | 'student';
        /** @description Coach only. Lessons with this student. */
        student_id?: components['schemas']['Uuid'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description One page of lessons. */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LessonPage'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  createLesson: {
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
         *       "starts_at": "2026-10-24T13:00:00Z",
         *       "duration_minutes": 60,
         *       "kind": "private",
         *       "student_ids": [
         *         "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5f"
         *       ],
         *       "price_cents": 2500000,
         *       "record": true,
         *       "focus": "Bandeja y salida de pared"
         *     }
         */
        'application/json': components['schemas']['LessonCreate'];
      };
    };
    responses: {
      /** @description The lesson. */
      201: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Lesson'];
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
  addLessonNote: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Lesson id. */
        id: components['parameters']['LessonId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "text": "Cerrá antes la paleta en la bandeja.",
         *       "at_ms": 845000,
         *       "student_id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5f",
         *       "drawing": {
         *         "strokes": [
         *           {
         *             "color": "#FFD400",
         *             "width": 0.006,
         *             "points": [
         *               [
         *                 0.42,
         *                 0.31
         *               ],
         *               [
         *                 0.47,
         *                 0.36
         *               ]
         *             ]
         *           }
         *         ]
         *       },
         *       "visible_to_students": true
         *     }
         */
        'application/json': components['schemas']['LessonNoteCreate'];
      };
    };
    responses: {
      /** @description The note. */
      201: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LessonNote'];
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
  listCoachStudents: {
    parameters: {
      query?: {
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
      /** @description One page of students. */
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
           *           "user": {
           *             "id": "01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5f",
           *             "name": "Sofía Pérez"
           *           },
           *           "access": "matches_and_lessons",
           *           "lessons_count": 6,
           *           "last_lesson_at": "2026-10-17T13:00:00Z",
           *           "pending_payment_cents": 0
           *         }
           *       ],
           *       "next_cursor": null
           *     }
           */
          'application/json': components['schemas']['CoachStudentPage'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      429: components['responses']['TooManyRequests'];
      500: components['responses']['InternalError'];
    };
  };
  createCheckout: {
    parameters: {
      query?: never;
      header: {
        /** @description Client-generated UUID, unique per intended payment. */
        'Idempotency-Key': components['schemas']['Uuid'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CheckoutRequest'];
      };
    };
    responses: {
      /** @description The checkout to open. */
      201: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "payment_id": "0192f1e4-5a6b-7c8d-9e0f-1a2b3c4d5e6f",
           *       "concept": "deposit",
           *       "status": "pending",
           *       "amount_cents": 1200000,
           *       "marketplace_fee_cents": 0,
           *       "payee": "club",
           *       "checkout_url": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123-abc",
           *       "expires_at": "2026-10-23T21:10:00Z"
           *     }
           */
          'application/json': components['schemas']['Checkout'];
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
  receiveMercadoPagoWebhook: {
    parameters: {
      query: {
        /** @description Id of the notified resource (the Mercado Pago payment id). */
        'data.id': string;
        /** @description Notification type, e.g. `payment`. */
        type?: string;
      };
      header: {
        /**
         * @description `ts=<unix seconds>,v1=<HMAC-SHA256 hex>`.
         * @example ts=1729551000,v1=2b6f0c7a9e
         */
        'x-signature': string;
        /** @description Mercado Pago's request id; part of the signed manifest. */
        'x-request-id': string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        /**
         * @example {
         *       "id": 12345678901,
         *       "live_mode": true,
         *       "type": "payment",
         *       "date_created": "2026-10-23T21:02:11Z",
         *       "user_id": 44444444,
         *       "api_version": "v1",
         *       "action": "payment.updated",
         *       "data": {
         *         "id": "98765432100"
         *       }
         *     }
         */
        'application/json': components['schemas']['MercadoPagoNotification'];
      };
    };
    responses: {
      /** @description Acknowledged (processed now, queued, duplicate or ignored). */
      200: {
        headers: {
          'X-Request-Id': components['headers']['X-Request-Id'];
          [name: string]: unknown;
        };
        content?: never;
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
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
