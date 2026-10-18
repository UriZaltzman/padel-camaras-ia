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
}
