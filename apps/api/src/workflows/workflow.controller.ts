
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { createSdrTemplate } from '@eimax/workflow-schema';
import { DevelopmentGuard } from './development.guard';
import { WorkflowService } from './workflow.service';
import {
  Roles,
  parse,
  json,
  saveSchema,
  revisionSchema,
  simulateSchema,
  type AuthorizedRequest,
} from './contracts';

@Controller()
@UseGuards(DevelopmentGuard)
export class WorkflowController {
  constructor(@Inject(WorkflowService) private readonly workflows: WorkflowService) {}
  @Get('health') @SetMetadata('public', true) health() {
    return { status: 'ok', mode: 'local-development', realExecutionAvailable: false };
  }
  @Get('me') me(@Req() req: AuthorizedRequest) {
    return { ...req.access, mode: 'local-development' };
  }
  @Get('workflows') list(@Req() req: AuthorizedRequest) {
    return this.workflows.list(req.access.organizationId);
  }
  @Get('workflows/:id') get(@Param('id') id: string, @Req() req: AuthorizedRequest) {
    return this.workflows.get(id, req.access.organizationId);
  }
  @Post('workflows') @Roles('owner', 'editor') async create(
    @Body() body: unknown,
    @Req() req: AuthorizedRequest,
  ) {
    const input = parse(
      z.object({ template: z.literal('sdr'), name: z.string().trim().min(1).max(200) }).strict(),
      body,
    );
    return this.workflows.db.workflow.create({
      data: {
        organizationId: req.access.organizationId,
        draft: json({ ...createSdrTemplate(), name: input.name }),
      },
    });
  }
  @Patch('workflows/:id') @Roles('owner', 'editor') save(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthorizedRequest,
  ) {
    return this.workflows.save(id, req.access.organizationId, parse(saveSchema, body));
  }
  @Post('workflows/:id/publish') @Roles('owner') publish(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthorizedRequest,
  ) {
    return this.workflows.publish(id, req.access.organizationId, parse(revisionSchema, body).revision);
  }
  @Get('workflows/:id/versions/:number') async version(
    @Param('id') id: string,
    @Param('number') number: string,
    @Req() req: AuthorizedRequest,
  ) {
    await this.workflows.get(id, req.access.organizationId);
    const n = Number(number);
    if (!Number.isInteger(n) || n < 1) throw new BadRequestException('Versão inválida.');
    const row = await this.workflows.db.workflowVersion.findFirst({
      where: { workflowId: id, number: n, organizationId: req.access.organizationId },
    });
    if (!row) throw new NotFoundException('Versão não encontrada.');
    return row;
  }
  @Post('workflows/:id/simulate') @Roles('owner', 'editor') simulate(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthorizedRequest,
  ) {
    return this.workflows.simulate(id, req.access.organizationId, parse(simulateSchema, body));
  }
  @Get('workflows/:id/simulations') async runs(@Param('id') id: string, @Req() req: AuthorizedRequest) {
    await this.workflows.get(id, req.access.organizationId);
    return this.workflows.runs(req.access.organizationId, id);
  }
  @Get('simulations') allRuns(@Req() req: AuthorizedRequest) {
    return this.workflows.runs(req.access.organizationId);
  }
}
