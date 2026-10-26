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
import { WhatsAppService } from './whatsapp.service';
import { IngressService } from './ingress.service';

@Controller()
@UseGuards(DevelopmentGuard)
export class WhatsAppController {
  constructor(
    @Inject(WhatsAppService) private readonly whatsapp: WhatsAppService,
    @Inject(IngressService) private readonly ingress: IngressService,
  ) {}
  @Get('integrations/whatsapp')
  list(@Req() req: AuthorizedRequest) {
    return this.whatsapp.list(req.access.organizationId);
  }
  @Get('integrations/whatsapp/:id/events')
  async events(@Req() req: AuthorizedRequest, @Param('id') id: string) {
    await this.whatsapp.get(id, req.access.organizationId);
    return this.whatsapp.db.whatsAppEvent.findMany({
      where: { connectionId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        kind: true,
        status: true,
        attempt: true,
        errorCode: true,
        createdAt: true,
        processedAt: true,
      },
    });
  }
  @Post('integrations/whatsapp')
  @Roles('owner')
  create(@Req() req: AuthorizedRequest, @Body() body: unknown) {
    return this.whatsapp.save(req.access.organizationId, body);
  }
  @Post('integrations/whatsapp/managed')
  @Roles('owner')
  createManaged(@Req() req: AuthorizedRequest, @Body() body: unknown) {
    return this.whatsapp.saveManaged(req.access.organizationId, body);
  }
  @Patch('integrations/whatsapp/:id/managed')
  @Roles('owner')
  renameManaged(@Req() req: AuthorizedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.whatsapp.saveManaged(req.access.organizationId, body, id);
  }
  @Patch('integrations/whatsapp/:id')
  @Roles('owner')
  update(@Req() req: AuthorizedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.whatsapp.save(req.access.organizationId, body, id);
  }
  @Post('integrations/whatsapp/:id/create-instance')
  @Roles('owner')
  createInstance(@Req() req: AuthorizedRequest, @Param('id') id: string) {
    return this.whatsapp.operate(id, req.access.organizationId, 'create-instance');
  }
  @Post('integrations/whatsapp/:id/archive')
  @Roles('owner')
  archive(@Req() req: AuthorizedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.whatsapp.archive(id, req.access.organizationId, body);
  }
  @Post('integrations/whatsapp/:id/reconnect')
  @Roles('owner')
  reconnect(@Req() req: AuthorizedRequest, @Param('id') id: string) {
    return this.whatsapp.operate(id, req.access.organizationId, 'reconnect');
  }
  @Post('integrations/whatsapp/:id/release-quarantine')
  @Roles('owner')
  releaseQuarantine(@Req() req: AuthorizedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.whatsapp.releaseQuarantine(id, req.access.organizationId, body);
  }
  @Post('integrations/whatsapp/:id/simulate')
  @Roles('owner', 'editor')
  simulate(@Req() req: AuthorizedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.whatsapp.simulate(id, req.access.organizationId, body);
  }
  @Post('integrations/whatsapp/:id/pairing-code')
  @Roles('owner')
  pairingCode(@Req() req: AuthorizedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.whatsapp.pairingCode(id, req.access.organizationId, body);
  }
  @Post('integrations/whatsapp/:id/connect')
  @Roles('owner')
  connect(@Req() req: AuthorizedRequest, @Param('id') id: string) {
    return this.whatsapp.operate(id, req.access.organizationId, 'connect');
  }
  @Post('integrations/whatsapp/:id/refresh')
  @Roles('owner', 'editor')
  refresh(@Req() req: AuthorizedRequest, @Param('id') id: string) {
    return this.whatsapp.operate(id, req.access.organizationId, 'refresh');
  }
  @Post('integrations/whatsapp/:id/disconnect')
  @Roles('owner')
  disconnect(@Req() req: AuthorizedRequest, @Param('id') id: string) {
    return this.whatsapp.operate(id, req.access.organizationId, 'disconnect');
  }
  @Get('webhooks/whatsapp/:id')
  @SetMetadata('public', true)
  verify(
    @Param('id') id: string,
    @Query('hub.mode') modeQuery = '',
    @Query('hub.verify_token') tokenQuery = '',
    @Query('hub.challenge') challengeQuery = '',
    @Req() req: { query?: Record<string, any>; socket: { remoteAddress?: string } },
  ) {
    const query = (req?.query ?? {}) as Record<string, any>;
    const mode = modeQuery || query['hub.mode'] || query.hub?.mode || '';
    const token = tokenQuery || query['hub.verify_token'] || query.hub?.verify_token || '';
    const challenge = challengeQuery || query['hub.challenge'] || query.hub?.challenge || '';
    return this.ingress.handle('WHATSAPP', id, req.socket.remoteAddress ?? 'unknown', () =>
      this.whatsapp.verify(id, mode, token, challenge),
    );
  }
  @Post('webhooks/whatsapp/:id')
  @SetMetadata('public', true)
  webhook(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: { rawBody?: Buffer; socket: { remoteAddress?: string } },
    @Headers('x-hub-signature-256') signature = '',
    @Headers('x-whatsapp-secret') secret = '',
    @Headers('client-token') clientToken = '',
  ) {
    return this.ingress.handle('WHATSAPP', id, req.socket.remoteAddress ?? 'unknown', () =>
      this.whatsapp.webhook(id, body, req.rawBody ?? Buffer.alloc(0), signature, secret || clientToken),
    );
  }
}
