
import { BadRequestException, SetMetadata } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { workflowSchema, leadSchema } from '@eimax/workflow-schema';

export type Access = { organizationId: string; role: string };
export type AuthorizedRequest = { access: Access };
export const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
export const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException({
      message: 'Confira os dados informados.',
      issues: result.error.issues.map((i) => ({ message: `${i.path.join('.')}: ${i.message}` })),
    });
  return result.data;
};
export const saveSchema = z.object({ revision: z.number().int().positive(), draft: workflowSchema }).strict();
export const revisionSchema = z.object({ revision: z.number().int().positive() }).strict();
export const simulateSchema = z.object({ revision: z.number().int().positive(), lead: leadSchema }).strict();
export const json = (value: unknown) => value as Prisma.InputJsonValue;
