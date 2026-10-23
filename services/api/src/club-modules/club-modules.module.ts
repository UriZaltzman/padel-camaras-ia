import { Global, Module } from '@nestjs/common';
import { ClubModulesController } from './club-modules.controller';
import { ClubModulesRepository } from './club-modules.repository';
import { ClubModulesService } from './club-modules.service';
import { PrismaClubModulesRepository } from './prisma-club-modules.repository';
import { RequiresModuleGuard } from './requires-module.guard';

/** Global so any feature module can use `@RequiresModule(...)` without importing it. */
@Global()
@Module({
  controllers: [ClubModulesController],
  providers: [
    ClubModulesService,
    RequiresModuleGuard,
    { provide: ClubModulesRepository, useClass: PrismaClubModulesRepository },
  ],
  exports: [ClubModulesService, RequiresModuleGuard],
})
export class ClubModulesModule {}
