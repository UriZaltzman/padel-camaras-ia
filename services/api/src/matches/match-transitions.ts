import { canTransition, matchStatusMachine, type components } from '@app/contracts';
import { AppError } from '../errors/app-error';

export type MatchStatus = components['schemas']['MatchStatus'];

/** Throws `INVALID_STATE_TRANSITION` unless the contract's table (section 3) allows `from` -> `to`. */
export function assertMatchTransition(from: MatchStatus, to: MatchStatus): void {
  if (!canTransition(matchStatusMachine, from, to)) {
    throw new AppError('INVALID_STATE_TRANSITION', { from, to });
  }
}
