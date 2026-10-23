import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClubsModule } from '../clubs/clubs.module';
import { CrmController } from './crm.controller';
import { CrmRepository } from './crm.repository';
import { CrmService } from './crm.service';
import { PrismaCrmRepository } from './prisma-crm.repository';

@Module({
  imports: [AuthModule, ClubsModule],
  controllers: [CrmController],
  providers: [CrmService, { provide: CrmRepository, useClass: PrismaCrmRepository }],
})
export class CrmModule {}
