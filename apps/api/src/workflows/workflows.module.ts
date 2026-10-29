import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { DevelopmentGuard } from './development.guard';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { IngressService } from './ingress.service';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';
import { OptOutService } from './opt-out.service';
import { OptOutController } from './opt-out.controller';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { ProvisioningController } from './provisioning.controller';

@Module({
  controllers: [
    WorkflowController,
    WhatsAppController,
    IntegrationController,
    OptOutController,
    ProjectController,
    ProvisioningController,
  ],
  providers: [
    WorkflowService,
    WhatsAppService,
    IngressService,
    IntegrationService,
    OptOutService,
    ProjectService,
    { provide: 'WORKFLOW_SERVICE', useExisting: WorkflowService },
    DevelopmentGuard,
  ],
})
export class WorkflowsModule {}
