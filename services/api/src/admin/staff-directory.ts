import { Inject, Injectable } from '@nestjs/common';
import type { Env } from '../config/env';
import { ENV } from '../config/env.module';
import { parseStaffAllowlist, type StaffMember } from './staff';

/** Who is internal staff. Separate from club memberships: a club role never makes staff. */
export abstract class StaffDirectory {
  abstract find(userId: string): Promise<StaffMember | null>;
}

@Injectable()
export class EnvStaffDirectory extends StaffDirectory {
  private readonly staff: Map<string, StaffMember>;

  constructor(@Inject(ENV) env: Env) {
    super();
    this.staff = parseStaffAllowlist(env.INTERNAL_STAFF);
  }

  find(userId: string): Promise<StaffMember | null> {
    return Promise.resolve(this.staff.get(userId) ?? null);
  }
}

export class InMemoryStaffDirectory extends StaffDirectory {
  readonly members = new Map<string, StaffMember>();
  find(userId: string): Promise<StaffMember | null> {
    return Promise.resolve(this.members.get(userId) ?? null);
  }
}
