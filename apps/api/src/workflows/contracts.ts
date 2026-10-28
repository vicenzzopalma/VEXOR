import { BadRequestException, SetMetadata } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { workflowSchema, leadSchema } from '@eimax/workflow-schema';

export type Access = { organizationId: string; role: string; userId?: string };
export type AuthorizedRequest = { access: Access; headers: Record<string, string | string[] | undefined> };
export const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
export const Public = () => SetMetadata('public', true);

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
export const executionSearchSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    workflowId: z.string().trim().min(1).max(200).optional(),
    status: z.enum(['QUEUED', 'RUNNING', 'SUSPENDED', 'COMPLETED', 'FAILED']).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    until: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.until || new Date(value.from) < new Date(value.until), {
    message: 'A data inicial deve ser anterior à data final.',
    path: ['until'],
  });
export const simulateSchema = z.object({ revision: z.number().int().positive(), lead: leadSchema }).strict();

export const executeSchema = z
  .object({
    lead: leadSchema,
    eventKey: z.string().trim().min(1).max(128).optional(),
    versionId: z.string().uuid().optional(),
  })
  .strict();

export const registerSchema = z
  .object({
    email: z.string().trim().email('E-mail inválido.').max(254),
    password: z.string().min(8, 'A senha deve conter no mínimo 8 caracteres.').max(200),
    cpf: z.string().trim().min(11, 'CPF incompleto.').max(18),
    companyName: z.string().trim().min(2, 'Nome da empresa deve ter no mínimo 2 caracteres.').max(120),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().email('E-mail inválido.').max(254),
    password: z.string().min(1, 'Informe a senha.').max(200),
  })
  .strict();

export const json = (value: unknown) => value as Prisma.InputJsonValue;
