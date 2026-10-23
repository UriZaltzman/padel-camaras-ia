export interface RefreshRecord {
  id: string;
  /** SHA-256 of the secret part of the token; the token itself is never stored. */
  secretHash: string;
  userId: string;
  /** All tokens descending from one sign-in share a family; reuse revokes the family. */
  familyId: string;
  used: boolean;
}

/** Where refresh tokens and revoked sessions live. */
export interface SessionStore {
  save(record: RefreshRecord, ttlSeconds: number): Promise<void>;
  /**
   * Marks the token as used in one atomic step and returns it as it was before (`used` tells
   * whether it had been used already). Null if unknown or expired.
   */
  markUsed(id: string): Promise<RefreshRecord | null>;
  revokeFamily(familyId: string, ttlSeconds: number): Promise<void>;
  isFamilyRevoked(familyId: string): Promise<boolean>;
}

export const SESSION_STORE = Symbol('SESSION_STORE');

export class InMemorySessionStore implements SessionStore {
  private readonly tokens = new Map<string, RefreshRecord>();
  private readonly revoked = new Set<string>();

  save(record: RefreshRecord): Promise<void> {
    this.tokens.set(record.id, { ...record });
    return Promise.resolve();
  }

  markUsed(id: string): Promise<RefreshRecord | null> {
    const record = this.tokens.get(id);
    if (!record) return Promise.resolve(null);
    const before = { ...record };
    record.used = true;
    return Promise.resolve(before);
  }

  revokeFamily(familyId: string): Promise<void> {
    this.revoked.add(familyId);
    return Promise.resolve();
  }

  isFamilyRevoked(familyId: string): Promise<boolean> {
    return Promise.resolve(this.revoked.has(familyId));
  }
}
