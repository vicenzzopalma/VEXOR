import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { DevelopmentGuard } from './development.guard';
import { Roles, type AuthorizedRequest } from './contracts';
import { IntegrationService } from './integration.service';
import { IngressService } from './ingress.service';
@Controller()
@UseGuards(DevelopmentGuard)
export class IntegrationController {
  constructor(
    @Inject(IntegrationService) private readonly integrations: IntegrationService,
    @Inject(IngressService) private readonly ingress: IngressService,
  ) {}
  @Get('integrations/catalog') catalog() {
    return this.integrations.catalog();
  }
  @Get('integrations') list(@Req() req: AuthorizedRequest) {
    return this.integrations.list(req.access.organizationId);
  }
  @Post('integrations') @Roles('owner') create(@Req() req: AuthorizedRequest, @Body() body: unknown) {
    return this.integrations.save(req.access.organizationId, body);
  }
  @Patch('integrations/:id') @Roles('owner') update(
    @Req() req: AuthorizedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.integrations.save(req.access.organizationId, body, id);
  }
  @Post('integrations/:id/enable') @Roles('owner') enable(
    @Req() req: AuthorizedRequest,
    @Param('id') id: string,
  ) {
    return this.integrations.operate(id, req.access.organizationId, 'enable');
  }
  @Post('integrations/:id/disconnect') @Roles('owner') disconnect(
    @Req() req: AuthorizedRequest,
    @Param('id') id: string,
  ) {
    return this.integrations.operate(id, req.access.organizationId, 'disconnect');
  }
  @Post('integrations/:id/oauth/prepare') @Roles('owner') oauth(
    @Req() req: AuthorizedRequest,
    @Param('id') id: string,
  ) {
    return this.integrations.prepareOAuth(id, req.access.organizationId);
  }
  @Get('integrations/:id/sheets') sheets(
    @Req() req: AuthorizedRequest,
    @Param('id') id: string,
    @Query('spreadsheetId') spreadsheetId?: string,
  ) {
    return this.integrations.sheets(id, req.access.organizationId, spreadsheetId);
  }
  @Post('integrations/:id/sheets/import-preview') @Roles('owner', 'editor') importPreview(
    @Req() req: AuthorizedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.integrations.previewImport(id, req.access.organizationId, body);
  }
  @Post('integrations/:id/sheets/export-preview') @Roles('owner', 'editor') exportPreview(
    @Req() req: AuthorizedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.integrations.previewExport(id, req.access.organizationId, body);
  }
  @Get('integrations/ingress/history') history(@Req() req: AuthorizedRequest) {
    return this.integrations.db.webhookIngressLog.findMany({
      where: { organizationId: req.access.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  @Post('webhooks/email/:id')
  @SetMetadata('public', true)
  emailWebhook(
    @Param('id') id: string,
    @Req() req: { rawBody?: Buffer; socket: { remoteAddress?: string } },
    @Body() body: unknown,
    @Headers('svix-id') eventId = '',
    @Headers('svix-timestamp') timestamp = '',
    @Headers('svix-signature') signature = '',
  ) {
    return this.ingress.handle('EMAIL', id, req.socket.remoteAddress ?? 'unknown', () =>
      this.integrations.emailWebhook(
        id,
        req.rawBody ?? Buffer.alloc(0),
        { id: eventId, timestamp, signature },
        body,
      ),
    );
  }
}
