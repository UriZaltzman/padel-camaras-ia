/** Roles a user can hold in a club (`memberships.role`). */
export type ClubRole = 'owner' | 'staff' | 'coach' | 'player';

/** What a role can do inside a club (spec section 12). The database enforces rows; this enforces actions. */
export type ClubPermission =
  /** Bookings, camera status, the club's matches (no personal stats), cutting a recording. */
  | 'club.operate'
  /** Income and settlements. */
  | 'club.read_revenue'
  /** Booking rules, prices, charge settings. */
  | 'club.update_settings'
  /** Granting and revoking roles. */
  | 'club.manage_members';

const ROLE_PERMISSIONS: Record<ClubRole, readonly ClubPermission[]> = {
  owner: ['club.operate', 'club.read_revenue', 'club.update_settings', 'club.manage_members'],
  staff: ['club.operate'],
  coach: [],
  player: [],
};

/** Strongest first: a user who is both coach and player acts as coach. */
const ROLE_ORDER: readonly ClubRole[] = ['owner', 'staff', 'coach', 'player'];

export function can(role: ClubRole, permission: ClubPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function strongestRole(roles: readonly ClubRole[]): ClubRole | null {
  return ROLE_ORDER.find((role) => roles.includes(role)) ?? null;
}
