# Progresso

## Ambiente — 20/10/2026
- Workspace restaurado a partir de monstro.txt; repositório limpo e sincronizado com GitHub.
- Node 20.18.0, npm 10.8.2, Python 3.12, Git e Microsoft Edge disponíveis.
- PostgreSQL 18 local via embedded-postgres/pg_ctl escutando em 127.0.0.1:55432.
- Referências e templates originais preservados; sem serviços pagos ou dependências externas não autorizadas.

## Fase 0 — concluída
Arquitetura, design system, especificação, roadmap e critérios criados antes da implementação.

## Fase 1 — concluída
- Monorepo npm com Next 16, React Flow 12, NestJS, Prisma 6 e PostgreSQL local.
- Editor com 8 tipos de blocos, inspector contextual, auto-layout, minimapa, desfazer/refazer, salvamento com revisão otimista.
- Snapshots imutáveis via trigger SQL, histórico de versões, simulador seguro no servidor com logs protegidos.
- Multi-tenancy com isolamento rigoroso por sessão, memberships e RBAC.

## Fase 2 — concluída
- **Modelos de Execução**: `Execution` (com status `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`), `ExecutionStep` e `Lead` adicionados ao Prisma Schema com integridade referencial composta por organização.
- **Engine de Efeitos Reais**: Implementados adapters de produção (`createProductionEffects`, `executeWorkflow`) para os 8 blocos do catálogo (`lead.created`, `webhook.received`, `condition`, `email.send`, `sdr.assign`, `wait`, `tag.add`, `manager.notify`).
- **Garantia de Idempotência**: Execuções com a mesma chave de evento `(organizationId, workflowId, eventKey)` são deduplicadas deterministicamente sem reexecutar efeitos colaterais (`idempotentHit: true`).
- **Persistência de Etapas e Logs**: Gravação detalhada de cada etapa executada (`ExecutionStep`) com duração em milissegundos, status e dados de entrada/saída protegidos contra vazamento de credenciais.
- **Worker Desacoplado**: Pacote `apps/worker` estruturado com runner autônomo e loop de polling para processamento de filas enfileiradas.
- **Endpoints de Execução e Webhook**:
  - `POST /workflows/:id/execute` — disparo autenticado com verificação de papéis (owner/editor).
  - `GET /workflows/:id/executions` — histórico de execuções do fluxo filtrado por empresa.
  - `GET /executions` e `GET /executions/:id` — consulta geral e detalhe das etapas com RBAC estrito.
  - `POST /webhooks/:workflowId` — recepção de eventos externos com verificação de credencial/segredo.

## Fase 3 — concluída
- **Validação de CPF**: Verificação matemática dos dígitos verificadores (módulo 11) com rejeição de sequências repetidas e formatos inválidos.
- **Criptografia AES-256-GCM**: CPF armazenado cifrado com chave de 256 bits, IV aleatório de 12 bytes e tag de autenticação de 16 bytes. Fingerprint SHA-256 para deduplicação segura sem necessidade de decifrar e preservação de `cpfLast4` para exibição na interface.
- **Senhas com Scrypt**: Derivação de chaves via `scrypt` com salt aleatório de 16 bytes e verificação em tempo constante (`timingSafeEqual`) contra ataques de temporização.
- **Proteção contra Força Bruta**: `MemoryRateLimiter` com janela deslizante de 15 minutos e bloqueio automático após 5 tentativas incorretas consecutivas (HTTP 429).
- **Redação de Dados Sensíveis**: Sanitizador recursivo (`redactSensitiveData`) mascarando senhas, CPFs, tokens de sessão e chaves de API em logs e detalhes de execução.
- **Sessões de Produção**:
  - `POST /auth/register` — cadastro com criação atômica de Organização, Usuário titular e fluxo inicial SDR.
  - `POST /auth/login` — emissão de token de sessão opaco com hash SHA-256 e cookie HttpOnly `eimax_session`.
  - `POST /auth/logout` — invalidação imediata no banco e expiração de cookie.
  - `GET /auth/me` — resolução segura da empresa e perfil com base na sessão ativa.
  - `DevelopmentGuard` unificado, suportando tanto sessões de desenvolvimento quanto sessões de produção reais.

## Limpeza e Auditoria
- O diretório temporário `D:\VEXOR\flow-saas` foi auditado, seus algoritmos válidos (validação de CPF, criptografia AES-GCM, rate limiting) foram migrados para o padrão limpo do projeto e o diretório foi completamente excluído.

## Comandos realmente executados

| Comando | Resultado da rodada final |
| --- | --- |
| npm install | Dependências sincronizadas; 0 vulnerabilidades |
| npm run db:generate | Prisma Client 6.19.3 gerado com modelos de Usuários, Sessões, Leads e Execuções |
| npm run db:migrate | Migrações 1 (`foundation`) e 2 (`executions_and_auth`) aplicadas com sucesso no PostgreSQL 18 local |
| npm run build:packages | Compilação TypeScript de `workflow-schema` e `workflow-engine` concluída sem erros |
| npm test | **31 testes unitários passaram** (24 de motor/regras de blocos + 7 de segurança/criptografia/rate-limiter) |
| npm run test:integration | **16 testes de integração passaram** contra API Nest e PostgreSQL reais (isolamento de empresas, revisão otimista, imutabilidade, execução real com idempotência e autenticação de produção com CPF) |
| npm run lint | **0 erros, 0 warnings** em todo o monorepo |
| npm run typecheck | Compilação e verificação de tipos estritos concluídas com sucesso |
| npm run build | **Build de produção completo passou** (pacotes, Prisma, API Nest e Next.js com 8 rotas) |

## Cobertura comprovada
- **Unitários**: Configuração/saída dos 8 blocos, regras numéricas/textuais, adapters injetados, interrupção por falha com supressão de tokens, redação de dados sensíveis, validação de CPF (mod 11), criptografia simétrica AES-GCM, hash scrypt e rate limiting de login.
- **Integração**: Persistência de workflows, revisão concorrente, publicação serializada, trigger de imutabilidade, isolamento multi-empresa (Empresa A não acessa dados da Empresa B), execução real de automações com deduplicação por idempotência, cadastro com CPF criptografado e login de produção.

## Próximos passos (Fase 4 & 5)
- Interface visual expandida para gestão de execuções com filtros de status e reprocessamento manual.
- Suíte completa de ponta a ponta (E2E Playwright) validando fluxo de cadastro até execução do webhook.
