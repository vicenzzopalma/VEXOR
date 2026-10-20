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

## Fase 4 — Ciclo Comercial Operacional em Produção (Concluída)
- **Extensão do Modelo de Dados (Migration 202610200003)**:
  - Tabela `Lead`: Adicionadas colunas estruturadas (`name`, `email`, `company`, `budget`, `score`, `source`, `status`, `assigned_membership_id`, `tags`, `updatedAt`).
  - Tabela `Notification`: Criada com `id`, `organization_id`, `lead_id`, `execution_id`, `channel`, `recipient`, `title`, `message`, `status`, `createdAt`.
  - Índices multiempresa e relacionamentos com `Membership`, `Execution` e `Organization`.
- **Efeitos de Execução Reais no Motor (`runner.ts`)**:
  - `sdr.assign`: Consulta membro real ativo (`Membership`) da organização com papel `owner` ou `editor`, atualiza `Lead.assignedMembershipId` e eleva status para `QUALIFIED`.
  - `tag.add`: Atualiza array JSON de tags no PostgreSQL para o lead.
  - `manager.notify`: Insere registro real na tabela `Notification` com canal `MANAGER_NOTIFICATION`, status `DELIVERED` e destinatário corporativo.
  - `email.send`: Insere registro na tabela `Notification` (`channel: 'EMAIL'`) e marca lead como `DISQUALIFIED` caso desça pelo caminho de nutrição.
  - Avaliação de Condições: Trata bifurcações `true` / `false` persistindo o resultado no histórico de passos.
- **Gestão de Leads e Notificações na API**:
  - `GET /leads`: Listagem de leads com status, orçamento, pontuação, responsável atribuído e contagem de notificações.
  - `GET /leads/:id`: Detalhes completos do lead com histórico de execuções e notificações vinculadas.
  - `PATCH /leads/:id`: Atualização de status e tags com isolamento estrito de organização.
  - `GET /notifications`: Listagem de alertas e notificações corporativas.
- **Distinção Visual e Dashboard**:
  - Nova rota `/leads` no frontend com tabela de gestão, filtros de status (`QUALIFIED`, `DISQUALIFIED`, `NEW`) e modal de detalhamento.
  - Aba comutadora em `/execucoes` distinguindo **Execuções Reais** (motor + worker com banco) de **Simulações** (validação sem efeitos externos).
  - Componente `RunLog` exibindo notificações disparadas, SDR atribuído e duração em milissegundos de cada etapa.
- **Demonstração E2E Automatizada**:
  - Script `scripts/demo-commercial-cycle.mjs` demonstrando o ciclo completo com lead corporativo, persistência no PostgreSQL, avaliação de condição, atribuição de SDR, notificação e idempotência.
- **Estudo Técnico WhatsApp**:
  - Documento `docs/research/whatsapp-integration.md` diferenciando tecnicamente Conexão via QR Code (Evolution API/Baileys) de API Oficial Meta (Cloud API/WABA/HSM/janela de 24h).

## Comandos realmente executados

| Comando | Resultado da rodada final |
| --- | --- |
| npm install | Dependências sincronizadas; 0 vulnerabilidades |
| npm run db:generate | Prisma Client 6.19.3 gerado com modelos de Usuários, Sessões, Leads, Notificações e Execuções |
| npm run db:migrate | Migrações 1 (`foundation`), 2 (`executions_and_auth`) e 3 (`202610200003_real_commercial_cycle`) aplicadas com sucesso no PostgreSQL 18 local |
| npm run build:packages | Compilação TypeScript de `workflow-schema` e `workflow-engine` concluída sem erros |
| npm test | **31 testes unitários passaram** (24 de motor/regras de blocos + 7 de segurança/criptografia/rate-limiter) |
| npm run test:integration | **22 testes de integração passaram** contra API Nest e PostgreSQL reais (isolamento de empresas, revisão otimista, imutabilidade, ciclo comercial E2E completo, avaliação de condição, atribuição de SDR real, notificação e idempotência) |
| node scripts/demo-commercial-cycle.mjs | **Demonstração E2E do ciclo comercial concluída com 100% de sucesso** e comprovação direta no banco |
| npm run lint | **0 erros, 0 warnings** em todo o monorepo |
| npm run typecheck | Compilação e verificação de tipos estritos concluídas com sucesso |
| npm run build | **Build de produção completo passou** (pacotes, Prisma, API Nest e Next.js com 9 rotas compiladas) |

## Cobertura comprovada
- **Unitários**: Configuração/saída dos 8 blocos, regras numéricas/textuais, adapters injetados, interrupção por falha com supressão de tokens, redação de dados sensíveis, validação de CPF (mod 11), criptografia simétrica AES-GCM, hash scrypt e rate limiting de login.
- **Integração e E2E**: Persistência de workflows, revisão concorrente, publicação serializada, trigger de imutabilidade, isolamento multi-empresa (Empresa A não acessa dados da Empresa B), execução real de automações com deduplicação por idempotência, cadastro com CPF criptografado, login de produção, ciclo comercial com lead persistido, avaliação de regra de orçamento, atribuição de SDR real (`Membership`), disparo de notificação (`Notification`) e histórico no dashboard.

## Próximos passos (Fase 5)
- Suíte completa de ponta a ponta de interface (E2E Playwright) validando jornada de criação de lead no navegador.
- Implementação do adapter do provedor WhatsApp Meta Cloud API com suporte a templates HSM.
