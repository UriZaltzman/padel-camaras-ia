/** Time source, injected so tests can move time without waiting. */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };

/** Test double: starts at a fixed instant and only moves when told to. */
export class FakeClock implements Clock {
  constructor(private current: Date = new Date('2026-11-01T12:00:00.000Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}
