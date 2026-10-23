import type { DomainEvent } from '@app/contracts';
import type { DbContext } from '../db/db-context';

/**
 * The database context a consumer must use for an event: the `system` role pinned to the club the
 * event carries. Consumers never take the club from anywhere else (a job payload, a header) and
 * never run an event unscoped, so a bad or forged event can only touch the club it names.
 * An event without a club (a nullable `club_id`) is refused: it cannot be authorised.
 */
export function systemContextFor(event: DomainEvent): DbContext {
  const clubId = (event.payload as { club_id?: string | null }).club_id;
  if (typeof clubId !== 'string' || clubId === '') {
    throw new Error(`Event ${event.event_type} carries no club_id; refusing to process it`);
  }
  return { role: 'system', clubId };
}
