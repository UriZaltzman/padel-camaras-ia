import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClubsModule } from '../clubs/clubs.module';
import { AdminModulesController } from './admin-modules.controller';
import { EnvStaffDirectory, StaffDirectory } from './staff-directory';
import { StaffGuard } from './staff.guard';

/** Internal console API (`/admin/*`): staff only, never reachable with a club or player role. */
@Module({
  imports: [AuthModule, ClubsModule],
  controllers: [AdminModulesController],
  providers: [StaffGuard, { provide: StaffDirectory, useClass: EnvStaffDirectory }],
})
export class AdminModule {}
