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
  @Post('integrations/whatsapp/:id/reconnect')
  @Roles('owner')
  reconnect(@Req() req: AuthorizedRequest, @Param('id') id: string) {
    return this.whatsapp.operate(id, req.access.organizationId, 'reconnect');
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
    @Query('hub.mode') mode = '',
    @Query('hub.verify_token') token = '',
    @Query('hub.challenge') challenge = '',
    @Req() req: { socket: { remoteAddress?: string } },
  ) {
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
  ) {
    return this.ingress.handle('WHATSAPP', id, req.socket.remoteAddress ?? 'unknown', () =>
      this.whatsapp.webhook(id, body, req.rawBody ?? Buffer.alloc(0), signature, secret),
    );
  }
}
