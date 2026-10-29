import { HttpException, Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { WorkflowService } from './workflow.service';

@Injectable()
export class IngressService {
  constructor(@Inject(WorkflowService) private readonly workflows: WorkflowService) {}
  async handle<T>(
    source: 'WORKFLOW' | 'WHATSAPP' | 'EMAIL',
    resourceId: string,
    address: string,
    action: () => Promise<T>,
  ) {
    const db = this.workflows.db;
    const target =
      source === 'WORKFLOW'
        ? await db.workflow.findUnique({ where: { id: resourceId }, select: { organizationId: true } })
        : source === 'WHATSAPP'
          ? await db.whatsAppConnection.findUnique({
              where: { id: resourceId },
              select: { organizationId: true },
            })
          : await db.integrationConnection.findUnique({
              where: { id: resourceId },
              select: { organizationId: true },
            });
    const requestId = randomUUID();
    try {
      const minute = Math.floor(Date.now() / 60000);
      for (const [scope, limit] of [
        [`ip:${address}`, 300],
        [`route:${source}:${resourceId}:${address}`, 120],
      ] as const) {
        const key = createHash('sha256').update(`${minute}:${scope}`).digest('hex');
        const expiresAt = new Date((minute + 2) * 60000);
        const rows = await db.$queryRaw<
          Array<{ count: number }>
        >`INSERT INTO "WebhookRateBucket" ("key", "count", "expiresAt") VALUES (${key}, 1, ${expiresAt}) ON CONFLICT ("key") DO UPDATE SET "count"="WebhookRateBucket"."count"+1 RETURNING "count"`;
        if (rows[0].count > limit)
          throw new HttpException('Limite de webhooks atingido. Tente novamente na próxima janela.', 429);
      }
      await db.webhookRateBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      const result = await action();
      await db.webhookIngressLog.create({
        data: {
          id: requestId,
          organizationId: target?.organizationId,
          source,
          resourceId: resourceId.slice(0, 200),
          outcome: 'ACCEPTED',
          code: 'PERSISTED',
        },
      });
      return result;
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 500;
      const body = error instanceof HttpException ? error.getResponse() : undefined;
      const inactive =
        typeof body === 'object' && body !== null && (body as { code?: string }).code === 'WORKFLOW_INACTIVE';
      await db.webhookIngressLog.create({
        data: {
          id: requestId,
          organizationId: target?.organizationId,
          source,
          resourceId: resourceId.slice(0, 200),
          outcome: 'REJECTED',
          code: inactive
            ? 'WORKFLOW_INACTIVE'
            : status === 429
              ? 'RATE_LIMITED'
              : status === 401
                ? 'AUTHENTICATION_REJECTED'
                : status === 400
                  ? 'INVALID_EVENT'
                  : status === 404
                    ? 'RESOURCE_UNAVAILABLE'
                    : 'INGRESS_FAILURE',
        },
      });
      throw error;
    }
  }
}
