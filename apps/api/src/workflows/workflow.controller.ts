import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
interface HttpResponse {
  setHeader(name: string, value: string): void;
}
import { z } from 'zod';
import { createSdrTemplate } from '@eimax/workflow-schema';
import { DevelopmentGuard } from './development.guard';
import { WorkflowService } from './workflow.service';
import {
  executeSchema,
  json,
  loginSchema,
  parse,
  registerSchema,
  revisionSchema,
  Roles,
  saveSchema,
  simulateSchema,
  type AuthorizedRequest,
} from './contracts';

@Controller()
@UseGuards(DevelopmentGuard)
export class WorkflowController {
  constructor(@Inject(WorkflowService) private readonly workflows: WorkflowService) {}

  @Get('health')
  @SetMetadata('public', true)
  health() {
    return { status: 'ok', mode: 'local-development', realExecutionAvailable: true };
  }

  // --- Auth endpoints (Phase 3) ---

  @Post('auth/register')
  @SetMetadata('public', true)
  async register(@Body() body: unknown) {
    const input = parse(registerSchema, body);
    return this.workflows.register(input);
  }

  @Post('auth/login')
  @SetMetadata('public', true)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: HttpResponse) {
    const input = parse(loginSchema, body);
    const result = await this.workflows.login(input);
    res.setHeader('Set-Cookie', `eimax_session=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
    return result;
  }

  @Post('auth/logout')
  async logout(@Req() req: AuthorizedRequest, @Res({ passthrough: true }) res: HttpResponse) {
    const token = (req.headers.authorization as string)?.replace('Bearer ', '') || '';
    res.setHeader('Set-Cookie', `eimax_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    return this.workflows.logout(token);
  }

  @Get('me')
  me(@Req() req: AuthorizedRequest) {
    return { ...req.access, mode: 'authenticated' };
  }

  // --- Workflow CRUD ---

  @Get('workflows')
  list(@Req() req: AuthorizedRequest) {
    return this.workflows.list(req.access.organizationId);
  }

  @Get('workflows/:id')
  get(@Param('id') id: string, @Req() req: AuthorizedRequest) {
    return this.workflows.get(id, req.access.organizationId);
  }

  @Post('workflows')
  @Roles('owner', 'editor')
  async create(@Body() body: unknown, @Req() req: AuthorizedRequest) {
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

  @Patch('workflows/:id')
  @Roles('owner', 'editor')
  save(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthorizedRequest) {
    return this.workflows.save(id, req.access.organizationId, parse(saveSchema, body));
  }

  @Post('workflows/:id/publish')
  @Roles('owner')
  publish(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthorizedRequest) {
    return this.workflows.publish(id, req.access.organizationId, parse(revisionSchema, body).revision);
  }

  @Get('workflows/:id/versions/:number')
  async version(
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

  // --- Simulation (Fase 1) ---

  @Post('workflows/:id/simulate')
  @Roles('owner', 'editor')
  simulate(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthorizedRequest) {
    return this.workflows.simulate(id, req.access.organizationId, parse(simulateSchema, body));
  }

  @Get('workflows/:id/simulations')
  async runs(@Param('id') id: string, @Req() req: AuthorizedRequest) {
    await this.workflows.get(id, req.access.organizationId);
    return this.workflows.runs(req.access.organizationId, id);
  }

  @Get('simulations')
  allRuns(@Req() req: AuthorizedRequest) {
    return this.workflows.runs(req.access.organizationId);
  }

  // --- Real Executions (Phase 2) ---

  @Post('workflows/:id/execute')
  @Roles('owner', 'editor')
  execute(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthorizedRequest) {
    return this.workflows.execute(id, req.access.organizationId, parse(executeSchema, body));
  }

  @Get('workflows/:id/executions')
  async workflowExecutions(@Param('id') id: string, @Req() req: AuthorizedRequest) {
    await this.workflows.get(id, req.access.organizationId);
    return this.workflows.listExecutions(req.access.organizationId, id);
  }

  @Get('executions')
  allExecutions(@Req() req: AuthorizedRequest) {
    return this.workflows.listExecutions(req.access.organizationId);
  }

  @Get('executions/:id')
  executionDetail(@Param('id') id: string, @Req() req: AuthorizedRequest) {
    return this.workflows.getExecution(id, req.access.organizationId);
  }

  // --- Lead Management (Phase 2 & Real Cycle) ---

  @Get('leads')
  listLeads(
    @Req() req: AuthorizedRequest,
    @Query('workflowId') workflowId?: string,
    @Query('status') status?: string,
  ) {
    return this.workflows.listLeads(req.access.organizationId, workflowId, status);
  }

  @Get('leads/:id')
  getLead(@Param('id') id: string, @Req() req: AuthorizedRequest) {
    return this.workflows.getLead(id, req.access.organizationId);
  }

  @Patch('leads/:id')
  @Roles('owner', 'editor')
  updateLead(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthorizedRequest,
  ) {
    const schema = z
      .object({
        status: z.string().trim().min(1).max(50).optional(),
        assignedMembershipId: z.string().trim().nullable().optional(),
        tags: z.array(z.string().trim()).optional(),
      })
      .strict();
    return this.workflows.updateLead(id, req.access.organizationId, parse(schema, body));
  }

  // --- Notifications (Phase 2 & Real Cycle) ---

  @Get('notifications')
  listNotifications(
    @Req() req: AuthorizedRequest,
    @Query('leadId') leadId?: string,
  ) {
    return this.workflows.listNotifications(req.access.organizationId, leadId);
  }

  // --- Webhooks Ingress (Phase 2) ---

  @Post('webhooks/:workflowId')
  @SetMetadata('public', true)
  webhookIngress(
    @Param('workflowId') workflowId: string,
    @Headers('x-eimax-webhook-secret') secret: string | undefined,
    @Headers('x-eimax-event-key') eventKey: string | undefined,
    @Body() body: unknown,
  ) {
    return this.workflows.handleWebhook(workflowId, secret, body, eventKey);
  }
}
