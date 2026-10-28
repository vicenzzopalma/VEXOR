# 03. Inventário do VEXOR (estado em 28/10/2026)

Agente D, fase 1 (reconhecimento, somente leitura). Base: repositório `D:\VEXOR\VEXOR`, branch `main`, último commit `325703a` (árvore limpa, só a pasta `docs/research/n8n-rea/` sem rastreio). Nenhum comando de build, teste, servidor ou navegador foi executado. Os prints citados estão em `.local/claude/*.png` e em `docs/validation/*.png`.

Rótulos usados em todo o documento:

- **Observação**: está no código ou nos documentos, com `arquivo:linha`.
- **Inferência**: dedução minha, com o porquê.
- **Desconhecido**: não consegui confirmar sem executar nada.

Convenção: caminhos são relativos à raiz do repositório. Tabelas são compostas apenas de observações (cada linha cita o arquivo).

---

## 1. Visão geral da stack e dos pacotes

**Observação.** Monorepo npm workspaces `apps/*` e `packages/*` (`package.json:5-8`). Nome interno do pacote raiz ainda é `eimax` (`package.json:2`); os pacotes usam o escopo `@eimax/*`; a marca na interface é VEXOR Studio (`apps/web/app/layout.tsx:11`, `apps/web/components/shell.tsx:108-110`).

**Observação.** Versões fixadas em `package.json:27-60`: Next 16.4.2, React 19.2.0, `@xyflow/react` 12.12.0, `@dagrejs/dagre` 1.1.5, `lucide-react` 0.468.0, `@fontsource/inter` 5.2.8, NestJS 11.2.7, Prisma 6.19.3, Zod 3.24.2, Tailwind 4.3.3, TypeScript 5.9.3, Vitest 4.1.12, Playwright 1.56.1, `embedded-postgres` 18.4.0-beta.17. Node mínimo 20.9 (`package.json:26`).

**Observação.** Scripts raiz (`package.json:9-25`): `dev` (supervisor `scripts/dev.mjs`), `whatsapp:setup`, `db:local`, `db:generate`, `db:migrate`, `build:packages`, `build`, `lint` (`--max-warnings=0`), `typecheck`, `test` (unitários), `test:integration` e `test:e2e` (ambos via `scripts/test-services.mjs`), `monstro`.

| Pacote | Papel | Observação (arquivo) |
| --- | --- | --- |
| `apps/web` | Interface Next.js (App Router), React Flow, Tailwind. Encaminha `/api/*` para a API Nest pela mesma origem. | `apps/web/next.config.ts:7-11` (rewrite para `API_ORIGIN` ou `http://127.0.0.1:4000`), cabeçalhos `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` (`:16-18`) |
| `apps/api` | NestJS 11, um único módulo `WorkflowsModule` com 5 controladores e 6 serviços. Escuta só em `127.0.0.1` e recusa iniciar sem `DEVELOPMENT_WORKSPACE=true`. | `apps/api/src/main.ts:20-23,33`; `apps/api/src/workflows/workflows.module.ts:15-33` |
| `apps/worker` | Processo autônomo que roda as filas (execuções, inbox WhatsApp, outbox WhatsApp/e-mail, opt-out, confirmação). Reexporta funções de `@eimax/workflow-runtime`. | `apps/worker/src/index.ts:14-58`; `apps/worker/src/runner.ts:1-11` |
| `packages/workflow-schema` | Catálogo de 14 tipos de nó, schemas Zod de configuração, validação do grafo, variáveis permitidas, modelo SDR, tipos de log. | `packages/workflow-schema/src/index.ts:5-20,174-231,270-357` |
| `packages/workflow-engine` | Interpretador do grafo (condições, resolução de variáveis, efeitos simulados ou de produção, segmentos duráveis com suspensão). | `packages/workflow-engine/src/index.ts:277-429,461-478` |
| `packages/workflow-runtime` | Fila PostgreSQL (`SKIP LOCKED`, lease, token de posse), efeitos de produção transacionais, outbox de entrega, inbox WhatsApp, retomada de espera, opt-out. | `packages/workflow-runtime/src/index.ts`, `delivery.ts`, `inbox.ts`, `resume.ts`, `opt-out.ts` |
| `packages/connectors` | Registro de conectores (8 provedores), criptografia AES-256-GCM, transporte HTTPS com proteção SSRF, adaptadores WhatsApp (Meta, Evolution, Z-API, MOCK), Resend, Google Sheets, parsers de webhook, classificador de SAIR. | `packages/connectors/src/index.ts`, `contracts.ts`, `commercial.ts`, `whatsapp-events.ts`, `opt-out.ts`, `managed-evolution.ts` |
| `packages/database` | Schema Prisma (24 modelos, 1 enum) e 19 migrações SQL versionadas. | `packages/database/prisma/schema.prisma`; `packages/database/prisma/migrations/` (19 pastas) |
| `packages/shared-ui` | Um componente `Button` (variantes default, primary, ghost, danger) e um `tokens.css` com 9 variáveis. | `packages/shared-ui/src/index.tsx:3-9`; `packages/shared-ui/src/tokens.css:1-11` |

**Observação.** `apps/worker/README.md:3-4` ainda diz "Ainda não implementado. Será um processo BullMQ"; o código em `apps/worker/src/index.ts` está implementado sobre PostgreSQL. Documento desatualizado.

**Observação.** `infrastructure/docker-compose.yml` sobe PostgreSQL 17 e Redis 7, mas nenhum código usa Redis (grep por `redis` só encontra `.env.example:9` e o compose). **Inferência.** Redis é resquício do plano original com BullMQ (`docs/architecture.md:27-28`).

**Observação.** `scripts/dev.mjs` sobe, nesta ordem: build dos pacotes (`:87-95`), `prisma generate` (`:96-102`), PostgreSQL embutido (`:103`), `migrate deploy` (`:104-111`), gateway WhatsApp local se configurado (`:112-148`), API em 4000 com espera de `/health` (`:149-169`), worker salvo se `RUN_WORKER=false` (`:170-177`) e Next em 3000 (`:178-185`). Usa `.local/dev.lock` para não disputar com uma execução anterior (`:34-51`).

---

## 2. Telas e rotas

**Observação.** Rotas existentes em `apps/web/app` (lista de `page.tsx`/`route.ts`): `/`, `/processos`, `/projetos`, `/projetos/[id]`, `/editor/[id]`, `/execucoes`, `/leads`, `/templates`, `/integracoes`, `/integracoes/whatsapp` e a rota de API `POST /api/development/session`. Não há rota de login, cadastro, configurações, credenciais por projeto, detalhe de execução ou de lead como página própria.

**Observação.** Casca comum (`apps/web/components/shell.tsx`): trilho esquerdo com ícone da marca (`:56-58`), botão "Trocar projeto" que abre um diálogo (`:60-68,127-151`), itens Projetos, Fluxos do projeto (só quando há projeto no contexto), Modelos, Leads, Execuções, Integrações (`:69-89`), botão "Ajuda e atalhos" e avatar "EU" com título "Sessão local de desenvolvimento" (`:91-104`). Cabeçalho global com "VEXOR studio", nome do projeto atual ou "Meu espaço de trabalho", selo "Ambiente local" e link "Central de ajuda" (`:107-124`). Em telas de 1280 px ou mais o trilho vira barra de 216 px com nomes (`apps/web/app/globals.css:2738-2750`); abaixo de 760 px encolhe para 52 px (`:2200-2222`). Prints: `home.png` (trilho compacto) e `c-execucoes.png` (barra com nomes).

**Observação.** O diálogo de ajuda da casca lista os atalhos: Ctrl Z / Ctrl Shift Z, Ctrl D, Delete, Shift + arrastar, Ctrl S (`shell.tsx:159-180`).

**Observação.** Sessão: todo `fetch` da web passa por `apps/web/lib/api.ts:48-77`, que primeiro chama `POST /api/development/session` (Next) para gravar o cookie `eimax_session` com o token `DEV_OWNER_TOKEN` (`apps/web/app/api/development/session/route.ts:3-24`) e depois envia `x-eimax-client: workspace` em toda requisição. **Inferência.** Não existe tela de login; a web sempre entra como titular (owner) da organização `org-local`.

### 2.1 `/` (Projetos, página inicial)

- **Observação.** Componente `ProjectHome` (`apps/web/components/projects.tsx:221-439`). Título "Projetos", subtítulo, botão "Novo projeto" com a tecla `N` desenhada (`:287-292`), busca com atalho `/` (`:295-305`), ordenação por atividade recente ou nome (`:306-312`), botão "Arquivados"/"Ver ativos" (`:313-316`).
- **Observação.** Cartão de projeto: ícone (pasta, fluxo ou equipe) com cor (violeta, verde, neutra), menu "..." com Editar e Arquivar/Restaurar (só titular arquiva, `:342-350`), nome, descrição, "Abrir projeto", contagem de fluxos "· SAIR ativo" e última atividade (`:333-371`).
- **Observação.** Estados: esqueleto com três cartões cinzas (`:50-63,328-329`), erro com "Recarregar dados" (`:40-49,318`), vazio com três variantes (busca sem resultado, sem arquivados, primeiro projeto) (`:376-403`), aviso "Projeto arquivado" com "Desfazer" (`:319-327`).
- **Observação.** Formulário de projeto em diálogo: nome (obrigatório, 100), descrição (1000), cor, ícone; erro com "Recarregar lista" (`:108-219`).
- **Observação.** Atalhos `/` (foco na busca) e `n` (novo), ignorados quando há diálogo aberto ou foco em campo (`:64-95`).
- **Observação.** Responsivo: grade `auto-fill minmax(285px, 1fr)` (`globals.css:2571`), ajustes abaixo de 760 px (`:2630-2643`).
- **Print `home.png`:** um projeto "REALESS", "0 fluxos ativos", última atividade 28/10/2026 06:55. `projetos.png`/`home2.png`/`home3.png` são variações da mesma tela.

### 2.2 `/processos` e `/projetos`

- **Observação.** Ambas redirecionam para `/` (`apps/web/app/processos/page.tsx:3`, `apps/web/app/projetos/page.tsx:5`). O componente `ProcessList` (tabela "Meus processos") continua em `apps/web/components/listings.tsx:41-138`, mas não é mais renderizado por nenhuma rota. **Inferência.** Código legado mantido por compatibilidade de links (`/processos` ainda aparece em `editor.tsx:528` e `listings.tsx:206`).

### 2.3 `/projetos/[id]` (espaço do projeto)

- **Observação.** `ProjectWorkspace` (`projects.tsx:444-881`), aba inicial pelo parâmetro `?tab=` (`apps/web/app/projetos/[id]/page.tsx:7-11`). Abas Fluxos, Execuções e Credenciais (`projects.tsx:587-601`); a aba oculta `descadastro` abre o fluxo do SAIR em tela cheia (`:550-551`).
- **Observação.** Aba Fluxos: breadcrumb "Projetos / nome" (`:556-560`), cabeçalho com ícone, nome, descrição e "Novo fluxo" com `N` (`:566-580`), busca com `/` e botão Arquivados (`:604-623`), cartão fixo do fluxo do sistema "Descadastro automático (SAIR)" com selo "Sistema", chave "Ativo" e "Abrir" (`:624-650`), lista de fluxos com contagem de blocos, data, status Rascunho/Publicado/Arquivado e menu Renomear, Duplicar, Mover para outro projeto, Arquivar (`:660-715`). Vazio: "Crie o primeiro fluxo deste projeto" (`:717-744`).
- **Observação.** Diálogo único para criar, renomear, mover (seleção de projeto de destino ativo), duplicar e arquivar, com revisão otimista enviada no corpo (`:778-878`, `:507-517`). Criar leva direto ao editor (`:500-505`). Arquivar mostra "Desfazer" (`:651-659`).
- **Observação.** Aba Execuções reutiliza `RunList` com `projectId` (`:747`). Aba Credenciais é apenas um texto explicando que as contas são da organização, com links para `/integracoes` e `/integracoes/whatsapp` (`:748-765`).
- **Observação.** Projeto arquivado: aviso e edição bloqueada (`:482,581-586`).
- **Prints `projeto.png` e `p1-lista.png`:** projeto REALESS, abas, cartão do SAIR, estado vazio "Crie o primeiro fluxo deste projeto".

### 2.4 `/editor/[id]` (editor de fluxos comuns)

Detalhado na seção 3. Print `docs/validation/projects-editor-desktop.png` (28/10): biblioteca à esquerda com abas Blocos | Modelos, canvas pontilhado com nós retangulares (rótulo GATILHO/CONDIÇÃO/AÇÃO, ícone, nome, resumo), inspetor "Propriedades do bloco" à direita, barra inferior "6 blocos · 5 conexões · Pronto para simular · Sessão local · Proprietário". Print mobile `projects-editor-mobile.png`: barra em duas linhas (voltar, breadcrumb, nome, Rascunho, salvar, desfazer, refazer, histórico, Testar, Publicar) e inspetor como gaveta sobre o canvas.

### 2.5 `/execucoes`

- **Observação.** `RunList` sem `projectId` (`apps/web/app/execucoes/page.tsx:4`; `listings.tsx:311-502`). Dois botões de aba: "Execuções Reais" e "Simulações" (`:386-402`). Na aba real, cartão do SAIR com contagem e "Ver execuções" (`:403`, `system-opt-out.tsx:653-698`) e lista de cartões por execução: nome do lead e empresa, data, etapas concluídas, SDR, selo de status (Concluída / Aguardando / outro), botão "Consultar resultado" que abre `RunLog` em diálogo largo (`:411-443,487-499`). Polling a cada 2 s só na aba real (`:351`).
- **Observação.** Vazios: "Nenhuma execução real registrada" (`:446-451`) e, nas simulações, "A história do seu processo começa com um teste" com link para `/editor/starter-sdr` (`:476-484`). O fluxo `starter-sdr` só é criado em bancos de teste (`apps/api/src/workflows/workflow.service.ts:56-61`); no banco de uso esse link tende a cair no erro "Processo não encontrado". **Desconhecido.** Não abri o link por instrução do brief.
- **Observação.** Erro: bloco `validation-errors` com a mensagem (`:405-409`). Carregando: `Loading` (`:358-359`).
- **Observação.** Não existe filtro por fluxo, status ou data, nem paginação (a API devolve 50, `workflow.service.ts:265`).
- **Prints `c-execucoes.png` e `exec2.png`:** cartão do SAIR "10 execuções recentes", vazio "Nenhuma execução real registrada".

### 2.6 `/leads`

- **Observação.** `LeadList` (`listings.tsx:514-1048`). Busca por nome, empresa ou e-mail; filtros de status, origem e responsável (`:670-725`). Tabela com lead/empresa, contato, orçamento, status colorido, SDR, notificações, data e "Ver detalhes" (`:733-828`). Detalhe em diálogo com dados, etiquetas, formulário (responsável, status, etiquetas, telefone, consentimento WhatsApp), conversa recebida, notificações WhatsApp/e-mail e histórico de execuções (`:845-1045`). Conflito 409 mantém as edições e exige "Recarregar dados" (`:847-857`). Carregamento cancelável (`:839-844`).
- **Observação.** Estilos inline em várias partes (`:686-693,764-783,864-896`), fora dos tokens.
- **Print `c-leads.png`:** vazio "Nenhum lead comercial registrado".

### 2.7 `/templates`

- **Observação.** `TemplateList` (`listings.tsx:166-309`): banner, busca, um único cartão "Qualificação de leads" (6 blocos, SDR) com prévia SVG estática (`:140-164`), diálogo que pede projeto de destino e nome e cria via `POST /projects/:id/workflows` (`:184-196,253-306`). Aviso "Novos modelos de vendas e atendimento serão adicionados nas próximas fases" (`:250-252`).
- **Print `c-modelos.png`:** confirma o cartão único.

### 2.8 `/integracoes`

- **Observação.** `IntegrationsPage` (`apps/web/app/integracoes/page.tsx:21-451`). Cartões do catálogo (WhatsApp com "Gerenciar contas", E-mail Resend, Google Sheets, RD Station e HubSpot "Em preparação") (`:79-119`), lista "Contas da organização" com Configurar, Verificar conexão, Desconectar e, para Sheets, "Preparar autorização Google" e "Conferir mapeamento" (`:120-205`). Diálogo de configuração gerado a partir de `fields`/`secretFields` do conector (`:206-288`). Diálogo de mapeamento de planilha com prévia local, até 7 campos (`:289-448`).
- **Print `c-integracoes.png`:** cinco cartões e "Nenhuma conta de e-mail, planilha ou CRM cadastrada".

### 2.9 `/integracoes/whatsapp`

- **Observação.** Página servidor lê o marcador `.local/whatsapp-service-quarantined.json` a cada requisição (`apps/web/app/integracoes/whatsapp/page.tsx:7-16`) e renderiza `WhatsAppClientPage` (`apps/web/components/whatsapp-connection-actions.tsx:76-641`). Provedores oferecidos: Celular via QR Code (serviço gerenciado), Meta, Z-API e Sandbox local (`:67-72`). Cartão por conta com nome, provedor, estado (rótulos em `:39-46`), quarentena, última verificação e botões condicionais: Conectar com QR Code / Ver QR Code, Conectar, Código de pareamento, Verificar conexão, Eventos, Renomear/Configurar, Desconectar/Cancelar conexão, Liberar quarentena, Remover da lista (`:655-748`).
- **Observação.** Diálogos: adicionar/configurar conta por provedor (`:356-521`), QR com expiração em 30 s e polling de 5 s enquanto o QR está na tela (`:108-119,523-551`), liberar quarentena (`:553-591`), código de pareamento com contagem regressiva (`:593-638`), eventos recebidos (`:344-354`).
- **Print `c-whatsapp.png`:** conta "RESERVA 4632", "Celular via QR Code · Conectada", verificada em 26/10/2026.

### 2.10 Fluxo do sistema SAIR (`/projetos/[id]?tab=descadastro`)

Detalhado nas seções 3.6 e 7. Prints `p2-canvas.png` (canvas), `p3-ndv.png` e `p4-ndv-confirm.png` (detalhe Entrada | Parâmetros | Saída), `p5-execucoes.png` e `runs.png` (aba Execuções), `p6-mobile.png` e `m2-resized.png` (celular e janela estreita). O print `sair.png`/`sair-full.png` (11:33) mostra uma versão anterior com quatro cartões numéricos e lista lateral de etapas; o código atual (`system-opt-out.tsx`) corresponde a `p2-canvas.png` (11:41). **Inferência.** O layout com cartões foi substituído no mesmo dia pelo canvas em tela cheia.

---

## 3. Editor de fluxos

### 3.1 Canvas (o que dá para fazer)

- **Observação.** `EditorWorkspace` (`apps/web/components/editor.tsx:88-1244`) com `ReactFlow` (`:804-849`): zoom de 0,25 a 1,8, `fitView` com padding 0,18, seleção múltipla com Shift, pan com botão do meio ou direito no modo seleção, pan com arrasto no modo "mão" ou em telas de toque (`:95-97,840-841`), `connectionRadius` 24, `deleteKeyCode` desligado (a exclusão é tratada à mão). Fundo pontilhado `BackgroundVariant.Dots` gap 18 (`:850`). Minimapa 124x83 no canto inferior direito, com pan e zoom (`:888-897`). Controles de zoom na base esquerda: selecionar, mover, menos, percentual, mais, enquadrar (`:898-933`). Botões no topo direito: abrir biblioteca (gaveta), organizar automaticamente (dagre, `rankdir TB`, `nodesep` 90, `ranksep` 90, `:433-450`), abrir propriedades (`:856-887`).
- **Observação.** Ações sobre nós: adicionar por clique (centro da área visível) ou arrastar da biblioteca (`:401-432`), mover (checkpoint de desfazer ao iniciar o arrasto, `:809`), selecionar, excluir (Delete/Backspace, remove arestas ligadas, `:237-247,294-297`), duplicar com arestas internas (Ctrl D, `:248-270`), limite de 100 blocos com aviso (`:403-406`).
- **Observação.** Arestas: conectar arrastando alças (`:330-347`), reconectar arrastando a ponta (`:348-363`), excluir pelo painel "Excluir conexão" quando há aresta selecionada (`:934-941`) ou pelo evento `remove` (`:825-827`). Validação local: sem auto-ligação, gatilho não recebe, uma saída por alça, sem ciclos (`:306-329`); mensagens via toast (`:332,350`). Arestas de condição têm rótulo "Condição atendida"/"Não atendida" e cores verde/rosa (`:216-236`).
- **Observação.** Atalhos: Ctrl/Cmd Z desfaz, Ctrl Shift Z ou Ctrl Y refaz, Ctrl D duplica, Ctrl S salva, Delete/Backspace exclui, Escape limpa a seleção; ignorados quando há diálogo, modo leitura ou foco em campo (`:271-305`). Histórico de desfazer com 60 posições (`editor-state.ts:56`).
- **Observação.** Canvas vazio mostra "Vamos conectar suas ideias?" com botão "Adicionar primeiro bloco" (`:942-951`). Legenda fixa "Seu próximo grande processo começa aqui" (`:851-855`). Dica "Simples como arrastar" dispensável, guardada em `localStorage` (`:137-147,766-790`).
- **Observação.** Barra de status: contagem de blocos e conexões, botão com o número de ajustes pendentes ou "Pronto para simular", "Último resultado", papel da sessão e ajuda (`:999-1027`).
- **Observação.** Modo leitura (viewer ou fluxo/projeto arquivado): nós não arrastáveis nem conectáveis, biblioteca desabilitada, campos desabilitados (`:150,842-844,737-738`; `inspector.tsx:94`).
- **Observação.** Nó comum (`apps/web/components/workflow-node.tsx:36-89`): cartão retangular com rótulo de tipo (GATILHO, CONDIÇÃO, CONTROLE, AÇÃO), indicador de execução ou inválido, ícone colorido, nome em negrito e uma linha de resumo derivada da configuração (`:13-35`). Alça de entrada no topo (exceto gatilho) e saída na base; a condição tem duas saídas "Sim" e "Não" (`:67-85`).
- **Observação.** Responsividade (`globals.css`): biblioteca 265 px e inspetor 320 px acima de 1600 px (`:2066-2093`); barra compacta abaixo de 1250 px (`:2094-2148`); biblioteca vira gaveta com scrim abaixo de 1050 px (`:2149-2199`); trilho de 52 px abaixo de 760 px (`:2200+`). `docs/design-system.md:19` descreve inspetor em gaveta no celular; o print `projects-editor-mobile.png` confirma.

### 3.2 Biblioteca de nós (catálogo)

- **Observação.** Painel lateral com abas Blocos | Modelos (link para `/templates`), busca por nome e descrição, filtros Todos / Gatilhos / Ações / Lógica, seções com contagem, cartões arrastáveis com ícone, nome, descrição e alça (`editor.tsx:678-765`). Vazio da busca: "Nenhum bloco encontrado" (`:760-764`).
- **Observação.** 14 tipos em `packages/workflow-schema/src/index.ts:5-20`; metadados (nome, descrição, categoria, cor, defaults) em `:22-128`; schema de configuração em `:174-231`; ícones Lucide em `apps/web/components/icons.tsx:14-29`.

| Tipo | Nome na interface | Categoria / cor | Campos (schema Zod) | Campos no inspetor (`inspector.tsx`) |
| --- | --- | --- | --- | --- |
| `lead.created` | Novo lead recebido | Gatilhos / verde | `source` texto 1..200 (`:191`) | Origem do lead (`:275-283`) |
| `webhook.received` | Receber webhook | Gatilhos / verde | `credentialRef` regex `[a-zA-Z0-9_-]{3,80}` (`:192-198`) | Referência da credencial + aviso (`:453-470`) |
| `whatsapp.message.received` | Mensagem WhatsApp recebida | Gatilhos / verde | `connectionId` (`:178`) | Seleção de conta WhatsApp (`:122-146`) |
| `whatsapp.conversation.started` | Nova conversa WhatsApp | Gatilhos / verde | `connectionId` (`:179`) | Conta + aviso "publicação bloqueada" (`:147-152`); publicação falha em `workflow-runtime/src/index.ts:631-632` |
| `condition` | Condição SE / SENÃO | Lógica / âmbar | `field` em budget, score, source, company, email; `operator` em gte, gt, lte, lt, eq, contains; `value` texto ou número; comparações numéricas só com budget/score (`:199-218`) | Campo, Condição, Valor com prefixo R$, explicação Sim/Não (`:222-274`) |
| `wait` | Esperar | Lógica / azul | três formas: `{minutes}` legado; `{mode:'duration', amount, unit (seconds, minutes, hours, days), resumeDeadlineMinutes?}`; `{mode:'until', at ISO com fuso, resumeDeadlineMinutes?}`; máximo 366 dias (`:131-152`) | Tipo de espera, Data/horário ou Tempo + Unidade (`:350-431`). Não há campo para `resumeDeadlineMinutes` |
| `email.send` | Enviar e-mail | Ações / roxo | `to` literal `lead.email`, `subject` 1..200, `body` 1..5000, `connectionId` opcional (`:219-226`) | Conta de e-mail (Resend), Destinatário fixo, Assunto e Mensagem com pílulas (`:284-331`) |
| `sdr.assign` | Atribuir SDR | Ações / azul | `team` texto 1..200 (`:227`); em produção precisa ser `membership:<id>` (`workflow-runtime/src/index.ts:360`) | Seleção de responsável entre memberships owner/editor (`:332-349`) |
| `tag.add` | Adicionar etiqueta | Ações / rosa | `tag` 1..60 (`:229`) | Nome da etiqueta (`:432-441`) |
| `manager.notify` | Notificar gestor | Ações / laranja | `message` 1..1000 (`:230`) | Mensagem com pílulas (`:442-452`) |
| `whatsapp.text.send` | Enviar texto WhatsApp | Ações / verde | `connectionId`, `text` 1..4096 (`:180-182`) | Conta + Mensagem com pílulas (`:153-163`) |
| `whatsapp.template.send` | Enviar template WhatsApp | Ações / verde | `connectionId`, `template` regex `[a-z0-9_]{1,200}`, `language` regex `xx` ou `xx_YY` (`:183-189`) | Conta + seleção entre `approvedTemplates` da conta Meta (`:164-189`) |
| `whatsapp.sdr.notify` | Notificar SDR de mensagem | Ações / azul | `message` 1..1000 (`:190`) | Aviso ao SDR com pílulas (`:190-200`) |
| `whatsapp.lead.update` | Atualizar lead da conversa | Ações / azul | `field` em name, company, email; `value` 1..200 (`:175-177`) | Campo do lead + Valor com pílulas (`:201-221`) |

- **Observação.** Todos os schemas são `strict` (campos desconhecidos recusados). Não existe nó de agendamento/cron, de requisição HTTP genérica, de código, de transformação de dados, de ramificação múltipla (switch), de laço, de sub-fluxo nem de aprovação humana (lista fechada em `:5-20`; o único "schedule" no código é a função `waitSchedule` do nó Esperar, `:154-173`).
- **Observação.** Variáveis: `{{lead.campo}}` para name, company, email, phone, budget, score, source, assignedTo, message e `{{steps.<idDoNó>.<campo>}}` para saídas de sdr.assign, condition, email.send, manager.notify e tag.add (`packages/workflow-schema/src/variables.ts:1-18`). O validador só aceita `steps.` de nós ancestrais no grafo (`index.ts:281-304`). Sem expressões, funções ou JavaScript (`docs/product-spec.md:21`). O editor de variáveis é uma linha de "pílulas" com inserção por menu e prévia com dados de exemplo (`apps/web/components/variable-input.tsx:46-54,75,80-142`).

### 3.3 Inspetor contextual (o que mostra hoje)

- **Observação.** `Inspector` (`apps/web/components/inspector.tsx:18-507`). Sem seleção: "Um detalhe faz a diferença / Selecione um bloco" (`:55-70`). Com seleção: cabeçalho "Propriedades do bloco", ícone, nome do tipo e descrição (`:77-93`), campos Nome do bloco e Descrição (`:95-112`), seção "Configuração" específica por tipo (`:114-470`), erros de validação do schema (`:471-477`), nota "Uma dica para seu processo" (`:478-488`), "ID do bloco" truncado em 16 caracteres (`:490-493`), rodapé com Duplicar e Excluir (`:495-504`).
- **Observação.** Carrega listas auxiliares por tipo: contas WhatsApp (`GET /integrations/whatsapp`), contas Resend (`GET /integrations`) e memberships (`GET /memberships`) (`:41-54`).
- **Observação.** O inspetor não mostra dados de entrada nem de saída do nó, nem execuções anteriores do nó, nem teste individual do nó. Esses dados só aparecem no `RunLog` por etapa (`run-log.tsx:146-180`).

### 3.4 Salvar, publicar, versões e revisão otimista

- **Observação.** Autosave com debounce de 850 ms após mudança (`apps/web/components/editor-state.ts:130-136`), indicador "Tudo salvo / Alterações pendentes / Salvando… / Tentar salvar / Conflito de edição" (`editor.tsx:73-79,565-592`), Ctrl S e clique no indicador salvam na hora. `PATCH /workflows/:id` envia `{revision, draft}`; 409 bloqueia a aba e oferece "Exportar rascunho" em JSON (`editor-state.ts:114-117`, `editor.tsx:512-519,660-674`). Aviso `beforeunload` com alterações pendentes (`editor-state.ts:137-146`). Clique em link interno salva antes de navegar e, se falhar, pergunta se quer sair descartando (`editor.tsx:162-197`).
- **Observação.** Servidor: `save` verifica projeto e fluxo não arquivados, compara a revisão com `updateMany` e incrementa (`apps/api/src/workflows/workflow.service.ts:117-144`). `publish` trava a linha (`FOR UPDATE`), exige revisão igual, valida o grafo (`validateWorkflow`) e as conexões (`validateConnections`), devolve a versão anterior se o snapshot for idêntico, senão cria `WorkflowVersion` com número incremental (`:146-187`). Só titular publica (`workflow.controller.ts:119-123`).
- **Observação.** Diálogo Publicar: lista de ajustes clicáveis que selecionam o nó com problema (`editor.tsx:1117-1134`), aviso "Publicar e executar são etapas diferentes" (`:1107-1116`). Diálogo Histórico de versões: lista com número, data, selo "Imutável"; ao clicar, mostra nome, contagens e os nós com `JSON.stringify(config)` (`:1160-1214`). Não há diff entre versões, restauração de versão como rascunho, nome/descrição de versão, nem abrir a versão no canvas.
- **Observação.** Imutabilidade no banco: gatilhos impedem UPDATE, DELETE e TRUNCATE de `WorkflowVersion` e a exclusão de fluxo com versões (`docs/progress.md:176-193`; migração `202610200013_phase52_historical_integrity`).
- **Observação.** Publicar não ativa nada por si: webhooks e mensagens recebidas usam a última versão publicada (`workflow.service.ts:676-681`; `whatsapp.service.ts:582-594`). Não há interruptor "ativo/inativo" por fluxo; o único "Ativo" na interface é o do fluxo do sistema SAIR, que é fixo (`system-opt-out.tsx:527-529`).

### 3.5 Simulação e validação

- **Observação.** Diálogo "Vamos testar seu processo?" com formulário de lead de exemplo (nome, e-mail, empresa, origem, orçamento, pontuação), "Restaurar exemplo" e botão desabilitado enquanto houver ajustes (`editor.tsx:1034-1098`). A simulação salva antes, chama `POST /workflows/:id/simulate`, reproduz os passos no canvas com 380 ms entre etapas (`:451-489`) e abre o `RunLog` abaixo do canvas.
- **Observação.** Validação é a mesma no cliente e no servidor: `validateWorkflow` (`packages/workflow-schema/src/index.ts:270-357`): ids únicos, exatamente um gatilho, variáveis permitidas e completas, schema de cada nó, condição com saídas Sim e Não, demais nós com uma só saída, gatilho sem entrada, arestas íntegras e não repetidas, todos alcançáveis, sem ciclo. O cliente marca nós inválidos (`editor.tsx:210`) e contabiliza na barra de status (`:198,1005-1010`).
- **Observação.** Simulação no servidor usa `simulateWorkflow` (`packages/workflow-engine/src/index.ts:431-433`): nenhum efeito externo, espera instantânea, e-mail e nome ocultos (`:293-300`), conteúdo interpolado escondido no histórico (`:391-392`). Resultado persistido em `Simulation` (`workflow.service.ts:198-200`).
- **Observação.** Não há teste de um nó isolado, dados fixados ("pin") por nó, execução manual passo a passo nem edição do payload de entrada além do lead de exemplo.

### 3.6 O que falta em relação ao fluxo do SAIR

O fluxo do SAIR (`apps/web/components/system-opt-out.tsx`) é um componente separado, somente leitura, com dados reais da outbox. Comparando com o editor comum:

| Elemento do SAIR | Onde está no SAIR | Editor comum hoje | Rótulo |
| --- | --- | --- | --- |
| Canvas pontilhado em tela cheia, sem biblioteca nem inspetor | `system-opt-out.tsx:540-569` (`Background` gap 20, `Controls` horizontais) | Canvas com biblioteca à esquerda e inspetor à direita (`editor.tsx:678-997`), fundo pontilhado gap 18 | Observação |
| Nó quadrado 100x100 com ícone grande e nome/subtítulo embaixo; gatilho com lado esquerdo arredondado e raio | `.n8n-node`, `.n8n-node-label`, `.is-trigger`, `.n8n-trigger-bolt` (`globals.css:2673-2683`); `Step` (`system-opt-out.tsx:106-147`) | Cartão retangular com rótulo de tipo, ícone pequeno e resumo dentro do cartão (`workflow-node.tsx:36-66`) | Observação |
| Alças à esquerda (entrada) e à direita (saídas nomeadas, várias) | `:116,124-140`; `.n8n-handle-in/out`, `.n8n-out-label` (`globals.css:2684-2687`) | Entrada no topo e saída na base; só a condição tem duas saídas (`workflow-node.tsx:41,67-88`) | Observação |
| Ligações com contagem de itens e seta, verdes quando há itens | `edge()` (`system-opt-out.tsx:150-167`) | Ligações sem contagem; rótulos só em ramos de condição (`editor.tsx:216-236`) | Observação |
| Selo de estado no nó (ok/atenção) com texto no `title` | `:119-123`, `.n8n-node-badge` | Ícone pequeno de execução/inválido no rótulo do tipo (`workflow-node.tsx:52-58`) | Observação |
| Detalhe do nó em sobreposição com três painéis Entrada \| Parâmetros \| Saída, "Voltar ao canvas", selo "Somente leitura", Escape fecha | `:607-647`, `:205-210`; `.n8n-ndv*` (`globals.css:2688-2699`); print `p3-ndv.png` | Inspetor lateral só com parâmetros; entrada e saída só no `RunLog` por etapa | Observação |
| Abas Editor \| Execuções com contagem no cabeçalho do fluxo | `:518-525`; print `p5-execucoes.png` | Execuções do fluxo aparecem como faixa "Execuções reais" com os 3 últimos e `RunLog` (`editor.tsx:954-983`) | Observação |
| Chave "Ativo" e botão "Atualizar" | `:526-533` | Sem interruptor de ativação; sem atualizar manual (polling de 2 s em `:113-132`) | Observação |
| Tabela de execuções com colunas Recebido, Número, Mensagem, Esfera, Confirmação | `:570-606` | Lista de cartões em `/execucoes` (`listings.tsx:411-443`) | Observação |
| Breadcrumb "Projeto > Nome" e selo "Sistema" | `:509-517` | Breadcrumb "Projetos / Projeto / Fluxo" com nome editável e selo Rascunho/Arquivado (`editor.tsx:543-561`) | Observação |
| Atualização automática a cada 5 s, pausada com aba oculta | `:200-203` | Polling de execuções a cada 2 s, sem pausa (`editor.tsx:127`) | Observação |

**Inferência.** Para levar o visual do SAIR ao editor comum é preciso extrair um componente de nó compartilhado (hoje `Step` e `WorkflowBlock` são independentes), trocar a orientação das alças para esquerda/direita (o auto-layout dagre usa `rankdir: 'TB'`, `editor.tsx:437`, e teria de virar `LR`), calcular contagens por aresta a partir de `ExecutionStep` e criar um painel de nó com Entrada, Parâmetros (o inspetor atual) e Saída. Nada disso existe no código hoje.

---

## 4. Execuções

### 4.1 Modelo

- **Observação.** `Execution` (`packages/database/prisma/schema.prisma:191-225`): organização, fluxo, `versionId` (snapshot fixado), `leadId`, `eventKey` (único por organização e fluxo), `status` enum, `result`, `eventData`, `errorCode`, `attempt`, `segmentAttempt`, `attemptHistory` JSON, `createdAt`, `startedAt`, `availableAt`, `leaseUntil`, `leaseToken`, `maxAttempts` (3), `durationMs`, `finishedAt`; relações `steps`, `notifications`, `checkpoints`.
- **Observação.** `ExecutionStep` (`:251-266`): `nodeId`, `nodeType`, `name`, `status` (success, failed, skipped, `workflow-schema/src/index.ts:415`), `input`, `output`, `durationMs`, `message`, `createdAt`.
- **Observação.** `ExecutionCheckpoint` (`:227-249`): FK composta por execução, organização, fluxo e versão, `nodeId`, `nextNodeId`, `state` JSON (lead, saídas filtradas, visitados, próximo nó, responsável; `workflow-engine/src/index.ts:446-452`), `resumeAt`, `expiresAt`, `status` (WAITING, READY, CONSUMED, EXPIRED, FAILED; migração 14 linha 28), `revision`, `suspendedAt`, `resumedAt`, `consumedAt`, `recoveryError`. Só um checkpoint ativo por execução (índice parcial, migração 14 linha 34).

### 4.2 Estados e transições

- **Observação.** `ExecutionStatus`: QUEUED, RUNNING, SUSPENDED, COMPLETED, FAILED (`schema.prisma:10-16`). Gatilho SQL `validate_execution_transition` só permite QUEUED para RUNNING/FAILED, RUNNING para QUEUED/SUSPENDED/COMPLETED/FAILED, SUSPENDED para QUEUED/FAILED; impede trocar a versão de uma execução com checkpoint, lease em SUSPENDED e retomada sem checkpoint READY vencido (`packages/database/prisma/migrations/202610210014_phase6a_durable_wait/migration.sql:36-53`). Gatilho adiado exige checkpoint WAITING para toda execução SUSPENDED (`:55-63`).
- **Observação.** `attemptHistory` registra, por tentativa, RUNNING, COMPLETED, FAILED, SUSPENDED, RETRY e ABANDONED (lease vencido) (`packages/workflow-runtime/src/index.ts:145-151,183-187,517-527,576-585`).

### 4.3 Enfileirar, reservar, processar

- **Observação.** `enqueueInTransaction` (`workflow-runtime/src/index.ts:35-112`): deduplica por `eventKey`, valida lead, pega a última versão publicada (ou a informada), valida o snapshot e as conexões, cria ou reaproveita o lead (por `externalContactKey` em mensagens recebidas) e cria a execução `QUEUED` com `eventData` congelado. Erro de unicidade vira `idempotentHit` (`:113-127`).
- **Observação.** `reserveExecution` (`:130-191`): `FOR UPDATE SKIP LOCKED` sobre QUEUED disponíveis ou RUNNING com lease vencido, lease padrão 30 s, token de posse; marca a tentativa anterior como ABANDONED e falha com `ATTEMPTS_EXHAUSTED` quando `segmentAttempt >= maxAttempts`.
- **Observação.** `processReservedExecution` (`:195-590`): transação de até 20 s (`:536`), refaz o lock com token, valida o contexto e o checkpoint, falha com `WAIT_EXPIRED` se o prazo venceu na fila (`:238-258`), trava o lead, revalida conexões, monta os efeitos de produção (`:270-452`) e chama `executeDurableSegment`. Persiste as etapas, consome o checkpoint, cria o próximo checkpoint se houver suspensão e atualiza status, `result`, `errorCode` e histórico. Em erro: só erros transitórios do Prisma (P2034, P2028, P1001, P1002) voltam para QUEUED com backoff `min(5 min, 2^segmentAttempt s)` (`:539-589`); os demais marcam FAILED com `EXECUTION_CONTEXT_FAILURE` ou `CHECKPOINT_PERSISTENCE_FAILURE`.
- **Observação.** Falha de um efeito de negócio (por exemplo `WHATSAPP_CONSENT_REQUIRED`) vira etapa `failed` e a execução termina FAILED sem nova tentativa; os nós não visitados são marcados `skipped` (`workflow-engine/src/index.ts:398-427`). Mensagens de erro traduzidas em `:16-24`.

### 4.4 Espera durável e retomada

- **Observação.** O nó Esperar, em execução real, grava um checkpoint com o estado mínimo necessário (só as variáveis que os nós seguintes usam) e suspende (`workflow-engine/src/index.ts:307-363`). `resumeDueExecution` (`workflow-runtime/src/resume.ts:5-42`) pega SUSPENDED com checkpoint WAITING vencido, marca READY ou EXPIRED e volta a execução para QUEUED (ou FAILED com `WAIT_EXPIRED`). O worker chama isso antes de cada reserva (`index.ts:592-596`). Retomada manual: `POST /executions/:id/resume` só para espera já vencida (`workflow.service.ts:380-385`).
- **Observação.** Não há cancelamento de execução, pausa manual, reexecução a partir de uma etapa, nem aprovação humana ou sub-fluxo (planejados em `docs/phase6-technical-plan.md`, seções 2.4 e 2.5, com aviso de não implementados).

### 4.5 Telas de execuções

- **Observação.** `/execucoes` e aba Execuções do projeto (seção 2.5), faixa "Execuções reais" no editor (`editor.tsx:954-983`), histórico no detalhe do lead (`listings.tsx:1023-1036`), tabela do SAIR (`system-opt-out.tsx:570-606`).
- **Observação.** `RunLog` (`apps/web/components/run-log.tsx:24-183`): cabeçalho real/simulação, etapas concluídas, nota de status, caixas de checkpoint (suspensão, previsão, retomada, erro), `errorCode`, resumo do lead com SDR e notificações, lista de etapas numeradas com estado, mensagem, duração e painel expansível com `Entrada` e `Saída` em JSON (`:146-180`). Estilos inline em `:81-144`.
- **Observação.** Não existe página de detalhe por execução (sem rota `/execucoes/[id]`), filtro, busca, paginação, exclusão, reexecução ou visualização da execução sobre o canvas (a única projeção no canvas é a reprodução da simulação, `editor.tsx:469-477`).

---

## 5. Gatilhos, webhooks, agendamento, inbox e roteamento

- **Observação.** Gatilhos no catálogo: `lead.created`, `webhook.received`, `whatsapp.message.received`, `whatsapp.conversation.started` (`workflow-schema/src/index.ts:263-268`). Exatamente um por fluxo (`:276-277`).
- **Observação.** Disparo manual/por API: `POST /workflows/:id/execute` com `{lead, eventKey?, versionId?}` enfileira sobre a última versão publicada (`workflow.controller.ts:170-174`; `workflow.service.ts:232-255`). Não há botão "executar de verdade" na interface do editor (só "Testar" = simulação); o disparo real é por API, webhook ou mensagem.
- **Observação.** Webhook genérico: `POST /webhooks/:workflowId` (público) exige fluxo publicado com nó `webhook.received`, credencial em `WEBHOOK_CREDENTIALS_JSON` indexada por `organizationId:credentialRef`, modo segredo simples (`x-eimax-webhook-secret`) ou HMAC (`x-vexor-signature` + `x-vexor-timestamp`, janela de 300 s, assinatura sobre `timestamp.eventKey.corpo`), `x-eimax-event-key` opcional (sem ele, hash do corpo) (`workflow.service.ts:664-731`). A URL é fixa por fluxo (`/webhooks/<id do fluxo>`); não há caminho personalizável, métodos além de POST, resposta configurável nem URL de teste.
- **Observação.** Rate limit e auditoria de ingresso: 300 por minuto por IP e 120 por rota+IP, em `WebhookRateBucket`; cada aceite ou rejeição vira `WebhookIngressLog` sem segredos (`apps/api/src/workflows/ingress.service.ts:29-75`). Consulta em `GET /integrations/ingress/history` (100 últimos).
- **Observação.** Agendamento: não existe gatilho por horário/cron nem tabela de agendamentos; a única programação temporal é o `resumeAt` do nó Esperar (`workflow-schema/src/index.ts:154-173`).
- **Observação.** Inbox WhatsApp: o webhook do provedor persiste `WhatsAppEvent` com `routing` = versões publicadas que têm `whatsapp.message.received` apontando para aquela conta (`whatsapp.service.ts:573-616`). O worker consome um evento por vez com `SKIP LOCKED` (`workflow-runtime/src/inbox.ts:7-135`): captura SAIR antes de tudo, ignora conta desabilitada, trata `CONNECTION_CLOSED` (quarentena nos códigos 401, 402, 403, 406), enfileira uma execução por versão roteada com `eventKey = whatsapp:<conexão>:<id do provedor>` e `externalContactKey = <conexão>:<telefone>` (reaproveita o lead por contato), lead sintético com `source: 'whatsapp'` e `message` igual ao texto. Até 2 novas tentativas em erro transitório (`:123`).
- **Observação.** Roteamento por conexão é fixado no momento do recebimento (snapshot em `routing`), então republicar não muda eventos já recebidos (`docs/operations.md:112-113`).

---

## 6. Credenciais e integrações

- **Observação.** Dois modelos: `WhatsAppConnection` (`schema.prisma:302-323`) e `IntegrationConnection` (`:344-363`), ambos por organização, com `settings` JSON público e `credentials` cifradas (texto base64 de AES-256-GCM com `CONNECTOR_ENCRYPTION_KEY` de 32 bytes hex, `packages/connectors/src/index.ts:66-88`). Credenciais nunca voltam pela API (`whatsapp.service.ts:84-134`; `integration.service.ts:55-89`). Não há credencial por projeto (`projects.tsx:752-756`), compartilhamento por usuário, nem tipos genéricos (API key/Basic/OAuth2 livre).
- **Observação.** Registro de conectores (`packages/connectors/src/contracts.ts:83-332`): META, EVOLUTION, Z_API, MOCK (canal WHATSAPP), RESEND (EMAIL), GOOGLE_SHEETS (SHEETS), RD_STATION e HUBSPOT (CRM, `implementation: 'contract'`, sem adaptador). Cada um declara `settingsSchema`, `credentialsSchema`, campos de formulário, ações, gatilhos e capacidades (qr, pairingCode, createInstance, templates, oauth, providerIdempotency, deliveryReceipts). `publicConnectorCatalog()` marca sempre `homologated: false` (`:349`).
- **Observação.** WhatsApp multiprovedor (`packages/connectors/src/index.ts:296-555`): Meta (status pelo Graph, envio de texto e template, templates aprovados sem parâmetros/mídia/botões, `:409-429`), Evolution (criar instância, QR em base64 válido por 30 s, código de pareamento, restart, logout, delete, `fetchInstances` para motivo de desconexão), Z-API (status, QR, código, envio, restart, disconnect), MOCK (tudo em memória, QR não, código determinístico, envio `SENT`). Envio real só com `WHATSAPP_EXTERNAL_ENABLED=true`; sessão/QR só com `WHATSAPP_SESSION_ENABLED=true` (`:275-278,347-352`). Única exceção ao bloqueio: `sendOptOutConfirmation` com texto fixo (`:280-295`).
- **Observação.** Conta gerenciada (Evolution): o usuário informa só o nome; instância e segredo do webhook derivam de `EVOLUTION_GATEWAY_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_WEBHOOK_SECRET` (`packages/connectors/src/managed-evolution.ts:5-30`; `whatsapp.service.ts:196-265`).
- **Observação.** Quarentena: global por arquivo `.local/whatsapp-service-quarantined.json` (`connectors/src/index.ts:128-137`) e por conta (`quarantinedAt`, `quarantineReason`; migração 16). Operações ativas em conta em quarentena respondem 409; liberar exige titular, revisão e apaga a sessão no gateway (`whatsapp.service.ts:139-188`).
- **Observação.** Transporte seguro (`connectors/src/index.ts:207-273`): só HTTPS (exceção: Evolution local em `http://127.0.0.1:<porta>` com `EVOLUTION_LOCAL_GATEWAY_ENABLED=true`, `:165-173`), DNS IPv4 público fixado no socket, sem redirecionamento, 10 s de prazo, resposta até 1 MB, 429 com `retry-after`.
- **Observação.** Webhooks de provedores: `GET/POST /webhooks/whatsapp/:id` (Meta: handshake e HMAC `x-hub-signature-256`; Evolution: `x-whatsapp-secret`; Z-API: `client-token`; MOCK: sempre recusado, só `POST /integrations/whatsapp/:id/simulate` autenticado) (`whatsapp.service.ts:517-572`); `POST /webhooks/email/:id` (Resend/Svix: `svix-id`, `svix-timestamp`, `svix-signature`, janela 300 s) (`integration.service.ts:270-307`; `connectors/src/commercial.ts:57-78`).
- **Observação.** E-mail: adaptador Resend com verificação de domínio e `Idempotency-Key` (`commercial.ts:16-56`); envio só com `EMAIL_EXTERNAL_ENABLED=true` (`:7-10`). Google Sheets: listar planilhas e abas, ler e anexar linhas com mapeamento validado (`:118-184`), prévia local de importação/exportação sem rede (`integration.service.ts:233-269`). OAuth Google: `prepareOAuth` gera estado e PKCE e grava `IntegrationOAuthAttempt` (`:177-209`); `consumeOAuthState` existe (`:210-220`) mas nenhuma rota o chama (controlador em `integration.controller.ts:26-106` não tem callback). **Inferência.** O ciclo OAuth para na URL de autorização; troca e renovação de token não existem (confirmado em `docs/progress.md:223`).
- **Observação.** Estado das contas: DISCONNECTED, CONNECTING, WAITING_FOR_QR, CONNECTED, RECONNECTING, ERROR (`contracts.ts:3-10`) e ARCHIVED no banco (`whatsapp.service.ts:286`). `configurationRequired` fica verdadeiro sem chave, sem credenciais válidas ou sem flags de ambiente (`:124-131`; `integration.service.ts:82-86`).

---

## 7. Descadastro (SAIR), resumo para referência

- **Observação.** Classificador sem histórico (`packages/connectors/src/opt-out.ts:151-166`): 65 frases exatas (`:13-79`), 3 erros de digitação isolados de "sair" (`:84`), fragmentos de intenção que mandam para revisão (`:110-133`), texto de confirmação fixo com uma quebra de linha (`:87-88`), normalização sem acento/pontuação (`:135-143`), E.164 com +55 padrão (`:169-176`).
- **Observação.** Captura dentro da transação do inbox (`workflow-runtime/src/inbox.ts:24-36`; `opt-out.ts:48-74`): OPT_OUT vira `PENDING`, revoga `whatsappConsent` dos leads da organização e enfileira a confirmação; AMBIGUOUS vira `REVIEW`. Outbox `OptOutEvent` entregue ao Esfera (`POST {baseUrl}/api/optout/events`, Bearer do mapa `ESFERA_OPTOUT_LINKS_JSON`), lease 60 s, backoff até 10 min, `DELIVERED` só com `ack: true` do mesmo `eventId`; 400/422 vira `FAILED` reenfileirável (`opt-out.ts:297-322,387-436`).
- **Observação.** Confirmação ao devedor em fila própria `OptOutConfirmation` (migração 19): uma por organização+número, só após `DELIVERED` no Esfera, só pela mesma conexão, nunca em quarentena, marco de ativação `OptOutConfirmationActivation` impede envio retroativo, allowlist opcional, resultado incerto não é reenviado (`opt-out.ts:76-227`). Loop independente no worker (`apps/worker/src/index.ts:18-27`).
- **Observação.** API: `GET /opt-outs`, `GET /opt-outs/status`, `GET /projects/:id/system-opt-out`, `POST /opt-outs`, `POST /opt-outs/:id/resolve`, `POST /opt-outs/:id/retry` (`opt-out.controller.ts:10-36`). Interface: seção 3.6.
- **Observação.** A migração `202610280019_opt_out_confirmation` e os testes `tests/unit/opt-out-confirmation.test.ts` e `tests/integration/opt-out-confirmation.test.ts` estão no commit `4a18702`, mas `docs/progress.md` não tem nenhuma entrada sobre a migração 19 nem sobre `OptOutConfirmation` (grep sem resultado). **Desconhecido.** Se essas suítes foram executadas e com que resultado.

---

## 8. API NestJS

**Observação.** Guarda única `DevelopmentGuard` em todos os controladores (`apps/api/src/workflows/development.guard.ts:7-77`): token do cookie `eimax_session` ou `Authorization: Bearer`, hash SHA-256, primeiro procura `Session` de produção (com expiração e membership da organização do usuário), depois `DevelopmentSession`; aplica `@Roles`; para métodos diferentes de GET exige `x-eimax-client: workspace` e, se houver `Origin`, que seja `WEB_ORIGIN` ou `http://127.0.0.1:3000`. Rotas `@Public()`/`SetMetadata('public')` pulam tudo.

**Observação.** RBAC: três papéis, owner, editor e viewer (`schema.prisma:43`). Organização sempre vem de `req.access.organizationId`; schemas `strict` recusam `organizationId` no corpo (`contracts.ts:13-21`; testes em `tests/integration/api.test.ts:61`). Recurso de outra organização responde 404 (`workflow.service.ts:76`, `project.service.ts:33`, etc.). Erros 400 trazem `issues` (`contracts.ts:16-19`).

**Observação.** Sessões: desenvolvimento (três memberships `dev-owner`, `dev-editor`, `dev-viewer` em `org-local`, criadas em `workflow.service.ts:32-55` a partir de `DEV_*_TOKEN`) e produção (`POST /auth/register` com CPF validado e cifrado, `POST /auth/login` com scrypt, limite de 5 tentativas em 15 min, sessão de 24 h, `workflow.service.ts:556-662`). **Observação.** Nenhuma tela usa register/login; a auditoria em `docs/database-saas-audit.md` (seção "Achados") aponta que o fallback de sessão de desenvolvimento não verifica `DEVELOPMENT_WORKSPACE` e que não há seleção de organização ativa para usuários com vários vínculos.

### Tabela completa de endpoints (77 na API Nest + 1 no Next)

Papel: "sessão" = qualquer membro autenticado; "público" = sem sessão. Arquivo e linha do controlador em cada linha.

| # | Método e caminho | Papel | O que faz | Observação (arquivo:linha) |
| --- | --- | --- | --- | --- |
| 1 | GET /health | público | `{status, mode, realExecutionAvailable}` | workflow.controller.ts:47-51 |
| 2 | POST /auth/register | público | Cria organização, usuário titular (CPF cifrado) e fluxo SDR inicial | :55-60; workflow.service.ts:556-612 |
| 3 | POST /auth/login | público | Emite token opaco e cookie HttpOnly; rate limit | :62-72; workflow.service.ts:614-653 |
| 4 | POST /auth/logout | sessão | Apaga a sessão e expira o cookie | :74-79 |
| 5 | GET /me | sessão | `{organizationId, role, userId?, mode}` | :81-84 |
| 6 | GET /workflows | sessão | Lista fluxos da organização com contagens | :88-91; workflow.service.ts:80-98 |
| 7 | GET /workflows/:id | sessão | Rascunho, revisão, projeto, versões | :93-96; workflow.service.ts:68-78 |
| 8 | POST /workflows | owner, editor | `{template:'sdr', name}` cria no projeto padrão (gatilho SQL) | :98-111 |
| 9 | PATCH /workflows/:id | owner, editor | `{revision, draft}` salva rascunho; 409 em conflito | :113-117; workflow.service.ts:117-144 |
| 10 | POST /workflows/:id/publish | owner | `{revision}` valida e cria snapshot imutável | :119-123; workflow.service.ts:146-187 |
| 11 | POST /workflows/:id/archive | owner | Arquiva (sem revisão) | :125-129 |
| 12 | POST /workflows/:id/unarchive | owner | Desarquiva | :131-135 |
| 13 | GET /workflows/:id/versions/:number | sessão | Snapshot de uma versão | :137-147 |
| 14 | POST /workflows/:id/simulate | owner, editor | `{revision, lead}` simula e persiste | :151-155; workflow.service.ts:189-209 |
| 15 | GET /workflows/:id/simulations | sessão | Simulações do fluxo (50) | :157-161 |
| 16 | GET /simulations | sessão | Últimas 50 simulações da organização | :163-166 |
| 17 | POST /workflows/:id/execute | owner, editor | `{lead, eventKey?, versionId?}` enfileira execução real | :170-174; workflow.service.ts:232-255 |
| 18 | GET /workflows/:id/executions | sessão | Execuções do fluxo (50) com etapas, checkpoints, lead, notificações | :176-180; workflow.service.ts:257-318 |
| 19 | GET /executions | sessão | Últimas 50 execuções da organização | :182-185 |
| 20 | GET /executions/:id | sessão | Detalhe com e-mail do lead mascarado | :187-190; workflow.service.ts:320-378 |
| 21 | POST /executions/:id/resume | owner, editor | Retoma espera vencida; 409 se não estiver pronta | :192-196; workflow.service.ts:380-385 |
| 22 | GET /leads?workflowId&status | sessão | Até 100 leads com responsável e contagens | :200-207; workflow.service.ts:387-431 |
| 23 | GET /memberships | sessão | Memberships owner/editor (id, nome, papel) | :209-215 |
| 24 | GET /leads/:id | sessão | Detalhe com execuções, notificações e conversa WhatsApp | :217-220; workflow.service.ts:433-487 |
| 25 | PATCH /leads/:id | owner, editor | `{expectedRevision, status?, assignedMembershipId?, tags?, whatsappConsent?, phone?}`; 409 em revisão vencida | :222-239; workflow.service.ts:489-537 |
| 26 | GET /notifications?leadId | sessão | Últimas 50 notificações | :243-246 |
| 27 | POST /webhooks/:workflowId | público | Ingresso autenticado por segredo ou HMAC; enfileira | :250-268; workflow.service.ts:664-731 |
| 28 | GET /projects | sessão | Projetos com `workflowCount` e `lastActivityAt` | project.controller.ts:31-33; project.service.ts:37-64 |
| 29 | GET /projects/:id | sessão | Um projeto | :34-36 |
| 30 | POST /projects | owner, editor | `{name, description?, color?, icon?}`; nome normalizado único | :37-39; project.service.ts:78-90 |
| 31 | PATCH /projects/:id | owner, editor | Campos acima + `revision` | :40-50; project.service.ts:100-130 |
| 32 | POST /projects/:id/archive | owner | `{revision}` arquiva | :51-59 |
| 33 | POST /projects/:id/restore | owner | `{revision}` restaura | :60-68 |
| 34 | GET /projects/:id/workflows | sessão | Fluxos do projeto | :69-71 |
| 35 | POST /projects/:id/workflows | owner, editor | `{name, template?:'sdr'}` cria fluxo no projeto | :72-82; project.service.ts:136-143 |
| 36 | GET /projects/:id/executions | sessão | Execuções dos fluxos do projeto | :83-86 |
| 37 | GET /projects/:id/simulations | sessão | Simulações dos fluxos do projeto | :87-90 |
| 38 | PATCH /workflows/:id/name | owner, editor | `{revision, name}` renomeia | :91-98; project.service.ts:145-190 |
| 39 | POST /workflows/:id/move | owner, editor | `{revision, projectId}` move | :99-106 |
| 40 | POST /workflows/:id/duplicate | owner, editor | `{revision, name?, projectId?}` duplica só o rascunho | :107-119 |
| 41 | POST /workflows/:id/archive-revision | owner | `{revision}` arquiva com revisão | :120-132 |
| 42 | POST /workflows/:id/restore-revision | owner | `{revision}` restaura | :133-145 |
| 43 | GET /integrations/catalog | sessão | Catálogo público de conectores | integration.controller.ts:26-28 |
| 44 | GET /integrations | sessão | Contas de integração (não WhatsApp) | :29-31 |
| 45 | POST /integrations | owner | `{name, provider, settings, credentials?}` | :32-34; integration.service.ts:98-143 |
| 46 | PATCH /integrations/:id | owner | Mesmo corpo + `expectedUpdatedAt` | :35-41 |
| 47 | POST /integrations/:id/enable | owner | Verifica no provedor e marca CONNECTED | :42-47; integration.service.ts:144-176 |
| 48 | POST /integrations/:id/disconnect | owner | Marca DISCONNECTED | :48-53 |
| 49 | POST /integrations/:id/oauth/prepare | owner | Gera URL Google com PKCE; sem callback | :54-59; integration.service.ts:177-209 |
| 50 | GET /integrations/:id/sheets?spreadsheetId | sessão | Lista planilhas ou abas (só com conta conectada) | :60-66 |
| 51 | POST /integrations/:id/sheets/import-preview | owner, editor | Mapeia linhas localmente | :67-73 |
| 52 | POST /integrations/:id/sheets/export-preview | owner, editor | Monta linhas de leads localmente | :74-80 |
| 53 | GET /integrations/ingress/history | sessão | 100 últimos registros de ingresso | :81-87 |
| 54 | POST /webhooks/email/:id | público | Recibos Resend assinados (Svix) | :88-106; integration.service.ts:270-307 |
| 55 | GET /integrations/whatsapp | sessão | Contas WhatsApp (sem arquivadas) | whatsapp.controller.ts:27-30 |
| 56 | GET /integrations/whatsapp/:id/events | sessão | 100 últimos eventos da conta | :31-48 |
| 57 | POST /integrations/whatsapp | owner | Conta manual (META, Z_API, EVOLUTION, MOCK) | :49-53; whatsapp.service.ts:291-336 |
| 58 | POST /integrations/whatsapp/managed | owner | Conta Evolution gerenciada só com `name` | :54-58; whatsapp.service.ts:196-233 |
| 59 | PATCH /integrations/whatsapp/:id/managed | owner | Renomeia conta gerenciada | :59-63 |
| 60 | PATCH /integrations/whatsapp/:id | owner | Edita conta manual | :64-68 |
| 61 | POST /integrations/whatsapp/:id/create-instance | owner | Cria instância (Evolution, MOCK) | :69-73 |
| 62 | POST /integrations/whatsapp/:id/archive | owner | `{expectedUpdatedAt}` arquiva conta desconectada | :74-78; whatsapp.service.ts:273-290 |
| 63 | POST /integrations/whatsapp/:id/reconnect | owner | Restart + connect | :79-83 |
| 64 | POST /integrations/whatsapp/:id/release-quarantine | owner | `{expectedUpdatedAt}` libera quarentena | :84-88; whatsapp.service.ts:149-188 |
| 65 | POST /integrations/whatsapp/:id/simulate | owner, editor | Injeta evento no Sandbox MOCK | :89-93 |
| 66 | POST /integrations/whatsapp/:id/pairing-code | owner | `{phoneNumber}` código de pareamento | :94-98; whatsapp.service.ts:469-516 |
| 67 | POST /integrations/whatsapp/:id/connect | owner | Conecta ou devolve QR | :99-103; whatsapp.service.ts:337-468 |
| 68 | POST /integrations/whatsapp/:id/refresh | owner, editor | Consulta estado; pode quarentenar | :104-108 |
| 69 | POST /integrations/whatsapp/:id/disconnect | owner | Desconecta | :109-113 |
| 70 | GET /webhooks/whatsapp/:id | público | Handshake Meta (`hub.challenge`) | :114-130; whatsapp.service.ts:517-535 |
| 71 | POST /webhooks/whatsapp/:id | público | Eventos do provedor autenticados | :131-144; whatsapp.service.ts:542-572 |
| 72 | GET /opt-outs?status | sessão | Até 200 pedidos com estado da confirmação | opt-out.controller.ts:10-13; opt-out.service.ts:85-115 |
| 73 | GET /opt-outs/status | sessão | Contagens e se há link do Esfera | :14-17 |
| 74 | GET /projects/:id/system-opt-out | sessão | Estado completo do fluxo do SAIR | :18-21; opt-out.service.ts:116-154 |
| 75 | POST /opt-outs | owner, editor | `{phone, note?}` descadastro manual | :22-26 |
| 76 | POST /opt-outs/:id/resolve | owner, editor | `{decision, expectedUpdatedAt}` | :27-31 |
| 77 | POST /opt-outs/:id/retry | owner | `{expectedUpdatedAt}` reenfileira FAILED | :32-36 |
| 78 | POST /api/development/session (Next) | público local | Grava cookie da sessão de desenvolvimento | apps/web/app/api/development/session/route.ts:3-24 |

**Observação.** `docs/api.md` documenta apenas parte disso (fatia 1, opt-outs e projetos) e a seção "Projetos" está com acentos corrompidos ("migra??o", `docs/api.md:94-110`). Não há OpenAPI/Swagger, chave de API para terceiros, versionamento de rota, paginação por cursor (grep por `cursor`/`nextCursor` em `apps/api/src` vazio) nem endpoints de usuários, equipes ou convites.

---

## 9. Worker

- **Observação.** `startWorkerLoop` (`apps/worker/src/index.ts:14-58`): chama `activateOptOutConfirmations` ao subir; dois laços: um só para confirmações de SAIR e outro que roda, em sequência, `processNextWhatsAppEvent`, `dispatchNextOptOut`, `runNextExecution`, `dispatchNextWhatsApp`, `dispatchNextEmail`; se alguma fila devolveu trabalho, repete sem dormir; senão dorme 500 ms. Para com SIGINT/SIGTERM aguardando o item atual e desconectando o Prisma (`:60-79`). `npm run dev` sobe o worker salvo `RUN_WORKER=false` (`scripts/dev.mjs:170-177`).

| Fila | Tabela | Reserva | Lease | Tentativas e backoff | Observação |
| --- | --- | --- | --- | --- | --- |
| Execuções | `Execution` | `SKIP LOCKED` por `availableAt`/`createdAt` | 30 s, token de posse | `maxAttempts` 3 por segmento; só erro transitório do banco repete, `min(5 min, 2^n s)` | `workflow-runtime/src/index.ts:130-191,539-589` |
| Retomada de espera | `ExecutionCheckpoint` | `FOR UPDATE OF e SKIP LOCKED` | nenhum (SUSPENDED não tem lease) | expiração opcional vira FAILED `WAIT_EXPIRED` | `resume.ts:5-42` |
| Inbox WhatsApp | `WhatsAppEvent` | `SKIP LOCKED` por `createdAt` | transação de 15 s | 2 novas tentativas, `2^(n+1)` s; conta desabilitada vira IGNORED | `inbox.ts:7-135` |
| Outbox WhatsApp | `Notification` canal WHATSAPP | `SKIP LOCKED`; reservas sem `processingAt` há 60 s viram FAILED (reconciliação) | 60 s | até 3; só 429 seguro repete; recibos reconciliados antes de cada rodada | `delivery.ts:11-82`; `index.ts:644-732` |
| Outbox e-mail | `Notification` canal EMAIL | idem, com recuperação por idempotência dentro de 23 h | 60 s | até 3; ambíguos repetem só com idempotência do provedor; `retry-after` ou `2^n` s | `delivery.ts:82-139` |
| Opt-out (Esfera) | `OptOutEvent` | `SKIP LOCKED`; reservas vencidas voltam para PENDING | 60 s | sem limite; `min(10 min, 2^n s)`; 400/422 FAILED | `opt-out.ts:355-436` |
| Confirmação ao devedor | `OptOutConfirmation` | `SKIP LOCKED` só com origem DELIVERED | 60 s; vencido vira FAILED `SEND_RESULT_UNCERTAIN` | falhas seguras repetem com `min(10 min, 2^n s)`; incerto não repete | `opt-out.ts:131-227` |

- **Observação.** Sem fila distribuída, sem prioridade, sem painel de filas, sem métricas de worker; `npm run dev` roda um único processo de worker. Testes de concorrência usam dois processos (`tests/integration/queue.test.ts:113`).

---

## 10. Modelo de dados

**Observação.** `packages/database/prisma/schema.prisma`, 24 modelos e 1 enum; 19 migrações em `packages/database/prisma/migrations/` (de `202610200001_foundation` a `202610280019_opt_out_confirmation`). Todas aditivas segundo `docs/progress.md` (migrações 4 a 19 descritas como "não destrutivas"/"aditivas"). O replay completo é testado em `tests/integration/database-integrity.test.ts:10` e `historical-integrity.test.ts:330`. **Desconhecido.** As expectativas desses testes podem ainda contar 18 migrações (o progress de 28/10 cita "atualizados para 18"); não executei.

| Modelo | Campos principais | Linhas |
| --- | --- | --- |
| `Organization` | id, name, createdAt; relações com tudo | 18-34 |
| `Membership` | organizationId, userId?, displayName, role (owner, editor, viewer) | 36-49 |
| `DevelopmentSession` | tokenHash (PK), membershipId | 51-55 |
| `User` | organizationId, email único, passwordHash, cpfCiphertext, cpfFingerprint, cpfLast4, role, emailVerifiedAt? | 57-74 |
| `Session` | userId, tokenHash único, expiresAt | 76-85 |
| `Project` | organizationId, name, normalizedName (único por organização), description?, color?, icon?, revision, archivedAt?, updatedAt | 87-105 |
| `Workflow` | organizationId, projectId (FK composta, default por gatilho SQL), draft JSON, revision, archivedAt?, updatedAt | 107-127 |
| `WorkflowVersion` | workflowId, organizationId, number (único por fluxo), snapshot JSON, createdAt; FK `Restrict` | 129-141 |
| `Simulation` | workflowId, snapshot, steps JSON, status | 143-154 |
| `Lead` | workflowId, eventKey, name, email, company, budget, score, source, phone, whatsappConsent, lastInboundAt, externalContactKey, status, revision (gatilho SQL incrementa), assignedMembershipId, tags JSON, data JSON | 156-189 |
| `Execution` | ver seção 4.1 | 191-225 |
| `ExecutionCheckpoint` | ver seção 4.1 | 227-249 |
| `ExecutionStep` | ver seção 4.1 | 251-266 |
| `Notification` | leadId?, executionId?, channel (WHATSAPP, EMAIL, INTERNAL, MANAGER_NOTIFICATION), recipient, title, message, status, connectionId? (FK composta por organização), providerMessageId, nodeId, payload, processingAt, errorCode, attempt, availableAt, deliveryToken, integrationId?; únicos por execução+nó e por conexão/integração+providerMessageId | 268-300 |
| `WhatsAppConnection` | name, provider, enabled, state, settings JSON, credentials?, lastError, checkedAt, quarantinedAt, quarantineReason | 302-323 |
| `WhatsAppEvent` | connectionId, providerEventId, kind (MESSAGE, SENT, DELIVERED, READ, FAILED, CONNECTION_CLOSED), payload, routing JSON, status, attempt, availableAt, errorCode, processedAt; único por conexão+evento+tipo | 325-342 |
| `IntegrationConnection` | name, provider, state, settings, credentials?, enabled, lastError | 344-363 |
| `IntegrationEvent` | integrationId, providerEventId (único), providerMessageId, kind | 365-376 |
| `IntegrationOAuthAttempt` | integrationId, organizationId, stateHash único, verifier cifrado, redirectUri, expiresAt, usedAt | 378-389 |
| `WebhookRateBucket` | key, count, expiresAt | 391-395 |
| `OptOutEvent` | connectionId?, sourceEventId?, eventKey único, phone, classification, excerpt, receivedAt, status, attempt, availableAt, processingAt, deliveryToken, errorCode, deliveredAt, ackStatus, resolvedByMembershipId, resolvedAt | 400-427 |
| `OptOutConfirmation` | phoneKey (único por organização), phone, connectionId, sourceOptOutId, status, attempt, availableAt, processingAt, deliveryToken, errorCode, providerMessageId, sentAt | 430-451 |
| `OptOutConfirmationActivation` | id 'default', activatedAt | 453-456 |
| `WebhookIngressLog` | organizationId?, source, resourceId, outcome, code | 458-469 |

- **Observação.** Não existem modelos de equipe/time, convite, credencial genérica, tag de fluxo, agendamento, execução de teste separada, pinagem de dados, comentário/nota, auditoria de alterações de fluxo (quem editou o quê) nem configuração por organização.

---

## 11. Conectores e pacotes compartilhados

- **Observação.** Contratos (`packages/connectors/src/contracts.ts`): tipo `ConnectorDefinition` com `fields`/`secretFields` para gerar formulários (`:17-46`); a tela de integrações os consome diretamente (`apps/web/app/integracoes/page.tsx:5,20,236-271`). `publicConnectorSettings` filtra segredos (`:352-377`).
- **Observação.** Tokens de design: `packages/shared-ui/src/tokens.css:1-11` define `--primary #7352d6`, `--ink`, `--muted`, `--line`, `--soft`, `--surface`, `--canvas #f8f9fc`, `--text-secondary`, `--success`. `docs/design-system.md:8-21` descreve a tabela completa (primary-dark, warning, danger, Inter, raios 8 a 14 px, transições 180 ms). A implementação real dos tokens está em `apps/web/app/globals.css` com Tailwind 4 (`docs/design-system.md:7`), 2750 linhas, sem divisão por arquivo.
- **Observação.** Componentes de UI compartilhados: `Button` (`packages/shared-ui/src/index.tsx`), `Dialog` com pilha, foco preso, `inert` nos inferiores, Escape e Tab (`apps/web/components/ui.tsx:40-139`), `Loading` (`:140-147`). O restante (campos, selects, toasts, tabelas, chips) é CSS global com classes como `.field`, `.btn`, `.toast`, `.empty-state`, `.validation-errors`, `.info-box`. Não há biblioteca de componentes tipada, Storybook, tema escuro nem tokens para gráficos.
- **Observação.** Ícones: Lucide em toda a interface (`apps/web/components/icons.tsx`, `shell.tsx:4-15`). Fonte Inter local (`layout.tsx:2-5`).

---

## 12. Testes

**Observação.** Três suítes, nenhuma executada por mim.

| Suíte | Como roda | Configuração | Arquivos |
| --- | --- | --- | --- |
| Unitária (Vitest) | `npm test` | `vitest.config.mts` (`tests/unit/**/*.test.ts`, ambiente node) | 17 arquivos |
| Integração (Vitest + API + PostgreSQL) | `npm run test:integration` = `scripts/test-services.mjs integration` | `vitest.integration.config.mts` (sem paralelismo entre arquivos, timeout 20 s, `tests/integration/setup.ts` redireciona `127.0.0.1:4000` para `TEST_API_URL`) | 17 arquivos + `helpers.ts`, `setup.ts` |
| E2E (Playwright, Edge) | `npm run test:e2e` = `scripts/test-services.mjs e2e` | `playwright.config.ts` (1 worker, projetos desktop 1440x1000 e iPhone 13, baseURL `127.0.0.1:3001`, trace em falha) | 10 arquivos |

- **Observação.** `scripts/test-environment.mjs:2-27` falha fechado se o banco não terminar em `_test`, força API 4001, web 3001, `.next-test`, todas as flags externas em `false`, `ESFERA_OPTOUT_LINKS_JSON={}`. `scripts/test-services.mjs:56-103` cria o banco de teste, aplica migrações, sobe a API (e a web no E2E) e recusa portas ocupadas.
- **Observação.** Últimos resultados registrados (`docs/progress.md:9-11`, 28/10): typecheck e lint passaram; 160/160 unitários; 122/122 integrações em 16 arquivos; E2E só `projects.spec.ts` (2/2); build bloqueado por EPERM. Hoje existem 17 arquivos de integração (o de confirmação de SAIR não consta desse registro).

Cobertura por arquivo (nomes dos `describe`/`it` lidos por grep):

- **Unitários.** `workflow.test.ts` (contratos, rascunho incompleto, grafo, ramos, falha interrompe, redação de e-mail, espera na simulação); `variables.test.ts` (pílulas seguras); `durable-wait.test.ts` (cálculo de espera e expiração); `security.test.ts` (CPF, AES-GCM, scrypt, redação, rate limiter); `connectors.test.ts`, `connector-registry.test.ts`, `connector-stabilization.test.ts`, `commercial-connectors.test.ts` (criptografia, SSRF, HMAC, QR, templates, Resend, Svix, OAuth, Sheets); `local-evolution-transport.test.ts`; `managed-evolution.test.ts`; `whatsapp-meta-cloud.test.ts`; `whatsapp-zapi-mock.test.ts`; `whatsapp-quarantine.test.ts`; `whatsapp-fixtures.test.ts`; `opt-out.test.ts`; `opt-out-confirmation.test.ts`; `consolidation.test.ts` (gerador do `monstro.txt`).
- **Integração.** `api.test.ts` (sessão, isolamento de duas empresas, RBAC, origem, revisão, publicação única, gatilho SQL, simulação, execução real, cadastro/login); `projects.test.ts` (migração 18, RBAC, isolamento, renomear/duplicar/mover/arquivar, FK composta); `queue.test.ts` (webhook repetido, 20 jobs em dois processos, morte do processo, dedupe, erro transitório); `durable-wait.test.ts` (11 casos de suspensão, retomada, dois workers, expiração, transições); `commercial-cycle.test.ts`; `lead-concurrency.test.ts`; `phase5.test.ts` (outbox, OAuth, Sheets, recibos, rate limit, HMAC); `stabilization.test.ts`; `whatsapp.test.ts`, `managed-whatsapp.test.ts`, `whatsapp-removal.test.ts`, `whatsapp-connection-quarantine.test.ts`, `whatsapp-pairing-mock.test.ts`; `opt-out.test.ts`, `opt-out-confirmation.test.ts`; `database-integrity.test.ts`, `historical-integrity.test.ts` (replay de migrações, gatilhos de imutabilidade).
- **E2E.** `editor.spec.ts` (criar, personalizar, publicar, versões, simular; arrastar/reconectar só no desktop); `editor-navigation.spec.ts`; `variables.spec.ts`; `dialog-isolation.spec.ts`; `durable-wait.spec.ts`; `projects.spec.ts`; `system-opt-out.spec.ts`; `leads-interactions.spec.ts`; `operations.spec.ts`; `whatsapp-session-actions.spec.ts`.
- **Observação.** Não há testes de acessibilidade automatizados, de regressão visual, de carga, nem de contrato OpenAPI.

---

## 13. Lacunas e dívidas já conhecidas

Fonte entre parênteses: P = `docs/progress.md`, R = `docs/roadmap.md`, O = `docs/operations.md`, A = `docs/database-saas-audit.md`, C = observado no código nesta leitura.

1. **Editor comum sem painel Entrada | Parâmetros | Saída e sem o visual de nós do SAIR** (C, seção 3.6; brief do usuário). O inspetor só mostra parâmetros; entrada e saída ficam no `RunLog`.
2. **`npm run dev` não sobe o gateway WhatsApp dentro do tempo** (brief, item 5). No código, o supervisor espera até 100 tentativas de 500 ms (`scripts/dev.mjs:133-146`) e aborta tudo se o gateway não responder. **Desconhecido.** Causa do tempo esgotado.
3. **Build bloqueado por DLL do Prisma no Windows** (P:11, O:"Verificação"): `EPERM` ao substituir `query_engine-windows.dll.node` com API/worker/gateway ativos; o último build completo é anterior à migração 16 (P:22).
4. **Classes CSS com prefixo `n8n-`** (C): 83 ocorrências em `apps/web/app/globals.css:2649-2736`, usadas em `apps/web/components/system-opt-out.tsx` (`n8n-node`, `n8n-ndv`, `n8n-chip`, etc.) e um comentário "como no n8n" em `globals.css:2738`. Também aparecem nos chunks gerados em `apps/web/.next`. Risco de marca e de confusão em revisão clean-room. **Sugestão.** Renomear depois para um prefixo próprio (por exemplo `flow-` ou `vx-`), em uma fatia isolada, com busca e substituição nos dois arquivos.
5. **Documentação com acentos corrompidos**: a entrada de 28/10 em `docs/progress.md:3-11` e a seção "Projetos" em `docs/api.md:94-110` têm "??" no lugar de acentos (C). `apps/worker/README.md` e a seção "Decisão" de `docs/architecture.md` estão desatualizados (falam em BullMQ/Redis).
6. **Migração 19 e confirmação ao devedor sem registro no progress** (C, seção 7).
7. **Sem autenticação de produção na interface** (A, seção "Achados"; P:50): cadastro/login existem na API, mas a web usa sessão de desenvolvimento; fallback de `DevelopmentSession` não verifica `DEVELOPMENT_WORKSPACE`; sem organização ativa por sessão, sem convites, sem gestão de usuários.
8. **Sem RLS, papéis de banco separados, paginação, pool dimensionado, backup ensaiado ou banco de testes efêmero garantido** (A, "Próximas fatias" 0 a 5). Listas limitadas a 50, 100 e 200 registros sem cursor (C).
9. **Esperas, aprovação humana e sub-fluxos**: espera durável entregue (P:149-157); aprovação humana e `workflow.call` apenas planejados (`docs/phase6-technical-plan.md`, aviso final).
10. **Provedores não homologados**: Meta, Evolution, Z-API, Resend e Sheets em "Configuração necessária"; OAuth Google sem callback/troca de token; RD Station e HubSpot só contrato (P:212,223; C seção 6). Evolution em quarentena após incidente de conta (P:91-95).
11. **E-mail sem provedor habilitado falha explicitamente** (O:"Execução"); `EMAIL_EXTERNAL_ENABLED` ausente no `.env.example`.
12. **Link morto para `/editor/starter-sdr`** em `listings.tsx:480` e `README.md:21` (C, seção 2.5).
13. **Rota `/processos` e componente `ProcessList` legados** (C, seção 2.2).
14. **Estilos inline fora dos tokens** em `listings.tsx` e `run-log.tsx` (C).
15. **Sem interruptor ativo/inativo por fluxo, sem diff/restauração de versão, sem importação de JSON, sem notas no canvas, sem copiar/colar entre fluxos, sem busca global, sem tags de fluxo, sem execução manual real pela interface, sem detalhe de execução por rota, sem teste de nó isolado, sem pinagem de dados** (C: grep por `clipboard`, `sticky`, `import` no editor vazio; seções 3 e 4).
16. **Navegação Voltar/Avançar durante o debounce do autosave** permanece pendente (R:"Continuidade", P:121).
17. **Suíte E2E completa não foi reexecutada após projetos** (P:10); integração e E2E precisam rodar em série (O:"Verificação").
18. **Roadmap original**: fase 4 (landing, onboarding, planos e quotas) e fase 5 (suíte E2E integral, expiração de sessões) pendentes (R, tabela).

---

## 14. Capacidades do VEXOR (para a matriz de paridade)

Uma linha por capacidade, com o arquivo de referência. Todas são observações.

**Projetos e navegação**
- Lista de projetos com busca, ordenação, arquivados, cartões com contagem e última atividade (`apps/web/components/projects.tsx:221-439`).
- Criar/editar projeto com nome único normalizado, descrição, cor e ícone (`apps/api/src/workflows/project.service.ts:78-130`).
- Arquivar/restaurar projeto com revisão otimista e desfazer (`projects.tsx:248-266`).
- Espaço do projeto com abas Fluxos | Execuções | Credenciais (`projects.tsx:587-601`).
- Criar, renomear, duplicar, mover entre projetos, arquivar/restaurar fluxo com revisão (`project.service.ts:145-190`).
- Trocar projeto pelo trilho e breadcrumb no editor (`shell.tsx:127-151`; `editor.tsx:543-551`).
- Atalhos `/` e `n` nas listas; Ctrl Z/Y/D/S, Delete, Escape, Shift no editor (`projects.tsx:64-95`; `editor.tsx:271-305`).
- Barra lateral com nomes em telas largas e compacta em telas menores (`globals.css:2738-2750,2200-2222`).

**Editor**
- Canvas React Flow com fundo pontilhado, zoom 25% a 180%, minimapa, enquadrar, modo seleção/mão (`editor.tsx:804-933`).
- Biblioteca com busca, filtros por categoria, arrastar e soltar ou clique para adicionar (`editor.tsx:678-765`).
- 14 tipos de nó com schema Zod estrito e defaults (`packages/workflow-schema/src/index.ts:5-231`).
- Conectar, reconectar e excluir ligações com validação de ciclo e de saída ocupada (`editor.tsx:306-363`).
- Seleção múltipla, duplicar com ligações internas, excluir, desfazer/refazer com 60 passos (`editor.tsx:237-270`; `editor-state.ts:53-87`).
- Auto-layout com dagre (`editor.tsx:433-450`).
- Inspetor contextual por tipo com validação em tempo real e listas de contas/membros (`inspector.tsx:18-507`).
- Variáveis `{{lead.*}}` e `{{steps.<nó>.*}}` com pílulas, prévia e allowlist (`variable-input.tsx`; `workflow-schema/src/variables.ts`).
- Autosave com debounce, revisão otimista, conflito 409 com exportação de rascunho em JSON (`editor-state.ts:88-136`; `editor.tsx:512-519`).
- Salvar antes de navegar e aviso ao fechar a aba (`editor.tsx:162-197`; `editor-state.ts:137-146`).
- Validação do grafo idêntica no cliente e no servidor (`workflow-schema/src/index.ts:270-357`).
- Simulação no servidor com lead de exemplo, reprodução animada no canvas e log por etapa (`editor.tsx:451-489`; `workflow-engine/src/index.ts:431-433`).
- Publicação em versões imutáveis numeradas, histórico com snapshot, deduplicação de snapshot igual (`workflow.service.ts:146-187`; `editor.tsx:1160-1214`).
- Modo leitura para viewer e para fluxo/projeto arquivado (`editor.tsx:150`).
- Modelo "Qualificação de leads" (6 blocos) para criar fluxos (`workflow-schema/src/index.ts:381-409`; `listings.tsx:166-309`).
- Diálogos acessíveis com foco preso, pilha, Escape e `inert` (`ui.tsx:40-139`).
- Layout responsivo: biblioteca em gaveta abaixo de 1050 px, inspetor em gaveta no celular (`globals.css:2149-2199`; `docs/validation/projects-editor-mobile.png`).

**Fluxo do sistema SAIR (padrão visual a seguir)**
- Nós quadrados com ícone e nome embaixo, gatilho com lado arredondado, selos de estado (`system-opt-out.tsx:106-147`; `globals.css:2673-2687`).
- Ligações com contagem de itens e seta, coloridas quando há tráfego (`system-opt-out.tsx:150-167`).
- Painel do nó com Entrada | Parâmetros | Saída sobre o canvas, dados reais, Escape fecha (`system-opt-out.tsx:607-647`).
- Abas Editor | Execuções com contagem, chave Ativo, Atualizar, tabela de execuções (`system-opt-out.tsx:509-606`).
- Revisão humana com Confirmar/Descartar dentro do painel (`system-opt-out.tsx:422-434`).

**Execução**
- Fila durável em PostgreSQL com `SKIP LOCKED`, lease, token de posse e histórico de tentativas (`workflow-runtime/src/index.ts:130-191`).
- Idempotência por `(organização, fluxo, eventKey)` (`workflow-runtime/src/index.ts:39-45,118-124`).
- Versão publicada fixada por execução; snapshot protegido por gatilhos SQL (`schema.prisma:197-198`; migração 13).
- Efeitos transacionais: atribuir SDR, etiqueta, aviso interno, outbox de WhatsApp e e-mail, atualização de lead pela conversa (`workflow-runtime/src/index.ts:270-452`).
- Espera durável por intervalo ou data com checkpoint, retomada automática, expiração opcional e retomada manual (`workflow-engine/src/index.ts:307-363`; `resume.ts`; `workflow.controller.ts:192-196`).
- Retry limitado a erros transitórios do banco com backoff e teto (`workflow-runtime/src/index.ts:539-589`).
- Logs por etapa com entrada/saída redigidas e duração (`workflow-engine/src/index.ts:385-394`; `run-log.tsx`).
- Listagens de execuções e simulações por organização, por fluxo e por projeto; detalhe em diálogo (`workflow.service.ts:211-378`; `listings.tsx:311-502`).
- Faixa "Execuções reais" no editor com os três últimos e polling (`editor.tsx:113-132,954-983`).

**Gatilhos e entrada**
- Gatilho de lead por API `POST /workflows/:id/execute` (`workflow.controller.ts:170-174`).
- Webhook autenticado por segredo ou HMAC com janela temporal, chave de evento e rate limit (`workflow.service.ts:664-731`; `ingress.service.ts`).
- Mensagem WhatsApp recebida com inbox durável e roteamento fixado por conexão (`inbox.ts`; `whatsapp.service.ts:573-616`).
- Auditoria de ingressos sem segredos (`ingress.service.ts:44-75`; `GET /integrations/ingress/history`).

**Credenciais e integrações**
- Registro declarativo de 8 conectores com formulários gerados (`packages/connectors/src/contracts.ts:83-332`).
- Credenciais cifradas AES-256-GCM, nunca devolvidas (`connectors/src/index.ts:66-88`).
- WhatsApp Meta, Evolution (gerenciado e manual), Z-API e Sandbox MOCK com QR, código de pareamento, status, templates aprovados, envio e recibos (`connectors/src/index.ts:296-555`).
- Quarentena por conta e global, com liberação pelo titular (`whatsapp.service.ts:135-188`; `inbox.ts:42-60`).
- Transporte HTTPS com allowlist de origem, DNS fixado, sem redirecionamentos, prazo e limite de resposta (`connectors/src/index.ts:174-273`).
- E-mail Resend com idempotência e recibos Svix (`commercial.ts:16-78`; `delivery.ts:82-139`).
- Google Sheets: listar, ler, anexar, prévia local de mapeamento, preparação de OAuth com PKCE (`commercial.ts:118-210`; `integration.service.ts:177-269`).
- Janela de 24 h da Meta e exigência de template fora dela (`workflow-runtime/src/index.ts:296-301,685-690`).
- Consentimento do destinatário obrigatório para enviar (`workflow-runtime/src/index.ts:294-295,675-679`).

**Leads e notificações**
- Leads com status, etiquetas, responsável, telefone, consentimento, conversa e histórico (`listings.tsx:514-1048`; `workflow.service.ts:387-537`).
- Revisão otimista de lead incrementada por gatilho SQL (migração 15; `workflow.service.ts:509-536`).
- Notificações internas e externas em outbox com estados PENDING a READ e AVAILABLE (`schema.prisma:268-300`).

**Descadastro**
- Classificação de SAIR, outbox para o Esfera com ACK durável, revisão humana, descadastro manual, reenfileirar falhas, confirmação única ao devedor (`packages/connectors/src/opt-out.ts`; `workflow-runtime/src/opt-out.ts`; `opt-out.service.ts`).

**Segurança e multiempresa**
- Sessão por cookie HttpOnly ou Bearer, RBAC owner/editor/viewer, organização pela membership, 404 para recursos de outra empresa, verificação de origem em escritas (`development.guard.ts`).
- Cadastro com CPF validado e cifrado, senha scrypt, rate limit de login (`common/security.ts`; `workflow.service.ts:556-662`).
- FKs compostas por organização e gatilhos SQL contra vínculos cruzados e contra alteração de versões (`schema.prisma`; migrações 11 a 13 e 18).

**Operação e qualidade**
- Supervisor `npm run dev` com PostgreSQL embutido, migrações, gateway opcional, API, worker e web, com lock contra execução dupla (`scripts/dev.mjs`).
- Suítes unitária, de integração e E2E isoladas em banco `_test` e portas próprias (`scripts/test-environment.mjs`; `scripts/test-services.mjs`).
- Scripts de auditoria, replay de migrações, demonstrações e limpeza de fixtures (`scripts/*.mjs`, `scripts/demo-durable-wait.ts`).
