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

@Controller()
@UseGuards(DevelopmentGuard)
export class WhatsAppController {
  constructor(@Inject(WhatsAppService) private readonly whatsapp: WhatsAppService) {}
  @Get('integrations/whatsapp')
  list(@Req() req: AuthorizedRequest) {
    return this.whatsapp.list(req.access.organizationId);
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
  ) {
    return this.whatsapp.verify(id, mode, token, challenge);
  }
  @Post('webhooks/whatsapp/:id')
  @SetMetadata('public', true)
  webhook(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature = '',
    @Headers('x-whatsapp-secret') secret = '',
  ) {
    return this.whatsapp.webhook(id, body, req.rawBody ?? Buffer.alloc(0), signature, secret);
  }
}
