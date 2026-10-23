/** Roles the RLS policies understand (`app.role`, migration `row_level_security`). */
export const DB_ROLES = [
  'player',
  'coach',
  'staff',
  'owner',
  'support',
  'club_device',
  'system',
] as const;
export type DbRole = (typeof DB_ROLES)[number];

/**
 * Who a database transaction acts as. It becomes `app.user_id`, `app.club_id` and `app.role`
 * for the transaction, and the policies decide what rows are visible. No context, no rows.
 */
export interface DbContext {
  role: DbRole;
  /** The authenticated user; absent for devices and jobs. */
  userId?: string;
  /** The club the request acts on; absent for a player's own data. */
  clubId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Throws on a context that would reach the database malformed (a bug, never user input). */
export function assertValidContext(ctx: DbContext): void {
  if (!DB_ROLES.includes(ctx.role)) {
    throw new Error(`Invalid database role: ${String(ctx.role)}`);
  }
  for (const [name, value] of [
    ['userId', ctx.userId],
    ['clubId', ctx.clubId],
  ] as const) {
    if (value !== undefined && !UUID.test(value)) {
      throw new Error(`Invalid database context ${name}`);
    }
  }
}
