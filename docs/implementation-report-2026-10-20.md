# Continuidade VEXOR — relatório de implementação

## Auditoria do estado original

Todos os arquivos obrigatórios foram lidos antes da implementação. O repositório estava limpo; não houve reinício do projeto, troca de arquitetura, delegação, deploy ou contratação de serviço.

| Classificação original     | Constatação e tratamento                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completo no ambiente local | Editor React Flow, composição biblioteca/canvas/inspetor, contratos Zod, salvamento otimista, snapshots imutáveis, simulador e histórico PostgreSQL. Preservados.                              |
| Parcial                    | Execuções, leads, notificações, autenticação e multiempresa tinham persistência, mas não comprovavam operação assíncrona ou prontidão pública.                                                 |
| Defeituoso                 | API executava o fluxo na requisição. Worker encontrava o job e retornava por idempotência. Não havia reserva atômica, lease, recuperação ou retry seguro. Corrigidos no runtime compartilhado. |
| Resultado fictício         | E-mails/avisos `DELIVERED` sem provedor e SDR escolhido pelo primeiro membro. Corrigidos; histórico preservado e semântica reclassificada.                                                     |
| Simulado                   | Simulador e espera instantânea. Simulação continua explicitamente sem efeitos externos. Espera real indisponível agora falha em vez de alegar agendamento.                                     |
| Ausente                    | Pílulas, resolução segura, contas WhatsApp, outbox de mensageria e blocos nativos. Base e implementação local adicionadas. Homologação externa continua ausente.                               |

## Resultado por entrega

**A:** API transacional registra lead e job `QUEUED`, exige versão publicada e fixa `versionId`. Reserva `SKIP LOCKED` incrementa tentativa, registra histórico e entrega token/lease. Runner trabalha sobre a execução existente, bloqueia execução e lead e confirma efeitos/etapas/resultado juntos. Recuperação marca tentativa abandonada. Erros transitórios de transação têm rollback e backoff; erro de ação não recebe retry cego. SIGINT/SIGTERM aguardam o worker e liberam Prisma. A API não chama o interpretador para executar automações.

**B:** componentes visuais no inspetor preservam o formato string antigo (`{{lead.name}}`, `{{steps.assign.assignedTo}}`). Usuário insere, altera ou remove pílulas e visualiza exemplo. Servidor valida referências anteriores; resolução não executa código, bloqueia campos fora da allowlist e trata ausentes/nulos/tipos inválidos. React renderiza os valores como texto. Histórico oculta conteúdo interpolado.

**C:** contas nomeadas por organização, credenciais cifradas AES-256-GCM com chave de ambiente obrigatória, respostas sem segredos, RBAC e membership. Transporte HTTPS verifica allowlist, DNS público IPv4, endereço fixado, redirects bloqueados, timeout total e tamanho de resposta. QR só vem do gateway e não confirma sessão. Webhooks usam HMAC Meta sobre bytes originais ou segredo da conexão Evolution.

**D:** pendente por decisão explícita do usuário: **sem provedor disponível; manter Configuração necessária**. Não houve pareamento, envio, recebimento ou confirmação real de mensagem. Testes de contratos com fixtures não são prova de entrega externa.

**E:** blocos locais e contratos de mensagem recebida, texto, template sem parâmetros aprovado e notificação interna ao SDR. Conexão desconectada impede publicação/enfileiramento; envio exige telefone/consentimento e, na Meta, janela ou template aprovado. Outbox reutiliza `Notification`, com `PENDING → PROCESSING`, identificador do provedor e recibos autenticados/reconciliados. Aceitação sem confirmação permanece `PENDING` com ID e não reenvia. Reservas de envio abandonadas falham com necessidade de reconciliação. Gatilho de nova conversa fica bloqueado até suporte comprovado. Homologação externa e recursos avançados de templates permanecem pendentes.

Leads reutilizam os modelos existentes. Novos eventos WhatsApp reutilizam o contato por organização/workflow/conexão; não concedem consentimento automaticamente. Gestão permite filtros, responsável explícito elegível, etiquetas, status e histórico. A API recusa responsável de outra empresa; uma FK composta protege também conexão/outbox. Sessão de produção resolve papel pela membership, não pelo campo de empresa do cliente.

## Migrações aplicadas

| Migração                                      | Alteração                                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `202610200004_durable_execution_queue`        | Lease, token, disponibilidade, início/duração e limite de tentativas em Execution; índices parciais; default PENDING em Notification.                     |
| `202610200005_whatsapp_connections`           | WhatsAppConnection/WhatsAppEvent; colunas da outbox e unicidade por bloco/ID de provedor; reclassificação de alegações históricas sem entrega comprovada. |
| `202610200006_whatsapp_leads`                 | Telefone, consentimento, última entrada e chave de contato em Lead; ativação explícita de conexão.                                                        |
| `202610200007_execution_attempt_history`      | Diário JSON de tentativas dentro da Execution existente.                                                                                                  |
| `202610200008_notification_connection_tenant` | FK composta adicional de conexão/organização, sem remover a FK histórica.                                                                                 |

Não houve reset do banco ou migração destrutiva. Triggers/sequences criados e removidos pela suíte pertencem exclusivamente às fixtures de falha/interrupção.

## Comandos e evidências

| Comando executado                       | Resultado                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm install --ignore-scripts`          | Workspaces sincronizados; auditoria npm sem vulnerabilidades; aviso de peer metadata de @types/node/Vite registrado.           |
| `npm run db:generate`                   | Prisma 6.19.3 gerado.                                                                                                          |
| `npm run dev` / migrações locais        | Migrações 4–8 aplicadas; API, PostgreSQL e web locais iniciados; worker controlado por fixtures na suíte.                      |
| `npm run build`                         | Passou para pacotes, worker, Nest e Next.                                                                                      |
| `npm run lint`                          | Passou sem erros/warnings. Corrigido import não utilizado preexistente no gerador monstro.                                     |
| `npm run typecheck`                     | Passou, com worker incluído no comando.                                                                                        |
| `npm test`                              | **46 passaram**.                                                                                                               |
| `npm run test:integration`              | **34 passaram** com PostgreSQL/API reais.                                                                                      |
| `npm run test:e2e`                      | **9 passaram**, desktop/celular; **1 ignorado** por ser arraste exclusivo de desktop.                                          |
| `prisma migrate diff` (somente leitura) | Encontrou drift histórico de nomes/regras de FKs/default de canal. Não foi aplicada a sugestão de remover/recriar constraints. |

Os testes comprovam 20 jobs disputados por dois processos com participação de ambos, 20 IDs distintos e uma tentativa por job. O processo é encerrado durante `processReservedExecution`, com efeitos ainda não commitados; recuperação confirma uma execução final e diário ABANDONED/COMPLETED. Um erro PostgreSQL `40001` introduzido por trigger confirma rollback de tags/etapas e sucesso na tentativa seguinte. Repetições de webhook autenticado não duplicam jobs, e segredo de outra organização é rejeitado.

Evidências sanitizadas persistidas, geradas dos resultados consultados no PostgreSQL:

- [Concorrência](validation/queue-concurrency.json).
- [Recuperação após interrupção](validation/queue-recovery.json).
- [Rollback e retry](validation/queue-retry.json).
- Screenshots desktop/celular em `docs/validation/editor-*.png`.

Os testes WhatsApp verificam contratos e persistência com fixtures: cifra, assinatura, RBAC, isolamento, recibos fora de ordem, ingresso idempotente, consentimento e falha sem configuração. **Nenhuma dessas fixtures representa entrega real.**

Verificação adicional com o worker normal de `npm run dev`: `DEMO_MEMBERSHIP_ID=dev-owner node scripts/demo-commercial-cycle.mjs` passou. A execução `6eb4a9c3-d08b-48a2-82df-4ec387be514e` utilizou o snapshot `4275c03d-27bc-477f-9c25-3bee0f39aedc`, concluiu na tentativa 1, persistiu o responsável escolhido e a etiqueta, criou um único aviso `AVAILABLE` e confirmou deduplicação e isolamento. Zero mensagens externas. O ambiente foi deixado com API/web/PostgreSQL/worker locais ativos e WhatsApp sem habilitação externa.

## Arquivos modificados

Backend: `apps/api/src/main.ts`; `apps/api/src/workflows/{development.guard,runner,workflow.controller,workflow.service,workflows.module,whatsapp.controller,whatsapp.service}.ts`; `apps/worker/src/{index,runner}.ts`.

Pacotes: `packages/database/prisma/schema.prisma` e as cinco migrações acima; novos `packages/workflow-runtime/{package.json,tsconfig.json,src/index.ts}` e `packages/connectors/{package.json,tsconfig.json,src/index.ts}`; `packages/workflow-schema/src/{index,variables}.ts`; `packages/workflow-engine/src/{index,variables}.ts`.

Interface: `apps/web/app/integracoes/whatsapp/page.tsx`; `apps/web/app/globals.css`; `apps/web/components/{editor,icons,inspector,listings,run-log,shell,ui,variable-input,workflow-node}.tsx`; `apps/web/lib/api.ts`.

Verificação/ambiente: `package.json`, `package-lock.json`, `vitest.integration.config.mts`; `scripts/{dev,development-sessions,demo-commercial-cycle,generate-monstro}.mjs`; `tests/unit/{workflow,variables,connectors}.test.ts`; `tests/integration/{api,commercial-cycle,queue,whatsapp}.test.ts` e `helpers.ts`; `tests/fixtures/queue-worker.ts`; `tests/e2e/{variables,operations}.spec.ts`.

Documentação: `docs/progress.md`, `docs/architecture.md`, `docs/operations.md`, este relatório e evidências de validação. Nenhum `.env`, segredo, log privado ou arquivo `.local` foi adicionado ao Git.

## Riscos e pendências

- A API permanece local; não houve deploy nem alegação de SaaS público pronto. Autenticação pública, proteção operacional e revisão das configurações legadas de CPF ainda exigem outra fase.
- Não há provedor WhatsApp. Faltam homologação dos endpoints/versão do gateway, pareamento real, ida/volta de mensagem autorizada, OAuth/Embedded Signup e teste de falha real de provedor.
- Templates com parâmetros, mídia e botões não estão habilitados. O catálogo consulta até 100 templates. Evento de nova conversa não é alegado como suportado.
- Resultado externo incerto exige reconciliação manual; não há garantia de exactly-once ou retry automático sem idempotência do provedor.
- E-mail ainda exige um provedor; espera real durável/checkpoints permanecem pendentes e não simulam sucesso.
- Filtros de leads operam sobre a lista atual de até 100 registros; paginação e gestão de equipes/rodízio ficam para outra fatia.
- Corrigidas as falhas introduzidas/encontradas na validação: UTC versus fuso do PostgreSQL, bloqueio da DLL Prisma durante build Windows e modal de leads no celular. Drift histórico de FKs/default foi documentado, sem mudanças amplas fora do escopo.

Configuração detalhada e critérios para habilitar integrações futuras: [operations.md](operations.md).
