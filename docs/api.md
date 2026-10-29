
# API local — fatia 1

Base `http://127.0.0.1:4000`. O Next encaminha `/api/*` pela mesma origem. Todas as rotas, exceto health, exigem sessão local. Escritas exigem `x-eimax-client: workspace` e origem permitida, quando enviada.

| Método / rota | Permissão | Comportamento |
| --- | --- | --- |
| GET /health | Pública | Estado local, execução real indisponível |
| GET /me | Membership válida | Empresa e papel resolvidos no servidor |
| GET /workflows | owner/editor/viewer | Lista restrita à empresa da sessão |
| POST /workflows | owner/editor | `{template: "sdr", name}` cria cópia |
| GET /workflows/:id | owner/editor/viewer | Rascunho, revisão e metadados de versões |
| PATCH /workflows/:id | owner/editor | `{revision, draft}`; conflito retorna 409 |
| POST /workflows/:id/publish | owner | `{revision}`; valida semântica, serializa publicação, snapshot imutável |
| POST /workflows/:id/activate | owner/editor | `{activationRevision}`; valida a versão publicada mais recente e liga os gatilhos. Erro de ativação: 422, salvo no fluxo (veja abaixo) |
| POST /workflows/:id/deactivate | owner/editor | `{activationRevision}`; desliga todos os gatilhos do fluxo e limpa o erro de ativação |
| GET /workflows/:id/versions/:number | owner/editor/viewer | Snapshot imutável, escopo por empresa |
| POST /workflows/:id/simulate | owner/editor | `{revision, lead, targetNodeId?}`; interpreta grafo e persiste logs seguros. Com `targetNodeId`, só até o bloco (veja abaixo) |
| GET /workflows/:id/simulations | owner/editor/viewer | Histórico deste processo |
| GET /simulations | owner/editor/viewer | Últimas 50 simulações da empresa |
| GET /opt-outs?status= | owner/editor/viewer | Outbox de descadastro (SAIR) da empresa: até 200 registros, sem tokens nem conversas |
| GET /opt-outs/status | owner/editor/viewer | Contagens por status e se existe mapeamento Esfera para a empresa |
| POST /opt-outs | owner/editor | `{phone, note?}` descadastro manual; vira evento `MANUAL` e revoga consentimento dos leads do número |
| POST /opt-outs/:id/resolve | owner/editor | `{decision: CONFIRM\|DISMISS, expectedUpdatedAt}` decide um pedido ambíguo em `REVIEW`; conflito 409 |
| POST /opt-outs/:id/retry | owner | `{expectedUpdatedAt}` reenfileira uma entrega `FAILED` |

## Ativo e inativo por fluxo (migração 20)

`Workflow` ganhou `active` (padrão `true`, então todo fluxo que já recebia eventos continua recebendo), `activationError`, `activeChangedAt` e `activationRevision`; `Simulation` ganhou `targetNodeId` e `reachedTarget`. `GET /workflows`, `GET /workflows/:id` e `GET /projects/:id/workflows` devolvem `active`, `activationRevision` e `activationError`. Um fluxo só recebe eventos quando está ativo **e** tem versão publicada; os eventos usam sempre a versão publicada mais recente.

- `POST /workflows/:id/activate` e `POST /workflows/:id/deactivate` recebem `{activationRevision}` (revisão otimista própria do interruptor; conflito 409), resolvem a empresa pela sessão (outra empresa: 404) e recusam viewer (403). A troca incrementa só `activationRevision`; a revisão do rascunho não muda, então editar em outra aba não conflita. Resposta: `{id, activationRevision, active, activationError, activeChangedAt, activeVersion: {id, number} | null}`.
- Ativar sem versão publicada: 400. Fluxo ou projeto arquivado: 400. Arquivar um fluxo (`POST /workflows/:id/archive` ou `/archive-revision`) desliga o fluxo na mesma escrita; restaurar não religa. Fluxo arquivado é recusado no ingresso como inativo, inclusive se arquivado por um escritor antigo que não desligou o interruptor.
- Erro de ativação: 422 `{message, code: "ACTIVATION_FAILED", activationError, workflow}`. O fluxo fica inativo e `activationError` = `{code, message, action, nodeId?, at}` fica gravado até a próxima ativação bem-sucedida ou uma desativação. Códigos: `TRIGGER_MISSING`, `VERSION_INVALID`, `WEBHOOK_CREDENTIAL_MISSING`, `WHATSAPP_ACCOUNT_MISSING`, `WHATSAPP_ACCOUNT_QUARANTINED`, `WHATSAPP_ACCOUNT_UNAVAILABLE`, `EMAIL_ACCOUNT_UNAVAILABLE`, `WHATSAPP_TEMPLATE_NOT_APPROVED`, `TRIGGER_UNSUPPORTED`, `CONNECTIONS_INVALID`. O caminho do webhook é o ID do fluxo e cada fluxo tem um único gatilho, então não há conflito de caminho a verificar hoje.
- Fluxo inativo: `POST /webhooks/:workflowId` (depois da autenticação; sem credencial continua 401) e `POST /workflows/:id/execute` respondem 409 `{code: "WORKFLOW_INACTIVE"}` sem criar lead nem execução; o webhook fica no log de ingresso com o código `WORKFLOW_INACTIVE`. Um `x-eimax-event-key` já processado também recebe 409 enquanto o fluxo estiver inativo. Mensagens de WhatsApp não são roteadas para fluxo inativo; se o fluxo foi desativado depois do roteamento, o worker marca o evento `IGNORED`/`WORKFLOW_INACTIVE` (ou `COMPLETED`/`SOME_WORKFLOWS_INACTIVE` quando outro fluxo roteado segue ativo). A checagem final fica em `enqueueInTransaction` com `FOR SHARE` na linha do fluxo; ela lança antes de qualquer escrita, e o inbox bloqueia todas as linhas roteadas e pula por fluxo, sem derrubar o evento. Um evento já roteado usa a versão fixada no roteamento. O descadastro (SAIR) é capturado antes e nunca é desfeito pelo estado de um fluxo.

## Testar até um bloco

`POST /workflows/:id/simulate` com `targetNodeId` roda a mesma simulação sem efeitos externos, mas só no trecho entre o gatilho e o bloco escolhido, com o lead enviado. O servidor confere que o bloco existe no rascunho salvo e é alcançável a partir do gatilho (senão 400). Só o trecho precisa estar válido: blocos depois do alvo, blocos soltos e o ramo de condição que não leva ao alvo não impedem o teste. A resposta acrescenta `targetNodeId` e `reachedTarget` (falso quando o lead segue um ramo que não chega ao bloco). Fica registrada como simulação, com `targetNodeId` e `reachedTarget` no histórico (`GET /workflows/:id/simulations`); nenhuma execução real é criada.

## Busca paginada de execuções

`GET /executions/search` e `GET /projects/:id/executions/search` consultam execuções reais da organização da sessão; a segunda rota também restringe ao projeto. Parâmetros opcionais: `page` (inteiro a partir de 1), `workflowId`, `status` (`QUEUED`, `RUNNING`, `SUSPENDED`, `COMPLETED` ou `FAILED`), `from` e `until` (data e hora ISO 8601 com fuso). O intervalo inclui `from` e exclui `until`. Retornam `{items, total, page, pageSize}` com 20 registros por página, ordenados por criação e ID decrescentes. O navegador traduz os dias escolhidos para o seu fuso local. As rotas antigas permanecem disponíveis.

## Descadastro central VEXOR → Esfera

Toda mensagem **recebida individual** (os parsers já descartam grupos e mensagens próprias) é classificada pelo texto: `SAIR` e equivalentes curtos viram `OPT_OUT` e entram na outbox `OptOutEvent` com status `PENDING`; frases com intenção de saída misturadas a outros pedidos viram `AMBIGUOUS` e ficam em `REVIEW` até um membro decidir. A chave estável do evento é `whatsapp:<connectionId>:<id do provedor>`; o mesmo webhook reentregue não cria um segundo pedido. O histórico ajuda na correlação, mas não é exigido: a captura ocorre mesmo sem workflow roteado ou com a conexão desabilitada. Um `OPT_OUT` também revoga `whatsappConsent` dos leads da mesma organização com aquele número.

O worker (`dispatchNextOptOut`) entrega um evento por vez com `FOR UPDATE SKIP LOCKED`, lease de 60 s e backoff exponencial com teto de 10 min, sem limite de tentativas para falhas de rede/autenticação. O destino vem de `ESFERA_OPTOUT_LINKS_JSON` (organização → `baseUrl`, `companyId`, `token`), nunca da requisição.

Contrato enviado ao Esfera, `POST {baseUrl}/api/optout/events` com `Authorization: Bearer <token de empresa do Esfera>`:

```json
{
  "eventId": "whatsapp:<connectionId>:<providerEventId>",
  "companyId": 1,
  "phone": "+5575988052539",
  "source": "vexor",
  "channel": "whatsapp",
  "classification": "OPT_OUT",
  "reason": "Respondeu \"SAIR\" no WhatsApp (VEXOR)",
  "connectionId": "<connectionId>",
  "receivedAt": "2026-10-27T12:00:00.000Z"
}
```

Resposta do Esfera (ACK só após COMMIT durável): `200 {"ack": true, "eventId": "...", "status": "recorded" | "duplicate", "companyId": 1, "phoneKey": "7588052539", "suppressedContacts": 2}`. `401 unauthorized` e `403 company_mismatch` (token de outra empresa) são repetidos com backoff; `400 invalid_payload` marca `FAILED` para revisão humana; `409 event_id_conflict` (mesmo `eventId` para outra empresa) também é repetido e exige revisão. `GET {baseUrl}/api/optout/status` confere o token sem gravar nada.

Um ID pertencente a outra empresa responde 404 em todas as rotas de recurso. O schema strict recusa `organization_id` enviado no corpo; headers/query de empresa não alteram a membership. Reader não escreve/simula; editor não publica. Sessões inválidas recebem 401; ação sem permissão recebe 403; dados ou semântica inválidos recebem 400 com issues.

Rascunhos podem conter configurações incompletas. Publicação e simulação exigem um gatilho, ausência de ciclos, todos os nós alcançáveis, configurações válidas e ambas as saídas da condição. Estrutura JSON: `schemaVersion:1`, `name`, `nodes`, `edges`. Nó: id/type/name/description/position/config. Aresta: id/source/target/branch opcional true/false. Máximo de 100 nós e 200 arestas.

Nenhuma rota recebe ou executa código arbitrário. Nenhuma ação externa está habilitada. O endpoint de sessão de desenvolvimento existe no Next em `POST /api/development/session`; ele não recebe empresa/papel e não está disponível em produção.

## Projetos (migra??o 18)

Todas as rotas usam organiza??o da sess?o/membership; `organizationId` no corpo ? rejeitado. Leitura: qualquer membro; cria??o/renomea??o/movimenta??o/duplica??o: titular ou editor; arquivar/restaurar: titular. Muta??o existente exige `revision` inteiro positivo e retorna 409 se desatualizada.

- `GET /projects`: projetos ativos e arquivados com `workflowCount` (fluxos n?o arquivados) e `lastActivityAt` real.
- `POST /projects`: `{name, description?, color?, icon?}`; nome normalizado ?nico na organiza??o, inclusive arquivados. Cores: primary/success/neutral; ?cones: folder/workflow/users.
- `GET /projects/:id`, `PATCH /projects/:id`: leitura/edi??o (campos acima + revision).
- `POST /projects/:id/archive` e `/restore`: `{revision}`. Arquivar preserva dados e impede edi??o/cria??o de fluxos pelo contexto do projeto; n?o interrompe execu??es/conex?es existentes.
- `GET /projects/:id/workflows`; `POST /projects/:id/workflows`: `{name, template:"sdr"}`.
- `GET /projects/:id/executions` e `/simulations`: hist?rico restrito aos fluxos atualmente vinculados ao projeto.
- `PATCH /workflows/:id/name`: `{name, revision}`.
- `POST /workflows/:id/move`: `{projectId, revision}`; origem/destino precisam pertencer ? organiza??o e estar ativos.
- `POST /workflows/:id/duplicate`: `{revision, name?, projectId?}`; cria novo rascunho, sem copiar vers?es ou hist?rico da origem.
- `POST /workflows/:id/archive-revision` e `/restore-revision`: `{revision}`.

Integra??es/credenciais continuam compartilhadas pela organiza??o; a aba Credenciais explica esse escopo. Rotas antigas permanecem compat?veis; escritores legados sem projectId recebem Geral pelo banco. Arquivar n?o apaga dados.
