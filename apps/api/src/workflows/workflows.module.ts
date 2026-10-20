import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { DevelopmentGuard } from './development.guard';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

@Module({
  controllers: [WorkflowController, WhatsAppController],
  providers: [
    WorkflowService,
    WhatsAppService,
    { provide: 'WORKFLOW_SERVICE', useExisting: WorkflowService },
    DevelopmentGuard,
  ],
})
export class WorkflowsModule {}
