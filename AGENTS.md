
# EIMAX

## Escopo e trabalho
- Ler `docs/progress.md` antes de alterar o projeto; executar em fatias por fase.
- Referências originais em `TEMPLATES/`; catálogo em `docs/references/README.md`.
- Preservar a composição do editor: navegação, biblioteca, canvas, inspetor contextual.
- Português brasileiro, Inter, ícones Lucide e tokens centralizados. Não simular métricas comerciais.
- Nenhum serviço pago, envio externo ou deploy sem autorização explícita.
- Não delegar tarefas a agentes sem solicitação explícita do usuário.

## Arquitetura
- npm workspaces: `apps/web` (Next), `apps/api` (Nest), `apps/worker` (fase 2), `packages/workflow-schema`, `packages/workflow-engine`, `packages/database`, `packages/shared-ui`.
- PostgreSQL/Prisma é a fonte persistente. Não trocar por localStorage ou JSON em arquivo.
- Validar contratos no servidor; revisões otimistas evitam sobrescritas silenciosas.
- Publicação cria snapshots imutáveis. Simulações não realizam chamadas externas.
- Resolver a empresa pela sessão local e membership, nunca por um campo enviado pelo cliente. Toda rota protegida deve aplicar organização e RBAC. Há testes de isolamento com duas empresas. Sessões de desenvolvimento não substituem autenticação de produção.
- Credenciais somente em ambiente; nunca commitar `.env`, logs privados ou dados locais.

## Verificação
- `npm run build`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:e2e`.
- Testes de integração e navegador usam PostgreSQL/API locais (`npm run dev`).
- Atualizar progresso com comandos realmente executados e limitações observadas.
