import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  resolveEsferaLink,
  toE164,
  optOutPhoneKey,
  optOutConfirmationPolicy,
  OPT_OUT_CONFIRMATION_TEXT,
  OPT_OUT_EXACT_PHRASES,
  OPT_OUT_SAIR_TYPOS,
  OPT_OUT_TYPO_RULE,
} from '@eimax/connectors';
import { revokeLeadConsent, enqueueOptOutConfirmation } from '@eimax/workflow-runtime';
import { WorkflowService } from './workflow.service';
import { parse } from './contracts';

// Review and audit of the opt-out outbox. The organization always comes from the session;
// delivery itself runs in the worker (dispatchNextOptOut), never from a request.

const resolveSchema = z
  .object({
    decision: z.enum(['CONFIRM', 'DISMISS']),
    expectedUpdatedAt: z.string().datetime(),
  })
  .strict();

const manualSchema = z
  .object({
    phone: z.string().min(8).max(30),
    note: z.string().trim().max(120).optional(),
  })
  .strict();

const retrySchema = z.object({ expectedUpdatedAt: z.string().datetime() }).strict();

@Injectable()
export class OptOutService {
  constructor(@Inject(WorkflowService) private readonly workflows: WorkflowService) {}
  get db() {
    return this.workflows.db;
  }
  /** Public shape: no tokens, no conversation. */
  private publicRow(row: {
    id: string;
    phone: string;
    classification: string;
    excerpt: string;
    status: string;
    attempt: number;
    errorCode: string | null;
    ackStatus: string | null;
    receivedAt: Date;
    deliveredAt: Date | null;
    availableAt: Date;
    resolvedAt: Date | null;
    connectionId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      phone: row.phone,
      classification: row.classification,
      excerpt: row.excerpt,
      status: row.status,
      attempt: row.attempt,
      errorCode: row.errorCode,
      ackStatus: row.ackStatus,
      receivedAt: row.receivedAt,
      deliveredAt: row.deliveredAt,
      availableAt: row.availableAt,
      resolvedAt: row.resolvedAt,
      connectionId: row.connectionId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  async list(organizationId: string, status?: string) {
    const where = { organizationId, ...(status ? { status: status.toUpperCase().slice(0, 20) } : {}) };
    const rows = await this.db.optOutEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    const [confirmations, activation] = await Promise.all([
      this.db.optOutConfirmation.findMany({
        where: { organizationId, phoneKey: { in: rows.map((r) => optOutPhoneKey(r.phone)) } },
      }),
      this.db.optOutConfirmationActivation.findUnique({ where: { id: 'default' } }),
    ]);
    return rows.map((row) => {
      const confirmation = confirmations.find((c) => c.phoneKey === optOutPhoneKey(row.phone));
      const applicable = activation && row.receivedAt > activation.activatedAt && row.sourceEventId;
      return {
        ...this.publicRow(row),
        confirmation:
          applicable && confirmation
            ? {
                status:
                  confirmation.status === 'SENT' || confirmation.status === 'FAILED'
                    ? confirmation.status
                    : optOutConfirmationPolicy(row.phone) === 'ALLOWED'
                      ? confirmation.status
                      : 'HELD',
                sentAt: confirmation.sentAt,
                updatedAt: confirmation.updatedAt,
                errorCode: confirmation.errorCode,
              }
            : { status: 'NOT_APPLICABLE', sentAt: null, updatedAt: null, errorCode: null },
      };
    });
  }
  async system(organizationId: string, projectId: string) {
    const project = await this.db.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, name: true },
    });
    if (!project) throw new NotFoundException('Projeto não encontrado.');
    const [events, connections, activation, received, statuses, confirmations] = await Promise.all([
      this.list(organizationId),
      this.db.whatsAppConnection.findMany({
        where: { organizationId },
        select: { id: true, name: true, enabled: true, state: true, quarantinedAt: true },
      }),
      this.db.optOutConfirmationActivation.findUnique({ where: { id: 'default' } }),
      this.db.whatsAppEvent.count({ where: { kind: 'MESSAGE', connection: { organizationId } } }),
      this.db.optOutEvent.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
      this.db.optOutConfirmation.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
    ]);
    const link = resolveEsferaLink(organizationId);
    return {
      project,
      scope: 'organization',
      received,
      statuses,
      confirmations,
      events,
      connections,
      activatedAt: activation?.activatedAt ?? null,
      phrases: OPT_OUT_EXACT_PHRASES,
      typos: OPT_OUT_SAIR_TYPOS,
      typoRule: OPT_OUT_TYPO_RULE,
      confirmationText: OPT_OUT_CONFIRMATION_TEXT,
      confirmationEnabled: process.env.OPT_OUT_CONFIRMATION_ENABLED !== 'false',
      allowlist: (process.env.OPT_OUT_CONFIRMATION_ALLOWLIST ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
      esferaEndpoint: link ? new URL('/api/optout/events', link.baseUrl).toString() : null,
    };
  }
  async status(organizationId: string) {
    const [review, pending, failed, delivered] = await Promise.all(
      ['REVIEW', 'PENDING', 'FAILED', 'DELIVERED'].map((status) =>
        this.db.optOutEvent.count({ where: { organizationId, status } }),
      ),
    );
    return { review, pending, failed, delivered, esferaLinkConfigured: !!resolveEsferaLink(organizationId) };
  }
  async get(id: string, organizationId: string) {
    const row = await this.db.optOutEvent.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Pedido de descadastro não encontrado.');
    return row;
  }
  /** A member confirms or dismisses an ambiguous request. Confirmation queues it for Esfera. */
  async resolve(id: string, organizationId: string, body: unknown, membershipId?: string) {
    const input = parse(resolveSchema, body);
    const row = await this.get(id, organizationId);
    if (row.status !== 'REVIEW') throw new BadRequestException('Este pedido não está aguardando revisão.');
    if (row.updatedAt.toISOString() !== input.expectedUpdatedAt)
      throw new ConflictException('O pedido mudou. Recarregue antes de decidir.');
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.optOutEvent.updateMany({
        where: { id, organizationId, status: 'REVIEW', updatedAt: row.updatedAt },
        data: {
          status: input.decision === 'CONFIRM' ? 'PENDING' : 'DISMISSED',
          availableAt: new Date(),
          resolvedAt: new Date(),
          resolvedByMembershipId: membershipId ?? null,
          errorCode: null,
        },
      });
      if (result.count && input.decision === 'CONFIRM') {
        await revokeLeadConsent(tx, organizationId, row.phone);
        await enqueueOptOutConfirmation(tx, row);
      }
      return result.count;
    });
    if (!updated) throw new ConflictException('O pedido mudou. Recarregue antes de decidir.');
    return this.publicRow(await this.get(id, organizationId));
  }
  /** Manual opt-out typed by a member; delivered to Esfera like any other. */
  async createManual(organizationId: string, body: unknown, membershipId?: string) {
    const input = parse(manualSchema, body);
    const phone = toE164(input.phone);
    if (!phone) throw new BadRequestException('Informe um número válido (E.164 ou DDD + número).');
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.optOutEvent.create({
        data: {
          organizationId,
          eventKey: `manual:${organizationId}:${randomUUID()}`,
          phone,
          classification: 'MANUAL',
          excerpt: input.note ?? '',
          receivedAt: new Date(),
          status: 'PENDING',
          resolvedAt: new Date(),
          resolvedByMembershipId: membershipId ?? null,
        },
      });
      await revokeLeadConsent(tx, organizationId, phone);
      return created;
    });
    return this.publicRow(row);
  }
  /** Puts a FAILED delivery back in the queue after the operator fixed the cause. */
  async retry(id: string, organizationId: string, body: unknown) {
    const input = parse(retrySchema, body);
    const row = await this.get(id, organizationId);
    if (row.status !== 'FAILED')
      throw new BadRequestException('Só entregas com falha podem ser reenfileiradas.');
    const updated = await this.db.optOutEvent.updateMany({
      where: { id, organizationId, status: 'FAILED', updatedAt: new Date(input.expectedUpdatedAt) },
      data: { status: 'PENDING', availableAt: new Date(), errorCode: null },
    });
    if (!updated.count) throw new ConflictException('O pedido mudou. Recarregue antes de reenfileirar.');
    return this.publicRow(await this.get(id, organizationId));
  }
}
