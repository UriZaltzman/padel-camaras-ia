import { Controller, Get, Param } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_MODULES,
  findModuleIssues,
  isModuleOn,
  type ClubModules,
  type ModuleName,
} from '../../src/club-modules/club-modules';
import { RequiresModule } from '../../src/club-modules/requires-module.guard';
import { createTestApp } from '../helpers';

const CLUB = '0190a1b2-0000-7000-8000-000000000001';

@Controller('probe')
class ProbeController {
  @Get(':id/tournaments')
  @RequiresModule('tournaments')
  tournaments(@Param('id') id: string) {
    return { id };
  }
  @Get(':id/video')
  @RequiresModule('ai_video')
  video() {
    return { ok: true };
  }
}

const withModules = (patch: Partial<ClubModules>): ClubModules => ({
  ...DEFAULT_MODULES,
  ...patch,
});

describe('club modules', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp([ProbeController]);
  });
  afterAll(() => ctx.app.close());
  const http = () => request(ctx.app.getHttpServer());

  it('everything optional is off for a club with no flags', async () => {
    const response = await http().get(`/v1/clubs/${CLUB}/modules`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(DEFAULT_MODULES);
  });

  it('a disabled module answers 403 CLUB_FEATURE_DISABLED, an enabled one passes', async () => {
    const off = await http().get(`/v1/probe/${CLUB}/tournaments`);
    expect(off.status).toBe(403);
    expect(off.body.code).toBe('CLUB_FEATURE_DISABLED');

    ctx.modules.rows.set(CLUB, withModules({ tournaments: true }));
    expect((await http().get(`/v1/probe/${CLUB}/tournaments`)).status).toBe(200);
    // Another module stays off.
    expect((await http().get(`/v1/probe/${CLUB}/video`)).status).toBe(403);

    ctx.modules.rows.set(CLUB, withModules({ tournaments: false }));
    expect((await http().get(`/v1/probe/${CLUB}/tournaments`)).status).toBe(403);
  });

  it('exposes the flags so the UI can hide what is off', async () => {
    ctx.modules.rows.set(CLUB, withModules({ ai_video: 'player_pays', lesson_mode: 'whatsapp' }));
    const response = await http().get(`/v1/clubs/${CLUB}/modules`);
    expect(response.body).toMatchObject({ ai_video: 'player_pays', lesson_mode: 'whatsapp' });
  });

  it('an id that is not a UUID is rejected', async () => {
    expect((await http().get('/v1/clubs/nope/modules')).status).toBe(400);
  });

  it('maps every flag to its module', () => {
    const on = (patch: Partial<ClubModules>, name: ModuleName) =>
      isModuleOn(withModules(patch), name);
    expect(on({}, 'lessons_in_app')).toBe(true);
    expect(on({ lesson_mode: 'whatsapp' }, 'lessons_in_app')).toBe(false);
    expect(on({ ai_video: 'club_pays' }, 'ai_video')).toBe(true);
    expect(on({}, 'ai_video')).toBe(false);
    expect(on({}, 'deposit')).toBe(false);
    expect(on({}, 'branding')).toBe(false);
  });

  it('asks for the value its kind needs', () => {
    const deposit = { enabled: true, kind: 'fixed', percent: null, amount_cents: null } as const;
    expect(findModuleIssues(withModules({ deposit }))).toEqual([
      { path: '/modules/deposit/amount_cents', rule: 'required' },
    ]);
    const branding = {
      mode: 'own',
      logo_url: null,
      primary_color: '#112233',
      secondary_color: null,
    } as const;
    expect(findModuleIssues(withModules({ branding })).map((i) => i.path)).toEqual([
      '/modules/branding/logo_url',
      '/modules/branding/secondary_color',
    ]);
    expect(findModuleIssues(DEFAULT_MODULES)).toEqual([]);
  });
});
