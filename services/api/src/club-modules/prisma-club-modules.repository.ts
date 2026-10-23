import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { DbContext } from '../db/db-context';
import { newId } from '../db/ids';
import { PrismaService } from '../db/prisma.service';
import { AppError } from '../errors/app-error';
import { DEFAULT_MODULES, type ClubModules } from './club-modules';
import { ClubModulesRepository, type ModulesAudit } from './club-modules.repository';

type Row = Prisma.ClubModulesGetPayload<object>;

function toModules(row: Row): ClubModules {
  return {
    deposit: {
      enabled: row.depositEnabled,
      kind: row.depositKind as ClubModules['deposit']['kind'],
      percent: row.depositPercent,
      amount_cents: row.depositAmountCents,
    },
    branding: {
      mode: row.brandingMode as ClubModules['branding']['mode'],
      logo_url: row.brandingLogoUrl,
      primary_color: row.primaryColor,
      secondary_color: row.secondaryColor,
    },
    lesson_mode: row.lessonMode as ClubModules['lesson_mode'],
    ai_video: row.aiVideo as ClubModules['ai_video'],
    tournaments: row.tournaments,
  };
}

const toData = (m: ClubModules) => ({
  depositEnabled: m.deposit.enabled,
  depositKind: m.deposit.kind,
  depositPercent: m.deposit.percent,
  depositAmountCents: m.deposit.amount_cents,
  brandingMode: m.branding.mode,
  brandingLogoUrl: m.branding.logo_url,
  primaryColor: m.branding.primary_color,
  secondaryColor: m.branding.secondary_color,
  lessonMode: m.lesson_mode,
  aiVideo: m.ai_video,
  tournaments: m.tournaments,
});

@Injectable()
export class PrismaClubModulesRepository extends ClubModulesRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async find(ctx: DbContext, clubId: string): Promise<ClubModules | null> {
    const row = await this.db.run(ctx, (tx) => tx.clubModules.findUnique({ where: { clubId } }));
    return row ? toModules(row) : null;
  }

  async replace(
    ctx: DbContext,
    clubId: string,
    modules: ClubModules,
    audit: ModulesAudit,
  ): Promise<void> {
    await this.db.run(ctx, async (tx) => {
      if (!(await tx.club.findUnique({ where: { id: clubId }, select: { id: true } }))) {
        throw new AppError('NOT_FOUND');
      }
      const previous = await tx.clubModules.findUnique({ where: { clubId } });
      const data = toData(modules);
      await tx.clubModules.upsert({
        where: { clubId },
        create: { clubId, ...data },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          id: newId(),
          clubId,
          actorUserId: audit.actorUserId,
          action: 'club.modules_update',
          entityType: 'club',
          entityId: clubId,
          requestId: audit.requestId,
          before: (previous
            ? toModules(previous)
            : DEFAULT_MODULES) as unknown as Prisma.InputJsonValue,
          after: modules as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }
}
