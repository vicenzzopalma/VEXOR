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
    if (!token || token.length > 128) throw new HttpException('Sessão necessária.', 401);

    const tokenHash = hash(token);

    // 1. Try production session
    const prodSession = await this.workflows.db.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (prodSession) {
      if (prodSession.expiresAt.getTime() <= Date.now()) {
        throw new HttpException('Sessão expirada.', 401);
      }
      req.access = {
        organizationId: prodSession.user.organizationId,
        role: prodSession.user.role,
        userId: prodSession.userId,
      };
    } else {
      // 2. Fallback to development session
      const devSession = await this.workflows.db.developmentSession.findUnique({
        where: { tokenHash },
        include: { membership: true },
      });
      if (!devSession) throw new HttpException('Sessão inválida.', 401);
      req.access = {
        organizationId: devSession.membership.organizationId,
        role: devSession.membership.role,
      };
    }

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
