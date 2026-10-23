/** Argentina has no daylight saving: a fixed UTC-3 offset gives the local calendar day. */
const BUENOS_AIRES_OFFSET_MS = -3 * 60 * 60 * 1000;

export const DUNNING_STAGES = ['current', 'notice', 'banner', 'restricted', 'suspended'] as const;
export type DunningStage = (typeof DUNNING_STAGES)[number];

/** Days after the due date at which each stage starts (section 5 of the billing plan). */
export const DUNNING_THRESHOLD_DAYS = {
  notice: 1,
  banner: 7,
  restricted: 15,
  suspended: 30,
} as const;

function localDay(date: Date): number {
  return Math.floor((date.getTime() + BUENOS_AIRES_OFFSET_MS) / 86_400_000);
}

/** Whole local calendar days between the due date and `now`; 0 on the due day, never negative. */
export function daysOverdue(dueAt: Date, now: Date): number {
  return Math.max(0, localDay(now) - localDay(dueAt));
}

export function stageForDays(days: number): DunningStage {
  if (days >= DUNNING_THRESHOLD_DAYS.suspended) return 'suspended';
  if (days >= DUNNING_THRESHOLD_DAYS.restricted) return 'restricted';
  if (days >= DUNNING_THRESHOLD_DAYS.banner) return 'banner';
  if (days >= DUNNING_THRESHOLD_DAYS.notice) return 'notice';
  return 'current';
}

export function dunningStage(dueAt: Date, now: Date): DunningStage {
  return stageForDays(daysOverdue(dueAt, now));
}

/**
 * What the club keeps while it owes: everything until `restricted`; then new bookings and
 * exports stop; at `suspended` the service is cut (recording and reads stop too).
 */
export interface ServiceAccess {
  showDebtBanner: boolean;
  canCreateBookings: boolean;
  canRecord: boolean;
}

export function accessFor(stage: DunningStage): ServiceAccess {
  return {
    showDebtBanner: stage === 'banner' || stage === 'restricted' || stage === 'suspended',
    canCreateBookings: stage !== 'restricted' && stage !== 'suspended',
    canRecord: stage !== 'suspended',
  };
}
