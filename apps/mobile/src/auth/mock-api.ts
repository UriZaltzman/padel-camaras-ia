// In-memory mock of the auth endpoints of packages/contracts/openapi/openapi.yaml, used in
// dev (EXPO_PUBLIC_API_MOCK=true) and tests until the backend implements them. It follows the
// contract: OtpChallenge on request, OTP_INVALID with attempts_remaining, OTP_EXPIRED,
// OTP_ATTEMPTS_EXCEEDED, 403 TERMS_NOT_ACCEPTED for new accounts without consent, and refresh
// token rotation with reuse detection.
import type { Schema } from '@app/contracts';

type ErrorCode = Schema<'ErrorCode'>;

export interface MockAuthOptions {
  /** Phones that already have an account (no consent needed). */
  existingPhones?: string[];
  /** The code every OTP request "sends". */
  code?: string;
  /** New Google/Apple users need consent unless listed here. */
  existingOAuth?: boolean;
}

export interface MockAuthServer {
  fetch: (input: Request) => Promise<Response>;
  /** Simulate the 5-minute expiry of the current code. */
  expireCode(): void;
  /** Make the next authenticated request fail with ACCESS_TOKEN_EXPIRED. */
  expireAccessToken(): void;
  /** Bodies of every request received, by path. */
  requests: { path: string; body: unknown }[];
}

const MAX_ATTEMPTS = 5;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'mock' },
  });
}

function error(status: number, code: ErrorCode, details?: Record<string, unknown>): Response {
  return json(status, { code, message: code, ...(details ? { details } : {}) });
}

export function createMockAuthServer(options: MockAuthOptions = {}): MockAuthServer {
  const code = options.code ?? '123456';
  const accounts = new Set(options.existingPhones ?? []);
  const challenges = new Map<string, { expired: boolean; attempts: number }>();
  const validRefresh = new Set<string>();
  const validAccess = new Set<string>();
  let counter = 0;
  const requests: MockAuthServer['requests'] = [];

  function session(phone: string | null, isNew: boolean): Response {
    counter += 1;
    const access = `access-${counter}`;
    const refresh = `refresh-${counter}`;
    validAccess.add(access);
    validRefresh.add(refresh);
    const now = new Date().toISOString();
    const user: Schema<'User'> = {
      id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5f',
      display_name: 'Sofía Pérez',
      phone,
      email: null,
      photo_url: null,
      declared_category: null,
      dominant_hand: null,
      playing_side: null,
      birth_date: null,
      training_opt_out: false,
      terms_version: '2026-10-01',
      terms_accepted_at: now,
      privacy_version: '2026-10-01',
      created_at: now,
    } as Schema<'User'>;
    return json(200, {
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      expires_in: 900,
      is_new_user: isNew,
      user,
    });
  }

  async function handle(input: Request): Promise<Response> {
    const path = new URL(input.url).pathname.replace(/^.*\/v1/, '');
    const body: Record<string, unknown> =
      input.method === 'POST' ? ((await input.json()) as Record<string, unknown>) : {};
    requests.push({ path, body });

    switch (path) {
      case '/auth/otp/whatsapp': {
        challenges.set(String(body.phone), { expired: false, attempts: 0 });
        return json(202, { expires_in_seconds: 300, resend_after_seconds: 60 });
      }
      case '/auth/otp/verify': {
        const phone = String(body.phone);
        const challenge = challenges.get(phone);
        if (!challenge || challenge.expired) return error(401, 'OTP_EXPIRED');
        if (challenge.attempts >= MAX_ATTEMPTS) return error(401, 'OTP_ATTEMPTS_EXCEEDED');
        if (body.code !== code) {
          challenge.attempts += 1;
          if (challenge.attempts >= MAX_ATTEMPTS) return error(401, 'OTP_ATTEMPTS_EXCEEDED');
          return error(401, 'OTP_INVALID', {
            attempts_remaining: MAX_ATTEMPTS - challenge.attempts,
          });
        }
        const isNew = !accounts.has(phone);
        // The code stays valid so the app can retry with consent.
        if (isNew && !body.consent) return error(403, 'TERMS_NOT_ACCEPTED');
        challenges.delete(phone);
        accounts.add(phone);
        return session(phone, isNew);
      }
      case '/auth/oauth/google':
      case '/auth/oauth/apple': {
        if (!options.existingOAuth && !body.consent) return error(403, 'TERMS_NOT_ACCEPTED');
        return session(null, !options.existingOAuth);
      }
      case '/auth/refresh': {
        const token = String(body.refresh_token);
        if (!validRefresh.has(token)) {
          validRefresh.clear();
          return error(401, 'REFRESH_TOKEN_INVALID');
        }
        validRefresh.delete(token);
        counter += 1;
        const pair = { access: `access-${counter}`, refresh: `refresh-${counter}` };
        validAccess.add(pair.access);
        validRefresh.add(pair.refresh);
        return json(200, {
          access_token: pair.access,
          refresh_token: pair.refresh,
          token_type: 'Bearer',
          expires_in: 900,
        });
      }
      default: {
        const auth = input.headers.get('Authorization')?.replace('Bearer ', '');
        if (!auth) return error(401, 'UNAUTHENTICATED');
        if (!validAccess.has(auth)) return error(401, 'ACCESS_TOKEN_EXPIRED');
        return error(404, 'NOT_FOUND');
      }
    }
  }

  return {
    fetch: handle,
    requests,
    expireCode() {
      for (const c of challenges.values()) c.expired = true;
    },
    expireAccessToken() {
      validAccess.clear();
    },
  };
}
