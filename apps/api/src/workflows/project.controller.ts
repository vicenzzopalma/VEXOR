import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { DevelopmentGuard } from './development.guard';
import { Roles, parse, executionSearchSchema, type AuthorizedRequest } from './contracts';
import { ProjectService } from './project.service';
import { WorkflowService } from './workflow.service';

const name = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((v) => v.normalize('NFKC').trim().length > 0, 'Informe um nome para o projeto.');
const revision = z.number().int().positive().max(2147483646);
const fields = {
  name,
  description: z.string().trim().max(1000).nullable().optional(),
  color: z.enum(['primary', 'success', 'neutral']).nullable().optional(),
  icon: z.enum(['folder', 'workflow', 'users']).nullable().optional(),
};
const revisionBody = z.object({ revision }).strict();
const flowName = z.string().trim().min(1).max(200);

@Controller()
@UseGuards(DevelopmentGuard)
export class ProjectController {
  constructor(
    @Inject(ProjectService) private readonly projects: ProjectService,
    @Inject(WorkflowService) private readonly workflows: WorkflowService,
  ) {}
  @Get('projects') list(@Req() req: AuthorizedRequest) {
    return this.projects.list(req.access.organizationId);
  }
  @Get('projects/:id') get(@Param('id') id: string, @Req() req: AuthorizedRequest) {
    return this.projects.get(id, req.access.organizationId);
  }
  @Post('projects') @Roles('owner', 'editor') create(@Body() body: unknown, @Req() req: AuthorizedRequest) {
    return this.projects.create(req.access.organizationId, parse(z.object(fields).strict(), body));
  }
  @Patch('projects/:id') @Roles('owner', 'editor') update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthorizedRequest,
  ) {
    const { revision: rev, ...input } = parse(
      z.object({ ...fields, name: name.optional(), revision }).strict(),
      body,
    );
    return this.projects.update(id, req.access.organizationId, rev, input);
  }
  @Post('projects/:id/archive') @Roles('owner') archive(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthorizedRequest,
  ) {
    return this.projects.update(id, req.access.organizationId, parse(revisionBody, body).revision, {
      archivedAt: new Date(),
    });
  }
  @Post('projects/:id/restore') @Roles('owner') restore(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthorizedRequest,
  ) {
    return this.projects.update(id, req.access.organizationId, parse(revisionBody, body).revision, {
      archivedAt: null,
    });
  }
  @Get('projects/:id/workflows') flows(@Param('id') id: string, @Req() req: AuthorizedRequest) {
    return this.projects.listWorkflows(id, req.access.organizationId);
  }
  @Post('projects/:id/workflows') @Roles('owner', 'editor') createFlow(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthorizedRequest,
  ) {
    return this.projects.createWorkflow(
      id,
      req.access.organizationId,
      parse(z.object({ name: flowName, template: z.literal('sdr').optional() }).strict(), body).name,
    );
  }
  @Get('projects/:id/executions') async executions(@Param('id') id: string, @Req() req: AuthorizedRequest) {
    await this.projects.get(id, req.access.organizationId);
    return this.workflows.listExecutions(req.access.organizationId, undefined, id);
  }
  @Get('projects/:id/executions/search') async searchExecutions(
    @Param('id') id: string,
    @Req() req: AuthorizedRequest,
    @Query() query: unknown,
  ) {
    await this.projects.get(id, req.access.organizationId);
    return this.workflows.searchExecutions(
      req.access.organizationId,
      id,
      parse(executionSearchSchema, query),
    );
  }
  @Get('projects/:id/simulations') async simulations(@Param('id') id: string, @Req() req: AuthorizedRequest) {
    await this.projects.get(id, req.access.organizationId);
    return this.workflows.runs(req.access.organizationId, undefined, id);
  }
  @Patch('workflows/:id/name') @Roles('owner', 'editor') rename(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthorizedRequest,
  ) {
    const input = parse(z.object({ revision, name: flowName }).strict(), body);
    return this.projects.changeWorkflow(id, req.access.organizationId, input.revision, 'rename', input);
  }
  @Post('workflows/:id/move') @Roles('owner', 'editor') move(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthorizedRequest,
  ) {
    const input = parse(z.object({ revision, projectId: z.string().min(1).max(200) }).strict(), body);
    return this.projects.changeWorkflow(id, req.access.organizationId, input.revision, 'move', input);
  }
  @Post('workflows/:id/duplicate') @Roles('owner', 'editor') duplicate(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthorizedRequest,
  ) {
    const input = parse(
      z
        .object({ revision, name: flowName.optional(), projectId: z.string().min(1).max(200).optional() })
        .strict(),
      body,
    );
    return this.projects.changeWorkflow(id, req.access.organizationId, input.revision, 'duplicate', input);
  }
  @Post('workflows/:id/archive-revision') @Roles('owner') archiveFlow(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthorizedRequest,
  ) {
    return this.projects.changeWorkflow(
      id,
      req.access.organizationId,
      parse(revisionBody, body).revision,
      'archive',
      {},
    );
  }
  @Post('workflows/:id/restore-revision') @Roles('owner') restoreFlow(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthorizedRequest,
  ) {
    return this.projects.changeWorkflow(
      id,
      req.access.organizationId,
      parse(revisionBody, body).revision,
      'restore',
      {},
    );
  }
}
