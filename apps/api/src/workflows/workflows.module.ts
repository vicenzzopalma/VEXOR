
import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { DevelopmentGuard } from './development.guard';

@Module({
  controllers: [WorkflowController],
  providers: [
    WorkflowService,
    { provide: 'WORKFLOW_SERVICE', useExisting: WorkflowService },
    DevelopmentGuard,
  ],
})
export class WorkflowsModule {}
