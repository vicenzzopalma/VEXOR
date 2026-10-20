
import { HttpException, Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { WorkflowService } from './workflow.service';
import { hash } from './contracts';

@Injectable()
export class DevelopmentGuard implements CanActivate {
  constructor(
    @Inject('WORKFLOW_SERVICE') private readonly workflows: Pick<WorkflowService, 'db'>,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (this.reflector.get<boolean>('public', context.getHandler())) return true;
    const cookie = String(req.headers.cookie ?? '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('eimax_session='))
      ?.slice(14);
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const token = bearer ?? cookie;
    if (!token || token.length > 128) throw new HttpException('Sessão local necessária.', 401);
    const session = await this.workflows.db.developmentSession.findUnique({
      where: { tokenHash: hash(token) },
      include: { membership: true },
    });
    if (!session) throw new HttpException('Sessão inválida.', 401);
    req.access = { organizationId: session.membership.organizationId, role: session.membership.role };
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    if (roles && !roles.includes(req.access.role))
      throw new HttpException('Você não tem permissão para esta ação.', 403);
    if (req.method === 'GET') return true;
    const origin = req.headers.origin;
    if (
      req.headers['x-eimax-client'] !== 'workspace' ||
      (origin &&
        ![process.env.WEB_ORIGIN ?? 'http://localhost:3000', 'http://127.0.0.1:3000'].includes(origin))
    )
      throw new HttpException('Origem da solicitação não autorizada.', 403);
    return true;
  }
}
