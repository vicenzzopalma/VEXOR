import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { applyPlanAnswers, type OnboardingPlan } from '@eimax/workflow-schema';
import { openSecrets } from '@eimax/connectors';
import { DevelopmentGuard } from './development.guard';
import type { WorkflowService } from './workflow.service';
import { json, parse, Roles, type AuthorizedRequest } from './contracts';

const decisionSchema = z
  .object({
    revision: z.number().int().positive(),
    decision: z.enum(['approve', 'reject', 'retry']),
    answers: z.record(z.string().max(100), z.string().max(100)).optional(),
  })
  .strict();

@Controller()
@UseGuards(DevelopmentGuard)
export class ProvisioningController {
  constructor(@Inject('WORKFLOW_SERVICE') private readonly workflows: Pick<WorkflowService, 'db'>) {}

  private async find(id: string, organizationId: string) {
    const row = await this.workflows.db.provisioningRequest.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Solicitação não encontrada.');
    return row;
  }

  private view(row: Awaited<ReturnType<ProvisioningController['find']>>) {
    const { secrets, processingToken: _token, ...rest } = row;
    return { ...rest, hasSecrets: !!secrets };
  }

  @Get('provisioning')
  async list(@Req() req: AuthorizedRequest) {
    const rows = await this.workflows.db.provisioningRequest.findMany({
      where: { organizationId: req.access.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => this.view(row));
  }

  @Get('provisioning/:id')
  async get(@Param('id') id: string, @Req() req: AuthorizedRequest) {
    return this.view(await this.find(id, req.access.organizationId));
  }

  @Post('provisioning/:id/decision')
  @Roles('owner', 'editor')
  async decide(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthorizedRequest) {
    const input = parse(decisionSchema, body);
    const organizationId = req.access.organizationId;
    const row = await this.find(id, organizationId);
    const from = input.decision === 'retry' ? ['PARTIAL', 'FAILED'] : ['PENDING_APPROVAL'];
    if (!from.includes(row.status))
      throw new ConflictException(`Esta solicitação está ${row.status} e não aceita "${input.decision}".`);
    const decidedBy = req.access.userId ?? `role:${req.access.role}`;
    let data: Record<string, unknown>;
    if (input.decision === 'approve') {
      const answers = { ...(row.answers as Record<string, string>), ...(input.answers ?? {}) };
      const plan = applyPlanAnswers(row.plan as unknown as OnboardingPlan, answers);
      if (plan.questions.length) throw new ConflictException('Responda todas as perguntas antes de aprovar.');
      data = {
        status: 'APPROVED',
        plan: json(plan),
        answers: json(answers),
        decidedBy,
        decidedAt: new Date(),
      };
    } else if (input.decision === 'reject') data = { status: 'REJECTED', decidedBy, decidedAt: new Date() };
    else data = { status: 'APPROVED', attempt: 0, errorCode: null, decidedBy, decidedAt: new Date() };
    const updated = await this.workflows.db.provisioningRequest.updateMany({
      where: { id, organizationId, revision: input.revision, status: row.status },
      data: { ...data, revision: { increment: 1 } },
    });
    if (!updated.count) throw new ConflictException('A solicitação mudou. Recarregue antes de decidir.');
    return this.view(await this.find(id, organizationId));
  }

  @Post('provisioning/:id/secrets')
  @Roles('owner')
  async secrets(@Param('id') id: string, @Req() req: AuthorizedRequest) {
    const row = await this.find(id, req.access.organizationId);
    return { secrets: row.secrets ? openSecrets(row.secrets) : {} };
  }
}
