import { z } from 'zod';

export const STAFF_ROLES = ['admin', 'sales', 'support', 'finance'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * An internal staff member. `secondFactor` is where 2FA plugs in: today the allowlist vouches
 * for the account (`none`); once TOTP exists the guard also demands a verified second factor
 * for every record that has one enrolled.
 */
export interface StaffMember {
  userId: string;
  role: StaffRole;
  secondFactor: 'none';
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
      staff.set(userId, { userId, role, secondFactor: 'none' });
    }
  } catch {
    // not JSON: nobody is staff
  }
  return staff;
}
