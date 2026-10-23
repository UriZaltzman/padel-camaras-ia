export interface OtpRecord {
  /** HMAC of phone and code; the code itself is never stored. */
  codeHash: string;
  /** Wrong or in-progress attempts so far. */
  attempts: number;
  issuedAt: number;
  expiresAt: number;
}

/** Where pending one-time codes live. One record per phone: asking again replaces it. */
export interface OtpStore {
  get(phone: string): Promise<OtpRecord | null>;
  put(phone: string, record: OtpRecord, ttlSeconds: number): Promise<void>;
  /** Atomically adds one attempt; returns the new count, or null if there is no record. */
  addAttempt(phone: string): Promise<number | null>;
  /** Gives back an attempt (a correct code that could not be used yet). */
  refundAttempt(phone: string): Promise<void>;
  /** Removes the record. True only for the one caller that removed it (single use). */
  remove(phone: string): Promise<boolean>;
}

export const OTP_STORE = Symbol('OTP_STORE');

export class InMemoryOtpStore implements OtpStore {
  private readonly records = new Map<string, OtpRecord>();

  get(phone: string): Promise<OtpRecord | null> {
    const record = this.records.get(phone);
    return Promise.resolve(record ? { ...record } : null);
  }

  put(phone: string, record: OtpRecord): Promise<void> {
    this.records.set(phone, { ...record });
    return Promise.resolve();
  }

  addAttempt(phone: string): Promise<number | null> {
    const record = this.records.get(phone);
    if (!record) return Promise.resolve(null);
    record.attempts += 1;
    return Promise.resolve(record.attempts);
  }

  refundAttempt(phone: string): Promise<void> {
    const record = this.records.get(phone);
    if (record && record.attempts > 0) record.attempts -= 1;
    return Promise.resolve();
  }

  remove(phone: string): Promise<boolean> {
    return Promise.resolve(this.records.delete(phone));
  }
}
