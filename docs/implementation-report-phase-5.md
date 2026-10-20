# Fase 5 — integrações e canais comerciais

## Inspeção inicial

Git inicialmente limpo em `7b6c40e`, após `7b78449` (runtime) e `f79d3f4` (interface). Lidos AGENTS, progresso, relatório anterior, roadmap, estudo WhatsApp e Prisma; inspecionados API, worker, outbox, conectores, editor e leads. Nenhum arquivo de `D:\VERITAS` foi acessado ou alterado.

| Classificação inicial         | Evidência                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementada e validada       | Base unitária reexecutada: 46 testes passaram. Contratos, motor e variáveis existentes foram preservados. A suíte completa será repetida nesta fase.                        |
| Implementada parcialmente     | Adaptadores Meta/Evolution, contas, outbox, consentimento, recibos e leads existem; faltava registro declarativo dos conectores e contexto da conversa.                     |
| Dependente de serviço externo | Pareamento QR, autorização empresarial, envio/recebimento real e homologação de provedores. Sem gateway confirmado; chamadas externas continuam desabilitadas.              |
| Ausente                       | Conectores Sheets/e-mail/CRM, preparação OAuth, limites persistentes e auditoria de falhas dos webhooks.                                                                    |
| Defeituosa/incompleta         | Ingresso WhatsApp distribuía jobs na requisição, sem tarefa durável de distribuição, e não fixava rotas no primeiro recebimento. Contexto da mensagem não chegava ao motor. |

## Conjunto 1 — contratos

Registro declarativo versionado para Meta, Evolution, Resend, Google Sheets, RD Station e HubSpot. Autenticação, schemas Zod, campos de formulários, ações, gatilhos, estados e capacidades são declarados por provedor. Catálogo público não serializa schemas nem credenciais e não declara homologação. Contratos de CRM permanecem explicitamente sem adapter.

Verificação executada: `npm run build:packages` passou; `npm test` passou com **54 testes**. Integrações reais ainda dependem de configuração e autorização externas.

## Conjunto 2 — ingresso durável e conversa

- Webhook WhatsApp autentica os bytes originais/segredo do gateway, normaliza o envelope, persiste `WhatsAppEvent` e devolve o aceite. A API não percorre o workflow durante a requisição.
- A primeira recepção fixa as versões publicadas elegíveis no campo `routing`. Repetições não alteram payload nem rotas. O worker distribui cada evento em transação com `FOR UPDATE SKIP LOCKED`, enfileira execuções idempotentes e registra processamento/falha. Interrupção antes do commit mantém o evento pendente por rollback do PostgreSQL.
- `Execution.eventData` preserva o contexto individual da mensagem. Execuções antigas continuam usando `Lead.data`. Contato é reutilizado por organização, workflow e conta/telefone; não há unificação global de contatos entre workflows nesta fase.
- Texto recebido está disponível como pílula. O novo bloco **Atualizar lead da conversa** altera nome, empresa ou e-mail, validando o valor. Mutações do mesmo lead são serializadas; uma execução anterior não substitui o cadastro quando já existe execução mais recente para o contato. Aviso ao responsável continua sendo notificação interna `AVAILABLE`, com membership elegível explícito.
- Histórico do lead exibe mensagens recebidas e estados da outbox. Eventos da conta são consultáveis na tela WhatsApp. Histórico de ingresso autenticado/rejeitado permanece restrito à organização.
- Limites duráveis: 300 requisições/minuto por endereço de socket e 120 por recurso/endereço. Endereços são usados apenas para hash do bucket; logs não armazenam corpo, tokens ou endereço. Proxy reverso deverá ter sua política de endereços revisada antes de produção; cabeçalhos enviados pelo cliente não são confiados.
- Webhooks genéricos preservam o segredo legado por cabeçalho e aceitam credencial configurada em modo HMAC, com assinatura sobre `timestamp + '.' + bytes originais`, tolerância de cinco minutos e deduplicação persistente. O modo é escolhido no servidor por organização/referência, sem fallback do modo HMAC para o segredo legado.

## Conjunto 3 — conectores e outbox

- Evolution: contratos para criar instância Baileys, consultar sessão, solicitar QR real, reiniciar e desconectar. API e UI expõem essas operações a owners, com comparação de revisão para impedir que respostas antigas sobrescrevam edições posteriores. Sem gateway habilitado as operações externas ficam bloqueadas; desconectar localmente continua possível.
- Meta: configuração de número/WABA/versão, token protegido, validação HMAC e handshake, descoberta de templates simples aprovados, envio de texto e template pelo adapter existente. Não foi implementado Embedded Signup.
- Resend: verificação de domínio remetente, outbox transacional selecionável no bloco de e-mail, envio assíncrono com chave idempotente estável, ID externo e recibos Svix autenticados. ID de aceite permanece `PENDING`; `SENT`/`DELIVERED` dependem de recibo, e falhas são preservadas. Aberturas são registradas como evento `OPENED`, sem promover entrega automaticamente.
- Dispatcher compartilhado reserva outbox atomicamente e usa token de posse para cercar resultados atrasados. Rejeição explícita 429 permite retry limitado. E-mail permite recuperação de resposta incerta com a mesma chave e payload dentro de janela conservadora de 23 horas; máximo de três tentativas. WhatsApp sem idempotência do provedor exige conciliação após resultado incerto ou reserva abandonada.
- Google Sheets: adapter para listar planilhas/abas, ler células e anexar linhas com entrada `RAW`; allowlist de campos e mapeamento visual de múltiplas colunas com prévia local. Contratos limitam linhas/células, validam identificadores e escapam nomes de abas. Não foi habilitado um fluxo produtivo de importação/exportação.
- OAuth Google: preparação de URL, estado aleatório com hash persistido, PKCE, verifier criptografado, expiração e consumo único por organização/conta. A troca de código por tokens, renovação e callback público continuam pendentes. A interface comunica essa limitação e não inicia autorização incompleta como conexão concluída.
- RD Station e HubSpot: contratos versionados e formulários de cadastro preparatórios; adapters produtivos ainda ausentes.

## Migração e compatibilidade

Aplicada localmente, sem remoção de dados: `202610200009_phase5_integrations`. Acrescenta contexto de execução, inbox em `WhatsAppEvent`, campos de reserva/retry em `Notification`, conexões comerciais, tentativas OAuth, recibos de e-mail, buckets e auditoria de webhooks. As tabelas Lead, Membership, Execution e Notification foram aproveitadas. Eventos anteriores recebem `COMPLETED` para não reproduzir efeitos históricos.

Executado `prisma migrate diff` **somente para leitura**. Não há divergência nos objetos novos. Foram observadas divergências anteriores em nomes/ações de FKs e no default de `Notification.channel`, que continuam como dívida de alinhamento entre schema e migrações antigas. Nenhum SQL sugerido por esse diagnóstico foi executado. Também não foram alteradas as migrações antigas.

## Configuração externa pendente

| Configuração do servidor                              | Utilização                                                                                                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONNECTOR_ENCRYPTION_KEY`                            | 32 bytes em hexadecimal; mesma chave estável na API e worker. Rotação exige estratégia de recriptografia. Não usar chave aleatória de teste em ambiente persistente. |
| `WHATSAPP_EXTERNAL_ENABLED`                           | Habilitação explícita de operações externas WhatsApp; permanece desabilitada nesta validação.                                                                        |
| `WHATSAPP_GATEWAY_ORIGINS`                            | Allowlist de origens HTTPS Evolution. DNS privado, IPs reservados e redirecionamentos são bloqueados; TLS usa endereço validado e fixado.                            |
| `EMAIL_EXTERNAL_ENABLED`                              | Habilitação explícita de Resend. Domínio/remetente e credenciais precisam ser homologados.                                                                           |
| `GOOGLE_SHEETS_EXTERNAL_ENABLED`                      | Habilitação de chamadas ao Google; não completa OAuth automaticamente.                                                                                               |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_REDIRECT_URI` | Preparação local da autorização; troca/renovação de tokens ainda pendente.                                                                                           |
| `WEBHOOK_CREDENTIALS_JSON`                            | Por organização/referência: string para legado ou objeto `{secret, mode: 'hmac'}`. Nenhum segredo é incluído no workflow.                                            |

Credenciais das contas são criptografadas em PostgreSQL e omitidas nas respostas. Só a configuração pública é retornada. Não há credenciais reais, envios externos, contratação ou deploy nesta entrega. Todos os IDs de provedor usados nos testes são fixtures.

## Verificações finais

| Comando                                                           | Resultado final em 20/10/2026                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run build`                                                   | Passou: pacotes, Prisma, worker, API e Next.js, com as duas rotas de integrações              |
| `npm run lint`                                                    | Passou, sem warnings                                                                          |
| `npm run typecheck`                                               | Passou                                                                                        |
| `npm test`                                                        | **64 testes passaram**, seis arquivos                                                         |
| `npm run test:integration`                                        | **46 testes passaram**, cinco arquivos, PostgreSQL/API locais                                 |
| `npm run test:e2e`                                                | **11 testes passaram**, desktop e celular; 1 arraste exclusivo de desktop ignorado no celular |
| `prisma validate --schema packages/database/prisma/schema.prisma` | Passou com URL local configurada                                                              |
| `git diff --check`                                                | Passou com a configuração normal do repositório                                               |

Verificações incrementais: contratos passaram inicialmente com 54 testes; o novo bloco elevou a base a 55 e os contratos comerciais a 64. A primeira rodada de integração detectou duas falhas de fixture: dependência de um lead estrangeiro previamente existente e identidade de classe CommonJS/ESM para erro injetado. Foram corrigidas criando dados independentes e utilizando a mesma classe do runtime. O teste de QR ausente foi ajustado para exigir a rejeição correta `QR_UNAVAILABLE`. As suítes finais acima passaram após as correções.

O diagnóstico inicial de `prisma validate` sem `DATABASE_URL` retornou P1012; a execução com configuração local passou. Uma checagem Git forçando `core.autocrlf=false` interpretou CRLF como whitespace; a checagem normal do repositório passou. Nenhuma dessas duas invocações alterou dados ou código de produto.

### Checagem com worker ativo

Executado `node tests/fixtures/phase5-smoke.mjs` com API, PostgreSQL e worker iniciados por `npm run dev`. O script usa apenas HTTP e consultas de verificação; não importa nem chama o runner. Resultado: `QUEUED` → `COMPLETED`, uma tentativa, uma execução para o evento repetido, versão publicada persistida, duas etapas e etiqueta `Lead qualificado` gravada no lead. Evidência em `docs/validation/phase5-worker-pipeline.json`. As flags de WhatsApp, e-mail e Sheets foram explicitamente mantidas em `false`; nenhum envio externo foi iniciado.

## Evidências e limitações

- Testes de integração verificam PostgreSQL/API reais; transportes de provedores são injetados e isolados, sem chamadas de envio. Não constituem prova de entrega, QR, pareamento ou homologação.
- Casos novos: HMAC e replay antigo, recibos Svix duplicados/fora de ordem, limites e auditoria, isolamento/RBAC/FK composta, revisões concorrentes, mapeamento e proteção contra acesso a leads de outra empresa, estados OAuth concorrentes/expirados, reserva simultânea de outbox, retry com chave estável, recuperação e mudança de configuração.
- Teste WhatsApp agora comprova aceite antes da criação das execuções, processamento posterior da inbox, snapshot fixado mesmo após nova publicação, mensagens com contextos distintos, atualização persistente do lead e histórico restrito à organização.
- Reexecutados os testes existentes de dois processos disputando 20 jobs e interrupção de processo com recuperação. Artefatos locais: `docs/validation/queue-concurrency.json`, `queue-recovery.json`, `queue-retry.json` e capturas `integrations-desktop.png`/`integrations-mobile.png`.
- Ainda pendentes: homologação com Meta/Evolution/Resend; callback/troca/renovação OAuth Google; importação/exportação produtiva; adapters de CRM; Embedded Signup; mídia e templates parametrizados; política de retenção/monitoramento e dimensionamento de índices para grande volume. Conciliação de resultados WhatsApp incertos exige intervenção; não há botão para reenviar cegamente.
- Próxima fase recomendada: homologar uma única conta autorizada em ambiente controlado, validar sessão/QR/assinaturas/recibos, concluir OAuth Google e só então habilitar transferências de leads com consentimento e registros de lote.

## Referências técnicas consultadas

Fontes primárias: [Resend envio](https://resend.com/docs/api-reference/emails/send-email), [idempotência Resend](https://resend.com/blog/engineering-idempotency-keys), [verificação Svix](https://docs.svix.com/receiving/verifying-payloads/how-manual), [Sheets append](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append), [entrada RAW](https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption), [OAuth Google](https://developers.google.com/identity/protocols/oauth2/web-server) e [rotas Evolution](https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/routes/instance.router.ts). Compatibilidade com instalações específicas ainda requer homologação.

## Arquivos alterados nesta fase

- `tests/fixtures/phase5-smoke.mjs`
- `docs/validation/phase5-worker-pipeline.json`
- `apps/api/src/workflows/ingress.service.ts`
- `apps/api/src/workflows/integration.controller.ts`
- `apps/api/src/workflows/integration.service.ts`
- `apps/api/src/workflows/whatsapp.controller.ts`
- `apps/api/src/workflows/whatsapp.service.ts`
- `apps/api/src/workflows/workflow.controller.ts`
- `apps/api/src/workflows/workflow.service.ts`
- `apps/api/src/workflows/workflows.module.ts`
- `apps/web/app/globals.css`
- `apps/web/app/integracoes/page.tsx`
- `apps/web/app/integracoes/whatsapp/page.tsx`
- `apps/web/components/icons.tsx`
- `apps/web/components/inspector.tsx`
- `apps/web/components/listings.tsx`
- `apps/web/components/shell.tsx`
- `apps/web/lib/api.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/runner.ts`
- `docs/implementation-report-phase-5.md`
- `docs/progress.md`
- `docs/validation/editor-desktop-simulation.png`
- `docs/validation/editor-mobile-simulation.png`
- `docs/validation/integrations-desktop.png`
- `docs/validation/integrations-mobile.png`
- `docs/validation/queue-concurrency.json`
- `docs/validation/queue-recovery.json`
- `docs/validation/queue-retry.json`
- `package-lock.json`
- `packages/connectors/package.json`
- `packages/connectors/src/commercial.ts`
- `packages/connectors/src/contracts.ts`
- `packages/connectors/src/index.ts`
- `packages/connectors/src/whatsapp-events.ts`
- `packages/database/prisma/migrations/202610200009_phase5_integrations/migration.sql`
- `packages/database/prisma/schema.prisma`
- `packages/workflow-engine/src/index.ts`
- `packages/workflow-runtime/src/delivery.ts`
- `packages/workflow-runtime/src/inbox.ts`
- `packages/workflow-runtime/src/index.ts`
- `packages/workflow-schema/src/index.ts`
- `packages/workflow-schema/src/variables.ts`
- `scripts/development-sessions.mjs`
- `tests/e2e/operations.spec.ts`
- `tests/fixtures/oauth-state.ts`
- `tests/integration/phase5.test.ts`
- `tests/integration/whatsapp.test.ts`
- `tests/unit/commercial-connectors.test.ts`
- `tests/unit/connector-registry.test.ts`
- `tests/unit/workflow.test.ts`
