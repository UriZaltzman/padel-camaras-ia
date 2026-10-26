import { z } from 'zod';

export const STAFF_ROLES = ['admin', 'sales', 'support', 'finance'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * An internal staff member. Staff always sign in with email, password and a TOTP code (`totp`,
 * see `auth/credentials`): the guard refuses any session that did not use the second factor.
 */
export interface StaffMember {
  userId: string;
  role: StaffRole;
  secondFactor: 'totp';
}

const allowlistSchema = z.record(z.uuid(), z.enum(STAFF_ROLES));

/** Parses `INTERNAL_STAFF`. Anything malformed yields nobody: staff access fails closed. */
export function parseStaffAllowlist(raw: string | undefined): Map<string, StaffMember> {
  const staff = new Map<string, StaffMember>();
  if (!raw?.trim()) return staff;
  try {
    const parsed = allowlistSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return staff;
    for (const [userId, role] of Object.entries(parsed.data)) {
      staff.set(userId, { userId, role, secondFactor: 'totp' });
    }
  } catch {
    // not JSON: nobody is staff
  }
  return staff;
}
