import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { DevelopmentGuard } from './development.guard';
import { Roles, type AuthorizedRequest } from './contracts';
import { OptOutService } from './opt-out.service';

@Controller()
@UseGuards(DevelopmentGuard)
export class OptOutController {
  constructor(@Inject(OptOutService) private readonly optOuts: OptOutService) {}
  @Get('opt-outs')
  list(@Req() req: AuthorizedRequest, @Query('status') status?: string) {
    return this.optOuts.list(req.access.organizationId, status);
  }
  @Get('opt-outs/status')
  status(@Req() req: AuthorizedRequest) {
    return this.optOuts.status(req.access.organizationId);
  }
  @Get('projects/:id/system-opt-out')
  system(@Req() req: AuthorizedRequest, @Param('id') id: string) {
    return this.optOuts.system(req.access.organizationId, id);
  }
  @Post('opt-outs')
  @Roles('owner', 'editor')
  createManual(@Req() req: AuthorizedRequest, @Body() body: unknown) {
    return this.optOuts.createManual(req.access.organizationId, body, req.access.userId);
  }
  @Post('opt-outs/:id/resolve')
  @Roles('owner', 'editor')
  resolve(@Req() req: AuthorizedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.optOuts.resolve(id, req.access.organizationId, body, req.access.userId);
  }
  @Post('opt-outs/:id/retry')
  @Roles('owner')
  retry(@Req() req: AuthorizedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.optOuts.retry(id, req.access.organizationId, body);
  }
}
