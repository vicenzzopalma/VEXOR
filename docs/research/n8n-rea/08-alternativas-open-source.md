# 08. Alternativas open source ao n8n

Levantamento feito em 29/10/2026. Dados lidos direto do GitHub com `gh api repos/<dono>/<repo>`, `/license`, `/contents` e `/git/trees`. Estrelas e último push são desse dia. Nenhum repositório foi clonado.

Objetivo: achar o que o VEXOR (Next.js + React 19 + @xyflow/react 12 + NestJS + Prisma/PostgreSQL, produto comercial) pode reaproveitar.

Regra usada no veredito:
- **Pode reaproveitar código**: licença MIT, Apache 2.0 ou BSD na parte que interessa. Exige manter aviso de copyright e licença. Apache 2.0 também exige manter o NOTICE e marcar arquivos alterados.
- **Só referência de comportamento**: licença restritiva, stack diferente, ou projeto arquivado. Olhar como funciona e reescrever do zero.
- **Evitar**: licença que contamina ou proíbe uso comercial. Nem abrir o código durante a implementação da fatia equivalente.

## Tabela-resumo

| Projeto | Licença (SPDX / real) | Stack do frontend | React Flow? | Veredito |
|---|---|---|---|---|
| n8n-io/n8n | Sustainable Use License + `.ee` sob licença Enterprise (GitHub mostra NOASSERTION) | Vue 3 | Não (usa @vue-flow/core 1.48) | Evitar código. Só referência de comportamento |
| activepieces/activepieces | MIT fora de `packages/ee/` e `packages/server/api/src/app/ee/` (comercial) | React 19 + Vite | Sim, @xyflow/react 12.3.5 | **Pode reaproveitar código** (fora das pastas ee) |
| simstudioai/sim | Apache-2.0 | Next.js 16 + React 19 | Sim, @xyflow/react 12.12 | **Pode reaproveitar código** |
| langflow-ai/langflow | MIT | React 19 + Vite | Sim, @xyflow/react 12 (ainda tem reactflow 11) | **Pode reaproveitar código** (frontend) |
| synergycodes/workflowbuilder | Apache-2.0 | React 18/19 | Sim, @xyflow/react | **Pode reaproveitar código** |
| triggerdotdev/trigger.dev | Apache-2.0 | Remix + React 18 | Não (sem canvas) | **Pode reaproveitar código** (execuções, CodeMirror) |
| kestra-io/kestra | Apache-2.0 (EE é produto fechado separado) | Vue 3 | Não (@vue-flow/core) | Pode reaproveitar, mas Vue. Na prática, referência |
| node-red/node-red | Apache-2.0 | jQuery + D3 próprio | Não | Referência de comportamento |
| FlowiseAI/Flowise | Apache-2.0 fora de `packages/server/src/enterprise` (comercial). **Arquivado em 08/2026** | React 18 + MUI | reactflow 11 (API antiga) | Referência. Código pontual com cuidado |
| langgenius/dify | Apache 2.0 modificada (proíbe multi-tenant sem licença; logo obrigatório no `web/`) | Next.js + React | Sim, reactflow | Só referência de comportamento |
| windmill-labs/windmill | AGPL-3.0 (backend e frontend) + trechos proprietários; Apache só em clients e spec OpenFlow | Svelte 5 | @xyflow/svelte | Evitar código. Spec OpenFlow pode ser lida |
| automatisch/automatisch | AGPL-3.0 + arquivos `.ee.` sob licença Enterprise. CLA | React 18 + MUI | Sim, @xyflow/react 12.8 | Evitar código |
| huginn/huginn | MIT | Rails (Ruby) | Não | Referência de comportamento |
| temporalio/temporal | MIT | Go (UI à parte: temporalio/ui, MIT, Svelte) | Não | Usar como infraestrutura (SDK TS MIT) |
| inngest/inngest | SSPL-1.0 com conversão para Apache 2.0 após 3 anos. SDK inngest-js é GPL-3.0 | Next.js + React 18 | Não | Evitar código |
| PipedreamHQ/pipedream | Pipedream Source Available License (proíbe uso comercial concorrente) | Componentes Node.js | Não | Evitar código |
| xyflow/xyflow | MIT | React / Svelte | É o próprio | Já usamos. Base do canvas |
| retejs/rete | MIT | Agnóstico (plugin React) | Não, alternativa ao React Flow | Pode reaproveitar, mas não vale trocar |
| codemirror/dev (CodeMirror 6) | MIT. Repositório **migrou** para code.haverbeke.berlin em 04/2026 | Agnóstico | n/a | **Usar como dependência** (editor de expressões) |
| uiwjs/react-codemirror | MIT | React | n/a | **Usar como dependência** |
| microsoft/monaco-editor + suren-atoyan/monaco-react | MIT / MIT | Agnóstico / React | n/a | Usar como dependência (editor de código) |
| uiwjs/react-json-view | MIT | React (peer >=18) | n/a | **Usar como dependência** (visualizador JSON) |
| microlinkhq/react-json-view | MIT (fork mantido do mac-s-g) | React | n/a | Alternativa ao uiwjs |

Números brutos (estrelas / último push):

| Repositório | Estrelas | Último push |
|---|---|---|
| n8n-io/n8n | 208.980 | 29/10/2026 |
| langgenius/dify | 159.893 | 29/10/2026 |
| langflow-ai/langflow | 156.138 | 29/10/2026 |
| FlowiseAI/Flowise | 55.533 | 13/08/2026 (arquivado) |
| huginn/huginn | 50.175 | 26/10/2026 |
| microsoft/monaco-editor | 46.917 | 26/10/2026 |
| xyflow/xyflow | 38.818 | 29/10/2026 |
| kestra-io/kestra | 30.059 | 29/10/2026 |
| simstudioai/sim | 29.934 | 29/10/2026 |
| activepieces/activepieces | 25.273 | 29/10/2026 |
| temporalio/temporal | 24.061 | 29/10/2026 |
| node-red/node-red | 23.793 | 26/10/2026 |
| windmill-labs/windmill | 18.314 | 29/10/2026 |
| triggerdotdev/trigger.dev | 16.650 | 29/10/2026 |
| automatisch/automatisch | 14.004 | 11/02/2026 |
| retejs/rete | 12.297 | 25/10/2026 |
| PipedreamHQ/pipedream | 11.763 | 29/10/2026 |
| codemirror/dev | 7.808 | 15/04/2026 (arquivado, migrou) |
| inngest/inngest | 6.001 | 29/10/2026 |
| suren-atoyan/monaco-react | 4.757 | 26/10/2026 |
| uiwjs/react-codemirror | 2.258 | 24/09/2026 |
| synergycodes/workflowbuilder | 425 | 29/10/2026 |
| uiwjs/react-json-view | 423 | 06/10/2026 |
| microlinkhq/react-json-view | 419 | 27/10/2026 |

## Projeto a projeto

### n8n-io/n8n
- URL: https://github.com/n8n-io/n8n
- Licença: `LICENSE.md` confirma. Tudo fora de `.ee` está sob Sustainable Use License 1.0. Uso só interno ou não comercial. Proíbe distribuir ou oferecer a terceiros de forma paga.
- Pastas e arquivos `.ee`: 1.591 caminhos na árvore do `master`. Exemplos: `packages/@n8n/ai-workflow-builder.ee`, `packages/cli/src/sso.ee`, `packages/cli/src/environments.ee`, `packages/cli/src/modules/source-control.ee`, `packages/cli/src/modules/external-secrets.ee`, `packages/cli/src/modules/log-streaming.ee`. Exigem licença Enterprise (`LICENSE_EE.md`).
- Branches que não são `master` não têm licença nenhuma. Tem CLA (`CONTRIBUTOR_LICENSE_AGREEMENT.md`).
- Stack: Vue 3, @vue-flow/core 1.48.0, CodeMirror 6 no editor de expressões, vue-json-pretty.
- Veredito: **evitar código**. É a referência de comportamento (já documentada nos arquivos 01 a 07). Implementar a partir do comportamento observado, nunca do código.

### activepieces/activepieces
- URL: https://github.com/activepieces/activepieces
- Licença: MIT Expat para tudo fora de `packages/ee/` e `packages/server/api/src/app/ee/`. Essas duas pastas seguem `packages/ee/LICENSE` (comercial).
- Atenção: existe `packages/core/shared/src/lib/ee/` (authn, billing, audit-events, alerts). O texto da licença não a cita, mas o nome indica recurso pago. Tratar como ee e não copiar.
- Stack: React 19, Vite, @xyflow/react 12.3.5, @uiw/react-codemirror, @tanstack/react-table, react-json-view 1.21.3. Backend Fastify + TypeORM + BullMQ.
- Reaproveitável: canvas do builder, painel de passo, seletor de dados (data selector com menções), lista e detalhe de runs, motor de execução em sandbox, conexões OAuth2, centenas de "pieces" (WhatsApp, Gmail, Google Sheets, IMAP, SMTP, HTTP, Schedule, Webhook).
- Veredito: **pode reaproveitar código**, fora das pastas ee. É o candidato mais próximo do VEXOR em stack.

### simstudioai/sim
- URL: https://github.com/simstudioai/sim
- Licença: Apache-2.0 no repositório todo. `NOTICE` curto ("Sim Studio, Copyright 2026"). Não há pasta ee. As páginas "enterprise" são só marketing e docs.
- Stack: Next.js 16, React 19.2, @xyflow/react 12.12, Monaco. Mesmo stack do VEXOR.
- Reaproveitável: canvas, bloco de workflow, aresta, painel editor de bloco com sub-blocks, `tag-dropdown` (autocompletar de referências a saídas de blocos anteriores), executor em DAG, agendamentos, OAuth, ferramentas WhatsApp/Gmail/Sheets/HTTP/SMTP, página de logs.
- Veredito: **pode reaproveitar código**. Melhor par de stack com o VEXOR.

### langflow-ai/langflow
- URL: https://github.com/langflow-ai/langflow
- Licença: MIT, sem exceções encontradas.
- Stack: frontend React 19 + Vite + @xyflow/react 12 (ainda com reactflow 11 como dependência). Backend Python (FastAPI).
- Reaproveitável: `GenericNode` (nó com handles tipados e parâmetros), `parameterRenderComponent`, `jsonEditor`, `jsonOutputComponent`, `dataTableTabComponent`, `csvOutputComponent`. O backend é Python, então o motor não serve direto.
- Veredito: **pode reaproveitar código** do frontend.

### synergycodes/workflowbuilder
- URL: https://github.com/synergycodes/workflowbuilder
- Licença: Apache-2.0. README afirma white-label permitido.
- Stack: React (peer 18 ou 19), @xyflow/react, execução durável com Temporal (`@temporalio/worker`, `@temporalio/workflow`). Backend com Drizzle.
- Reaproveitável: SDK de editor com paleta, canvas, barra de propriedades gerada por JSON Schema, variáveis, rastreio de mudanças, i18n. Worker genérico que executa qualquer diagrama no Temporal, com ramos paralelos, decisão, retry por tipo de nó e passo de aprovação humana.
- Veredito: **pode reaproveitar código**. Projeto pequeno (425 estrelas), mas feito para isto.

### triggerdotdev/trigger.dev
- URL: https://github.com/triggerdotdev/trigger.dev
- Licença: Apache-2.0 no repositório todo. Nenhuma pasta ee.
- Stack: Remix + React 18, CodeMirror 6, @tanstack/react-table. Sem canvas.
- Reaproveitável: telas de runs (`apps/webapp/app/components/runs/v3`, com `trace`), editor JSON em CodeMirror (`apps/webapp/app/components/code`), motor de execução (`internal-packages/run-engine`) e agendador (`internal-packages/schedule-engine`) em Postgres + Redis.
- Veredito: **pode reaproveitar código** para execuções e agendamento.

### kestra-io/kestra
- URL: https://github.com/kestra-io/kestra
- Licença: Apache-2.0. A edição Enterprise não está neste repositório. Na UI só há `EnterpriseBadge.vue`.
- Stack: backend Java, UI Vue 3 + @vue-flow/core + Monaco. Biblioteca `kestra-io/ui-libs` sem licença detectada pelo GitHub.
- Reaproveitável: modelo de fluxo declarativo em YAML, triggers e agendamento, telas de execução e logs (`ui/src/components/executions`, `logs`, `triggers`).
- Veredito: licença permite, mas Vue e Java. Usar como **referência de comportamento**. Não usar `ui-libs` (sem licença declarada).

### node-red/node-red
- URL: https://github.com/node-red/node-red
- Licença: Apache-2.0.
- Stack: editor próprio em jQuery + D3 (`packages/node_modules/@node-red/editor-client/src/js/ui/view.js`). Runtime Node.js.
- Reaproveitável: ideias de paleta, debug sidebar, subflows, grupos, histórico de deploy. O código não encaixa em React.
- Veredito: **referência de comportamento**.

### FlowiseAI/Flowise
- URL: https://github.com/FlowiseAI/Flowise
- Licença: Apache 2.0, exceto `packages/server/src/enterprise` e arquivos com aviso próprio (ex.: `IdentityManager.ts`), que são comerciais.
- Estado: **arquivado** em agosto de 2026. README aponta para a discussão "Future of Flowise".
- Stack: React 18, MUI, reactflow 11.
- Veredito: referência. Código pontual só da parte Apache, sabendo que não terá correções.

### langgenius/dify
- URL: https://github.com/langgenius/dify
- Licença: Apache 2.0 com condições extras. Proíbe operar ambiente multi-tenant com o código sem autorização. Proíbe remover logo e copyright no frontend (`web/`).
- Stack: Next.js + React + reactflow. Canvas em `web/app/components/workflow` (nós, painel, run, variable-inspect).
- Veredito: **só referência de comportamento**. O VEXOR é multi-tenant, então copiar código cria risco direto.

### windmill-labs/windmill
- URL: https://github.com/windmill-labs/windmill
- Licença: AGPLv3 em `backend/` e `frontend/`, com trechos proprietários (flag "enterprise" e checagem de licença). Apache 2.0 só nos clients (python, deno, go, powershell) e no `openflow.openapi.yaml`. Tem CLA.
- Stack: backend Rust, frontend Svelte 5 + @xyflow/svelte + Monaco.
- Veredito: **evitar código**. A spec OpenFlow (Apache) pode inspirar o formato do JSON de fluxo.

### automatisch/automatisch
- URL: https://github.com/automatisch/automatisch
- Licença: AGPL-3.0 em tudo, exceto arquivos com `.ee.` no nome (licença Enterprise). Tem CLA. Último push em 02/2026.
- Stack: React 18 + MUI + @xyflow/react 12.8 + Monaco.
- Veredito: **evitar código**. AGPL obrigaria abrir o VEXOR inteiro se servido pela rede.

### huginn/huginn
- URL: https://github.com/huginn/huginn
- Licença: MIT.
- Stack: Ruby on Rails. Sem canvas moderno.
- Veredito: **referência de comportamento** (modelo de agentes que trocam eventos, agendamento simples).

### temporalio/temporal
- URL: https://github.com/temporalio/temporal
- Licença: MIT. SDK TypeScript (`temporalio/sdk-typescript`) também MIT. UI (`temporalio/ui`) MIT, em SvelteKit.
- Stack: servidor Go.
- Veredito: **usar como infraestrutura** se o VEXOR precisar de execução durável real (esperas longas, retomada após queda). Não é editor visual.

### inngest/inngest
- URL: https://github.com/inngest/inngest
- Licença: SSPL-1.0 com "Apache 2.0 Future License" (cada versão vira Apache 3 anos após publicada). SDK `inngest-js` é GPL-3.0.
- Stack: Go + UI Next.js/React 18.
- Veredito: **evitar código**. SSPL é incompatível com SaaS fechado. Só versões com mais de 3 anos viram Apache.

### PipedreamHQ/pipedream
- URL: https://github.com/PipedreamHQ/pipedream
- Licença: Pipedream Source Available License 1.0. "Excluded Purpose" inclui qualquer uso comercial, SaaS ou plataforma concorrente. Os componentes (ex.: `components/whatsapp_business`) não têm licença própria, então herdam a da raiz.
- Veredito: **evitar código**. Dá para ler a documentação das APIs de terceiros, não os componentes.

### xyflow/xyflow
- URL: https://github.com/xyflow/xyflow
- Licença: MIT. Os exemplos "Pro" do site são pagos e ficam fora do repositório.
- Veredito: já é a base do canvas do VEXOR. Exemplos públicos da documentação podem ser usados.

### retejs/rete
- URL: https://github.com/retejs/rete (plugin React em `retejs/react-plugin`, MIT)
- Veredito: pode reaproveitar, mas trocar de React Flow não compensa. Útil só como referência de engine de dataflow.

### CodeMirror 6, @uiw/react-codemirror, Monaco
- CodeMirror 6: MIT. O repositório `codemirror/dev` e os pacotes (`codemirror/view`, `codemirror/autocomplete`) foram arquivados no GitHub em 04/2026 e migraram para https://code.haverbeke.berlin/codemirror/dev. Os pacotes npm `@codemirror/*` seguem publicados.
- `uiwjs/react-codemirror`: MIT, wrapper React. O activepieces usa.
- Monaco (`microsoft/monaco-editor`) e `suren-atoyan/monaco-react`: MIT. Sim e Dify usam.
- Veredito: **usar como dependência**. Para expressões `{{ }}` com autocompletar, CodeMirror 6 é mais leve e é o que o próprio n8n usa. Monaco fica para o nó de código.

### Visualizadores JSON
- `uiwjs/react-json-view` (`@uiw/react-json-view`): MIT, TypeScript, peer React >=18. Mantido.
- `microlinkhq/react-json-view` (`@microlink/react-json-view` 1.31.x): MIT, fork mantido do `mac-s-g/react-json-view` (original parado em 1.21.3).
- Veredito: **usar como dependência**. Preferir `@uiw/react-json-view` pela tipagem e React 19.

## O que dá para reaproveitar no VEXOR, por fatia da matriz

Só repositórios permissivos. Caminhos confirmados na árvore do branch padrão em 29/10/2026. Antes de copiar, conferir o arquivo e manter o cabeçalho de licença.

### Canvas
- Sim: `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block`, `workflow-edge`, `note-block`, `subflows`, `canvas-menu`, `block-menu`, `action-bar`, `workflow-controls`, `search-replace`, `cursors`.
- activepieces: `packages/web/src/app/builder/flow-canvas`, `packages/web/src/app/builder/pieces-selector`, `packages/web/src/app/builder/state`, `packages/web/src/app/components/builder-layout`.
- workflowbuilder: `packages/sdk/src/features/diagram`, `packages/sdk/src/features/palette`, `packages/sdk/src/features/changes-tracker`, `packages/sdk/src/node`.
- langflow: `src/frontend/src/CustomNodes/GenericNode`, `src/frontend/src/CustomNodes/NoteNode`, `src/frontend/src/components/core/canvasControlsComponent`.

### Painel do nó (entrada, parâmetros, saída)
- activepieces: `packages/web/src/app/builder/step-settings`, `piece-properties`, `step-data`, `test-step`, `data-display`.
- Sim: `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor` (sub-blocks), `components/terminal/components/output-panel`.
- workflowbuilder: `packages/sdk/src/features/properties-bar` e `packages/sdk/src/features/json-form` (formulário a partir de JSON Schema).
- langflow: `src/frontend/src/components/core/parameterRenderComponent`, `jsonOutputComponent`, `dataTableTabComponent`, `csvOutputComponent`.
- Visualização JSON/tabela: `@uiw/react-json-view` + `@tanstack/react-table`.

### Execuções (lista, detalhe, motor)
- activepieces: `packages/web/src/app/builder/run-list`, `packages/web/src/app/builder/run-details`, `packages/web/src/features/flow-runs`, motor em `packages/server/engine` e worker em `packages/server/worker`, fila em `packages/server/api/src/app/workers/job-queue`.
- Sim: executor em `apps/sim/executor` (`dag`, `execution`, `handlers`, `orchestrators`, `human-in-the-loop`), serialização em `apps/sim/serializer`, logs em `apps/sim/app/workspace/[workspaceId]/logs`.
- trigger.dev: `apps/webapp/app/components/runs/v3` (lista e trace), `internal-packages/run-engine`.
- workflowbuilder: `apps/execution-worker/src` e `packages/temporal/src/workflow` (execução durável no Temporal).
- Temporal (MIT) como infraestrutura, se precisar de esperas longas.

### Expressões (editor com autocompletar)
- Base: CodeMirror 6 (`@codemirror/autocomplete`, `@codemirror/view`, `@codemirror/language`) via `@uiw/react-codemirror`.
- Sim: `.../panel/components/editor/components/sub-block/components/tag-dropdown` (autocompletar de saídas de blocos anteriores) e `env-var-dropdown`.
- activepieces: `packages/web/src/app/builder/data-selector` (árvore de dados para inserir referência).
- trigger.dev: `apps/webapp/app/components/code` (setup de CodeMirror com tema e JSON).
- workflowbuilder: `packages/sdk/src/features/variables` e `syntax-highlighter`.

### Nós genéricos e conectores
- activepieces: framework em `packages/pieces/framework`, núcleo em `packages/pieces/core/http`, `webhook`, `schedule`, `smtp`, `delay`, `store`, `data-mapper`. Comunidade em `packages/pieces/community/whatsapp`, `gmail`, `google-sheets`, `imap`, `json`.
- Sim: definições em `apps/sim/blocks/blocks`, ferramentas em `apps/sim/tools/http`, `whatsapp`, `gmail`, `google_sheets`, `smtp`, `mailgun`, gatilhos em `apps/sim/triggers`.

### Credenciais e OAuth
- activepieces: `packages/web/src/features/connections`, `packages/server/api/src/app/app-connection` (fora de qualquer `ee`).
- Sim: `apps/sim/lib/oauth`.

### Agendamento
- activepieces: `packages/pieces/core/schedule`, `packages/server/api/src/app/trigger`.
- Sim: `apps/sim/lib/workflows/schedules`, `apps/sim/app/api/schedules`.
- trigger.dev: `internal-packages/schedule-engine`.

## Riscos de licença

1. **n8n**: Sustainable Use License proíbe uso comercial para terceiros. Arquivos `.ee` exigem licença paga. Branches fora do `master` não têm licença. Nada de copiar código, CSS, ícones, textos de UI ou nomes internos. Só comportamento observado.
2. **AGPL (windmill, automatisch)**: copiar qualquer trecho obriga a publicar o código do VEXOR para quem usa pela rede. Windmill ainda mistura trechos proprietários. Automatisch tem `.ee.` fechado.
3. **SSPL (inngest)**: exige abrir toda a pilha de serviço. O SDK é GPL-3.0. Evitar.
4. **Source available (pipedream)**: proíbe uso comercial concorrente, inclusive nos componentes.
5. **Dify**: Apache modificada. Proíbe multi-tenant sem autorização. VEXOR é multi-tenant.
6. **Pastas ee em projetos permissivos**: activepieces (`packages/ee/`, `packages/server/api/src/app/ee/`, e por cautela `packages/core/shared/src/lib/ee/`) e Flowise (`packages/server/src/enterprise`, `IdentityManager.ts`). Conferir o caminho antes de copiar.
7. **Projetos arquivados**: Flowise (08/2026) e o espelho GitHub do CodeMirror (04/2026). CodeMirror segue vivo fora do GitHub. Flowise não terá correções.
8. **Sem licença declarada**: `kestra-io/ui-libs`. Sem licença é "todos os direitos reservados". Não usar.
9. **Obrigações do que for copiado**: MIT pede manter o aviso de copyright. Apache 2.0 pede manter LICENSE e NOTICE, e marcar arquivos modificados. Sugestão: pasta de terceiros no repositório e um arquivo `THIRD_PARTY_NOTICES` com origem, commit e licença de cada trecho.
10. **Contaminação cruzada**: quem já leu código do n8n para uma fatia não deve reescrever a mesma fatia copiando de outro lugar sem registro. Registrar a origem de cada trecho no ledger (`00-ledger-evidencias.md`).
