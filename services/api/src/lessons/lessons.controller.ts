import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard, Auth } from '../auth/access-token.guard';
import type { AccessIdentity } from '../auth/session/session.service';
import { parseInput } from '../common/zod';
import { LessonsService } from './lessons.service';

const duration = z.union([z.literal(60), z.literal(90), z.literal(120)]);
const pageQuery = {
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
const listQuery = z
  .object({
    ...pageQuery,
    role: z.enum(['coach', 'student']).optional(),
    student_id: z.uuid().optional(),
  })
  .strict();
const studentsQuery = z.object(pageQuery).strict();
const createBody = z
  .object({
    court_id: z.uuid(),
    starts_at: z.iso.datetime(),
    duration_minutes: duration,
    kind: z.enum(['private', 'group', 'school']),
    student_ids: z
      .array(z.uuid())
      .max(12)
      .refine((a) => new Set(a).size === a.length)
      .optional(),
    price_cents: z.number().int().min(1).nullable().optional(),
    record: z.boolean().optional(),
    focus: z.string().max(200).nullable().optional(),
  })
  .strict();
const drawing = z
  .object({
    strokes: z
      .array(
        z
          .object({
            color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
            width: z.number().gt(0).max(0.1),
            points: z
              .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
              .min(2)
              .max(500),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
const noteBody = z
  .object({
    text: z.string().min(1).max(2000),
    at_ms: z.number().int().min(0).nullable().optional(),
    student_id: z.uuid().nullable().optional(),
    drawing: drawing.nullable().optional(),
    is_plan: z.boolean().optional(),
    visible_to_students: z.boolean().optional(),
  })
  .strict();
const idSchema = z.uuid();

@Controller()
@UseGuards(AccessTokenGuard)
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Get('lessons')
  list(@Auth() auth: AccessIdentity, @Query() query: unknown) {
    return this.lessons.list(auth, parseInput(listQuery, query));
  }

  @Post('lessons')
  @HttpCode(201)
  create(@Auth() auth: AccessIdentity, @Body() body: unknown) {
    return this.lessons.create(auth, parseInput(createBody, body));
  }

  @Post('lessons/:id/notes')
  @HttpCode(201)
  addNote(@Auth() auth: AccessIdentity, @Param('id') id: string, @Body() body: unknown) {
    return this.lessons.addNote(auth, parseInput(idSchema, id), parseInput(noteBody, body));
  }

  @Get('coach/students')
  students(@Auth() auth: AccessIdentity, @Query() query: unknown) {
    return this.lessons.students(auth, parseInput(studentsQuery, query));
  }
}
