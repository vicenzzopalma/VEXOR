# VEXOR — Relatório de implementação da Fase 5.1

Data da verificação: 20/10/2026. Escopo: estabilização do PostgreSQL, conectores, inbox/outbox e homologação local. A Fase 6 não foi iniciada.

## Resultado

A auditoria identificou divergências reais no schema, violações de escopo que as FKs existentes não impediam, e falhas em recuperação e ordenação de mensagens. As correções foram aplicadas por migrações aditivas e mudanças localizadas no runtime. A integração foi exercitada com PostgreSQL, API e worker locais. Nenhum gateway WhatsApp, conta de provedor, credencial homologada ou autorização para envio externo estava disponível; as evidências abaixo separam execução local de homologação real.

## Problemas identificados e correções

### PostgreSQL e integridade

- A auditoria comparou o Prisma com o catálogo PostgreSQL e o histórico/checksum das migrações. Foram encontrados nomes divergentes em três FKs, uma FK redundante simples sobre `Notification.connectionId` mantida junto da FK composta por organização, e o default implícito de `Notification.channel`. As regras reais de atualização/exclusão também não coincidiam com alguns defaults do Prisma.
- `202610200010_phase51_schema_alignment` alinhou nomes, removeu somente a FK redundante (a FK composta validada continua protegendo conta e organização) e removeu o default implícito de canal. O Prisma explicita as regras já efetivas de `ON UPDATE` e preserva as regras reais de exclusão; nenhuma linha foi alterada.
- Testes negativos comprovaram que o banco aceitava membership de outra organização, lead de outro tenant em execução/notificação, workflow ou versão de outro tenant e mudança de tenant em registros existentes. Não havia linhas inválidas antes da correção.
- `202610200011_phase51_commercial_scope` adiciona triggers para validar essas relações no PostgreSQL, inclusive em escritas que não passam pela API, e impede mudar a organização/proprietário do escopo após a criação. As FKs existentes e seus comportamentos de exclusão continuam em vigor. A primeira versão da função de trigger falhou numa fixture válida para `Execution`; `202610200012_phase51_scope_dispatch` corrigiu a resolução por tabela, e o caso positivo agora é regressão coberta.
- Os testes também verificam os caminhos `ON DELETE SET NULL` existentes para membership/lead/execução. Não foram apagados dados de negócio.
- A comparação de fingerprints integrais antes/depois da migração 10 confirmou preservação exata dos 19 conjuntos de tabelas, então com 2.926 registros. Os snapshots integrais permanecem em `.local` (ignorado pelo Git); os relatórios públicos contêm contagens e metadados. Migrações 1–12 têm checksums correspondentes aos arquivos. O replay em banco isolado aplicou as 12 migrações e terminou com `prisma migrate diff` vazio.
- A contagem da base principal cresceu para 4.152 registros durante as suites e smoke tests subsequentes, que criam fixtures. Por isso uma nova comparação contra o snapshot anterior retorna diferença esperada de conteúdo; a prova de preservação é o fingerprint comparado imediatamente após as migrações, antes da execução desses testes. O banco não foi resetado ou limpo.
- O retrato de auditoria posterior aos testes, com 4.152 registros e os 12 checksums alinhados, está em [phase51-final-database-current.json](validation/phase51-final-database-current.json).

Migrações aplicadas localmente: `202610200010_phase51_schema_alignment`, `202610200011_phase51_commercial_scope` e `202610200012_phase51_scope_dispatch`. As duas últimas usam funções/triggers SQL intencionais que não são relações Prisma. Nenhuma migração antiga foi reescrita.

### Runtime e conectores

- E-mail: jobs `PROCESSING` com timestamp nulo agora são recuperáveis. Tentativas de retry param antes de exceder a janela conservadora de idempotência do provedor. A versão da configuração é fixada ao enfileirar, impedindo enviar sob uma credencial ou remetente alterados; versões legadas com timestamp continuam aceitas.
- Inbox: uma mensagem recebida antes de uma queda da sessão pode ser processada após a conta desconectar, desde que o evento já autenticado esteja persistido. Ações de saída continuam exigindo sessão conectada. Atualizações de conversa comparam ordenação persistida e não deixam mensagens antigas sobrescrever dados mais recentes.
- WhatsApp: a configuração de cada conexão é fixada no job da outbox. Alteração de conta bloqueia despacho pendente; desconexão real observada pelo dispatcher atualiza o estado local. Meta só marca sessão conectada com identificador correspondente e um estado explícito `CONNECTED`; estados desconhecidos falham fechado.
- Credenciais: validação e decriptação específicas do conector são obrigatórias; falhas de chave/ciphertext são convertidas em erro sanitizado. Respostas públicas filtram campos secretos e desconhecidos. A chave de criptografia continua sendo segredo de ambiente compartilhado entre API/worker; rotação operacional de chaves antigas ainda não está implementada.
- WhatsApp externo agora depende de `WHATSAPP_EXTERNAL_ENABLED=true`, além de conta/configuração válidas. A execução padrão, as suites e o smoke desta fase mantiveram envios externos desligados.
- Webhook HMAC: quando o cliente fornece `x-eimax-event-key`, o identificador agora participa da assinatura (`timestamp.eventKey.rawBody`); a chave não pode ser trocada mantendo a assinatura de outro conteúdo. O caminho sem header preserva o formato anterior (`timestamp.rawBody`) e o segredo legado permanece compatível. Clientes HMAC que enviam header precisam assinar o identificador também.

## Estado real dos conectores

| Conector | Estado comprovado | O que falta para homologação |
| --- | --- | --- |
| Meta WhatsApp Cloud API | Adapter, configuração, assinatura/handshake, webhook inbox, envio/recibos e consulta de sessão implementados e testados localmente com fixtures. Nenhuma sessão real conectada. | App Meta autorizado, WABA/número registrado, token e permissões de mensageria/gestão, versão Graph suportada, URL HTTPS pública e assinatura do webhook. Validar o campo de estado da sessão e callbacks reais. Não enviar mensagem sem autorização específica. |
| Evolution API | Adapter prevê instância, QR real do gateway, status, reconexão, desconexão, webhook e envio. Sem origem HTTPS autorizada/gateway configurado; nenhum QR obtido. | Host/gateway Evolution disponível, versão/rotas compatíveis, allowlist pública, API key, segredo/header de webhook e autorização para parear a conta. Validar ciclo real de sessão e recibos. |
| Resend | Adapter/outbox assíncronos e recibos autenticados testados por transportes injetados. Não houve requisição Resend nem entrega externa. | Domínio remetente verificado, chave Resend, segredo de webhook, endpoint público e autorização explícita para enviar mensagem controlada. |
| Google Sheets | Adapter de leitura/anexação e mapeamento local preparados. Testes isolados; nenhuma conta autorizada. OAuth ainda não completa callback, troca nem renovação de token. | OAuth client/redirect publicados, consentimento autorizado e implementação/validação da troca, renovação e scopes. |
| RD Station / HubSpot | Contratos e schemas apenas. | OAuth/credenciais, adapter, scopes, webhook e homologação isolada do CRM. |
| Notificação interna | Persistida como evento `AVAILABLE`; não é entrega externa e não aparece como `DELIVERED`. | Nenhuma dependência de provedor para a criação local; confirmação de leitura não existe nesta fase. |

## Teste operacional e evidências

O teste local `tests/fixtures/phase51-whatsapp-worker.mjs` passou pelo fluxo:

`webhook WhatsApp assinado → validação da assinatura → WhatsAppEvent persistido → evento duplicado deduplicado → worker → execução versionada → atualização do lead → histórico`

Resultado observado: 1 evento para o ID do provedor, 1 execução `COMPLETED`, tentativa 1, 3 etapas, empresa do lead atualizada pela mensagem e histórico visível na API. A conexão foi marcada `CONNECTED` diretamente como fixture e devolvida a `DISCONNECTED` ao final. O script registra `externalProviderRequests: 0` e `externalMessagesSent: 0`; não constitui teste com Meta nem comprova entrega. Evidência: [phase51-whatsapp-worker.json](validation/phase51-whatsapp-worker.json).

As suites PostgreSQL/API também exercitam autenticação inválida, timestamp HMAC expirado, replay com chave alterada, webhook repetido, isolamento entre organizações, retry, estado desconectado, idempotência da outbox, workers concorrentes sobre 20 jobs e interrupção/recuperação de lease. As evidências de concorrência e recuperação existentes estão em [queue-concurrency.json](validation/queue-concurrency.json) e [queue-recovery.json](validation/queue-recovery.json). Os testes injetam transportes para provar contratos sem chamar provedores.

Evidências de banco: [auditoria antes](validation/phase51-links-database-before.json), [auditoria após migração](validation/phase51-links-database-after.json), [replay das migrações](validation/phase51-migration-replay.json). `prisma migrate diff` da base principal contra o Prisma não apresentou diferenças.

## Verificações executadas

| Comando | Resultado desta rodada |
| --- | --- |
| `npm run build` | Passou: pacotes, Prisma, worker, API e Next.js. |
| `npm run lint` | Passou sem erros ou warnings. |
| `npm run typecheck` | Passou para pacotes, API, web e worker. |
| `npm test` | 74 testes passaram. |
| `npm run test:integration` | 66 testes passaram contra PostgreSQL e API locais. Inclui regressões de banco/runtime e fila concorrente/recuperação. |
| `npm run test:e2e` | 11 passaram; 1 caso de arraste exclusivo de desktop foi ignorado na viewport móvel. |
| Replay isolado de migrações | 12 migrações aplicadas; schema final idêntico ao Prisma; banco da aplicação não foi resetado. |
| `prisma migrate diff` base principal | Sem diferença entre schema efetivo e datamodel. |
| Smoke com API/PostgreSQL/worker ativo | Passou conforme evidência local acima; sem chamada externa. |

Total atual: 151 testes aprovados (74 unitários, 66 de integração, 11 E2E), além de um caso móvel ignorado. Os 121 testes reportados anteriormente (64 + 46 + 11) permanecem cobertos, com 30 regressões adicionais. Não houve acesso ao provedor durante esses comandos.

## Arquivos alterados nesta fase

- API: `apps/api/src/workflows/integration.service.ts`, `whatsapp.service.ts`, `workflow.service.ts`.
- Conectores e runtime: `packages/connectors/src/contracts.ts`, `packages/connectors/src/index.ts`, `packages/workflow-runtime/src/delivery.ts`, `inbox.ts`, `index.ts`.
- Banco: `packages/database/prisma/schema.prisma` e migrações 10–12.
- Scripts/evidências: `scripts/audit-database.mjs`, `scripts/verify-migration-replay.mjs`, `tests/fixtures/phase51-whatsapp-worker.mjs`, `docs/validation/phase51-*`.
- Testes: `tests/integration/phase5.test.ts`, `database-integrity.test.ts`, `stabilization.test.ts`, `tests/unit/connector-stabilization.test.ts`.
- Documentação: `docs/progress.md` e este relatório.

O commit preexistente do usuário `55fee5f att` foi preservado. As mudanças deste relatório não alteraram arquivos de `D:\VERITAS`, não fizeram deploy, não enviaram mensagens, não contrataram serviços e não executaram reset/limpeza do banco.

## Riscos e limites pendentes

- Não há homologação externa: QR, pareamento, conexão Meta/Evolution, envio real, entrega ou leitura continuam sem evidência de provedor.
- A configuração Meta guarda uma versão Graph explícita; sua versão e o retorno real de status devem ser validados com conta autorizada. Estados não reconhecidos falham fechado.
- A inbox usa deduplicação persistente por conexão e ID de evento; um evento sem ID estável do provedor ainda precisa de política específica antes de habilitar esse tipo de gateway.
- Jobs WhatsApp cujo resultado externo é incerto requerem conciliação; reenviar automaticamente poderia duplicar a mensagem. E-mail usa idempotência do Resend dentro da janela conservadora codificada; fora da janela exige reconciliação.
- OAuth Google não conclui autorização e os conectores CRM não fazem chamadas produtivas.
- A assinatura HMAC com event key foi endurecida: integrações existentes que mandam `x-eimax-event-key` devem recalcular assinatura incluindo esse header. Clientes que não mandam o header continuam no contrato anterior.
- A rotação/recriptação de credenciais cifradas precisa de procedimento operacional antes de gerenciar chaves em produção.

## Critérios para autorizar a Fase 6

1. Escolher formalmente um primeiro provedor e obter conta/número de teste autorizado, endpoint público HTTPS e credenciais fornecidas pelo canal seguro de configuração.
2. Concluir o checklist do provedor em ambiente controlado: autenticação real, estado CONNECTED confirmado, webhook válido e inválido, replay, desconexão/reconexão e recibos observados com IDs reais.
3. Manter todos os testes desta fase passando e repetir concorrência/recovery na configuração homologada; comprovar que callbacks e falhas não cruzam organizações nem repetem efeitos.
4. Aprovar separadamente uma mensagem de teste externa antes de validar envio e recibo, com destinatário consentido e limite definido. Até essa aprovação, somente ingressos/contratos locais são aceitáveis como prova.
5. Documentar retenção, rotação de segredos, observabilidade e resposta para resultado externo incerto; resolver o fluxo de OAuth Sheets antes de anunciar sua operação.

Nenhum item acima foi usado como autorização implícita para a Fase 6; esta entrega apenas deixa os critérios explícitos.
