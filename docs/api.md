
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
| GET /workflows/:id/versions/:number | owner/editor/viewer | Snapshot imutável, escopo por empresa |
| POST /workflows/:id/simulate | owner/editor | `{revision, lead}`; interpreta grafo e persiste logs seguros |
| GET /workflows/:id/simulations | owner/editor/viewer | Histórico deste processo |
| GET /simulations | owner/editor/viewer | Últimas 50 simulações da empresa |
| GET /opt-outs?status= | owner/editor/viewer | Outbox de descadastro (SAIR) da empresa: até 200 registros, sem tokens nem conversas |
| GET /opt-outs/status | owner/editor/viewer | Contagens por status e se existe mapeamento Esfera para a empresa |
| POST /opt-outs | owner/editor | `{phone, note?}` descadastro manual; vira evento `MANUAL` e revoga consentimento dos leads do número |
| POST /opt-outs/:id/resolve | owner/editor | `{decision: CONFIRM\|DISMISS, expectedUpdatedAt}` decide um pedido ambíguo em `REVIEW`; conflito 409 |
| POST /opt-outs/:id/retry | owner | `{expectedUpdatedAt}` reenfileira uma entrega `FAILED` |

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
