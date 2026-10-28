# Especificação de referência: backend, execução e API do n8n

Pesquisa de paridade VEXOR x n8n, fase 1 (reconhecimento), agente B.
Fonte exclusiva: documentação pública em docs.n8n.io e a referência pública da API (seção "n8n API", gerada da especificação OpenAPI). Data de acesso de todas as fontes: 2026-10-28.
Método: clean-room. Nenhum trecho de código, texto, nome de nó, marca ou asset do n8n foi copiado. Tudo aqui é descrição de comportamento e de contratos públicos (métodos, caminhos, parâmetros, campos, códigos de resposta, nomes de variáveis de configuração) nas minhas palavras. Não li repositórios de código do n8n.

## Como ler

Cada tópico separa três níveis de confiança:

- **Observação**: está escrito na documentação ou na especificação pública. Sempre com a fonte entre colchetes, por exemplo [B12]. O id aponta para a linha correspondente no "Ledger de fontes".
- **Inferência**: dedução minha a partir das observações. Digo o porquê. Não deve ser tratada como fato até ser confirmada.
- **Desconhecido**: não dá para afirmar pelas fontes consultadas. Vai também para a seção final "Desconhecidos em aberto".

Convenções:
- Nós são descritos pela função (por exemplo, "gatilho de webhook", "nó de espera"), não pelo nome comercial do produto.
- Nomes de variáveis de configuração, caminhos de API, campos de objetos e códigos HTTP são contratos públicos e aparecem como identificadores.
- Números só aparecem quando a documentação os cita. Não há métricas inventadas.
- Texto sem travessão; separações com vírgula, dois-pontos ou parênteses.

## 0. Contexto e versão observada

**Observação**
- A documentação observada reflete a versão 2.45 (publicada em 2026-10-20) e já traz uma página de mudanças incompatíveis da versão 3.0, ou seja, a 3.0 está prevista ou em lançamento [B7][B9].
- A documentação foi reorganizada em seções "Get started", "Deploy", "Build", "Nodes", "Connect", "Administer", "Contribute", "Changelog" [B2][B3]. Os caminhos antigos (/workflows/, /flow-logic/, /api/) redirecionam para os novos (/build/, /connect/, /administer/, /deploy/) [B10][B38][B190].
- Licença: a maior parte do código está sob a Sustainable Use License, e arquivos com ".ee." no nome ficam sob a licença Enterprise do n8n. A FAQ da licença trata "uso interno" como permitido e "oferecer o produto para clientes construírem fluxos" como fora do uso interno [B5]. A página inicial chama o produto de "fair-code" [B1].
- Edições self-hosted: Community (sem chave), Registered Community (chave gratuita que libera pastas, depuração no editor e dados personalizados de execução), Business e Enterprise (pagas) [B6][B4].
- O produto hoje contém, além de fluxos, "agentes" como itens de projeto (preview), tabelas de dados, pacotes portáveis, servidor MCP da instância, revisões de fluxo e um agendador durável com fila no banco [B77][B67][B25][B225][B23][B129].

**Inferência**
- Como a 3.0 remove fontes de sub-fluxo por arquivo e URL, remove importação por URL e muda defaults de segurança, a paridade deve mirar o comportamento 2.45 com os defaults da 3.0 (por quê: a página de 3.0 descreve o estado alvo da linha principal) [B9].

**Desconhecido**
- Data exata de lançamento da 3.0 e quais funcionalidades em "preview" (agentes, revisões, políticas de nós, JWE, pacotes) se tornarão estáveis.

## 1. Modelo de fluxo (workflow)

### 1.1 O que compõe um fluxo

**Observação**
- Um fluxo é uma coleção de nós ligados que automatiza um processo. Pode começar por um gatilho, por execução manual ou por chamada de outro fluxo, e pode ramificar, juntar e repetir [B4][B10].
- Componentes do editor: nós, ligações (conexões entre saída e entrada), notas adesivas, grupos de canvas e um identificador de fluxo [B11][B13][B14][B15].
- Um nó é ponto de entrada (gatilho), função de processamento ou saída para sistemas externos. Gatilhos aparecem com ícone de raio; ações executam tarefas [B12][B227].
- Configurações por nó (aba de ajustes): sempre produzir saída (gera item vazio quando não há dados; pode causar laço infinito em nós condicionais); executar uma vez (usa só o primeiro item); tentar de novo em falha; ao errar (parar o fluxo, continuar com os últimos dados válidos, continuar usando uma saída de erro separada); atributos de span personalizados (só com OpenTelemetry e licença Enterprise); notas e exibir nota no canvas [B12].
- Na 3.0, a opção "sempre produzir saída" em nós de múltiplas saídas passa a gerar item vazio só quando todas as saídas estão vazias [B9].
- O objeto de fluxo na API pública tem: `id`, `name`, `description`, `active` (obsoleto; usar `activeVersionId` não nulo), `activeVersionId`, `isArchived`, `versionId` (bloqueio otimista), `versionCounter`, `sourceWorkflowId`, `triggerCount`, `nodes`, `connections` (objeto chaveado pelo nome do nó de origem), `nodeGroups`, `settings`, `staticData` (dados mantidos entre execuções), `pinData` (dados fixados por nome de nó), `meta` (ids de onboarding, template e instância, flag de credenciais do template), `tags`, `shared` (papel, fluxo, projeto), `parentFolder`, `createdAt`, `updatedAt` e `activeVersion` (versão publicada: `versionId`, `nodes`, `connections`, `nodeGroups`, `authors`, `name`, `description`, `autosaved`, datas e `workflowPublishHistory` com eventos `activated` ou `deactivated` e `userId`) [B196][B223].
- Objeto de nó na API: `id`, `name`, `webhookId`, `disabled`, `notesInFlow`, `notes`, `type`, `typeVersion`, `executeOnce`, `alwaysOutputData`, `retryOnFail`, `maxTries`, `waitBetweenTries`, `continueOnFail` (obsoleto), `onError`, `position` (par de números), `parameters`, `credentials`, `customTelemetryTags` [B196].
- Grupos de canvas: nome obrigatório, descrição opcional (a página de produto diz até 145 caracteres; o esquema da API diz máximo 155), precisam de pelo menos dois itens, não aceitam gatilhos, devem formar cadeia conectada; estrutura e descrições são salvas com o fluxo; estado de colapso é preferência do navegador [B14][B196].
- O id do fluxo aparece na URL e no título das configurações; é a cadeia alfanumérica ao final da URL [B15][B45].
- Só pode haver um gatilho manual por fluxo [B255].

**Inferência**
- Como `connections` é chaveado pelo nome do nó, renomear um nó obriga a reescrever as ligações (por quê: a chave é o nome, não o id).
- `versionId` serve de bloqueio otimista, então uma atualização com `versionId` antigo deve ser rejeitada (por quê: a doc chama o campo de "optimistic locking", mas não mostra o código de erro).
- A versão publicada é um instantâneo separado do rascunho (por quê: `activeVersion` carrega seus próprios `nodes` e `connections`).

**Desconhecido**
- Formato e tamanho exatos do id de fluxo; formato interno do bloco de ligações (índices de saída e entrada); limites de nós por fluxo e de tamanho do JSON.

### 1.2 Formato JSON de importação e exportação

**Observação**
- Fluxos são salvos e exportados como JSON. Métodos: copiar e colar nós no editor; menu do fluxo (baixar JSON, importar de arquivo; importar de URL foi removido na 3.0); CLI do cliente com pacotes .n8np; CLI do servidor (exportar e importar fluxos e credenciais, com descontinuação prevista); API pública (endpoints de fluxo para JSON e endpoints de pacote) [B18][B9].
- O JSON exportado inclui nomes e ids de credenciais, não os segredos. Nós HTTP importados de cURL podem conter cabeçalhos de autenticação [B18].
- Blocos do objeto de fluxo e para que servem: `nodes` (lista de nós com tipo, versão de tipo, parâmetros, posição, credenciais referenciadas e ajustes), `connections` (mapa de ligações por nó de origem), `settings` (ver 1.4), `staticData` (estado persistido entre execuções), `pinData` (amostras fixadas para teste), `nodeGroups` (grupos visuais), `meta` (origem do fluxo), `tags` (rótulos globais), `shared` (vínculo com projeto e papel), `parentFolder` (pasta) [B196][B223].
- Pacote .n8np: tar comprimido com gzip (tar simples também aceito), com `manifest.json` como primeiro arquivo; campos sempre presentes: `packageFormatVersion` (atualmente "1"), `exportedAt`, `sourceN8nVersion`, `sourceId`; listas de entradas (`workflows`, `folders`, `projects`, `credentials`, `dataTables`, `variables`, `tags`) com `id`, `name`, `target`; bloco `requirements` com o que os fluxos exigem (credenciais, tabelas, fluxos, variáveis, tags, `nodeTypes`); layout em diretórios por entidade; versão de formato precisa bater exatamente; segredos nunca exportados; linhas de tabelas não incluídas; exportações idênticas são byte a byte iguais exceto `exportedAt` [B26].
- Conteúdo do pacote: fluxos (nós, ligações, configurações, estado publicado ou arquivado), pastas com aninhamento, projetos (nome, descrição, ícone), referências (id, nome e tipo de credencial; esquema de tabelas; variáveis com nome, tipo e opcionalmente valor; tags). Fora: segredos e configuração de credenciais, linhas de tabelas, execuções, usuários e papéis, dados fixados, dados estáticos, histórico de versões [B25].

**Inferência**
- O bloco `meta` com id de template e flag de credenciais sugere rastreio de origem para onboarding, não afeta execução (por quê: só campos de proveniência).

**Desconhecido**
- Esquema JSON formal dos parâmetros de cada nó (depende do tipo de nó, não há esquema geral documentado).

### 1.3 Versões, histórico, rascunho e publicação

**Observação**
- Edições são salvas automaticamente (tipicamente em 1 a 5 segundos); não há botão de salvar. Cada alteração gera uma nova versão salva. Versões salvas são rascunho e não afetam produção até publicar [B17].
- Publicar torna o fluxo ativo e fixa produção em uma versão. Produção sempre aponta para a versão publicada. Publicar habilita URLs de produção de webhook e formulário, agenda e escuta de eventos de apps. O botão só fica ativo com mudanças não publicadas. Ao publicar é possível nomear a versão (padrão UUID) e descrever. Mudar só configurações republica automaticamente [B17].
- Publicação é assíncrona: a plataforma compara gatilhos entre a versão publicada e a nova e reativa só os que mudaram; gatilhos inalterados seguem rodando. Estados: "publicado inválido" (nenhum gatilho que exija publicação), "parcial" (alguns gatilhos falharam; os que subiram continuam; republicar tenta de novo), "falhou" (nenhum gatilho subiu; versão publicada permanece registrada). Erros recentes bloqueiam republicação. Revisão aberta bloqueia publicação [B17].
- Despublicar remove o fluxo de produção; disponível no menu, na lista e no histórico [B17].
- Edição colaborativa: uma pessoa edita por vez; os demais veem em modo leitura; o bloqueio libera por inatividade [B17].
- Histórico: nova versão a cada salvamento, ao restaurar (salva a atual primeiro) e ao puxar do git (versões ficam no banco, não no git). Mudança só de configurações não gera versão. Retenção: 24 horas para todos; 5 dias no Cloud Pro; completo em Enterprise. Versões nomeadas nunca são podadas (nomear em Cloud Pro/Enterprise e self-hosted Business/Enterprise). Ações por versão: restaurar, clonar para novo fluxo, abrir em nova aba, baixar JSON, nomear [B19][B17].
- Variável `N8N_WORKFLOW_HISTORY_PRUNE_TIME` (horas; padrão -1, mantém tudo) [B106].
- Na 2.0 o interruptor ativo/inativo virou botão publicar/despublicar [B8].
- Na API: `POST /workflows/{id}/publish` (opcional `versionId`, `name`, `description`), `POST /workflows/{id}/unpublish`; `activate` e `deactivate` continuam como obsoletos; `GET /workflows/{id}/history` paginado e `GET /workflows/{id}/versions/{versionId}` [B196].
- Revisões de fluxo (preview, Enterprise, a partir de 2.37.0): admin habilita na instância; quem tem `workflow:publish` submete; revisor precisa de `workflow:read`; aprova ou pede mudanças o revisor, admin de projeto ou admin da instância; estados: aguardando revisão, mudanças solicitadas, aprovado (publica automaticamente em nome de quem pediu), fechado sem aprovação; bloqueia publicação no editor, na API e no MCP; uma revisão aberta por fluxo; cobre só nós e ligações [B23].

**Inferência**
- O "diff de gatilhos" na publicação implica que a plataforma guarda, por versão, quais gatilhos estavam registrados (por quê: precisa comparar para reativar só os alterados).

**Desconhecido**
- Como a plataforma detecta "erro recente" que bloqueia republicação; tempo de inatividade que libera o bloqueio de edição.

### 1.4 Configurações do fluxo

**Observação**
- Na UI: ordem de execução (v1 recomendada, v0 legada); fluxo de erro; "este fluxo pode ser chamado por"; fuso horário (sem fuso no fluxo nem na instância, cai em Nova York); salvar execuções de produção com falha; salvar execuções de produção com sucesso; salvar execuções manuais; salvar progresso (permite retomar de onde parou, com latência maior); tempo limite ligado e "tempo limite após" em horas, minutos e segundos (Cloud limita o máximo); redigir dados de execução de produção; redigir dados de execução manual (admin pode impor na instância); tempo economizado estimado em minutos por execução; atributos de span personalizados [B20].
- Na API, `settings`: `saveExecutionProgress` (booleano ou DEFAULT), `saveManualExecutions`, `saveDataErrorExecution` e `saveDataSuccessExecution` (DEFAULT, all, none; escrita aceita só all ou none), `executionTimeout`, `errorWorkflow` (id do fluxo com gatilho de erro), `timezone`, `executionOrder`, `binaryMode` (separate ou combined; só leitura), `engineType` (só leitura), `callerPolicy` (any, none, workflowsFromAList, workflowsFromSameOwner; padrão workflowsFromSameOwner), `callerIds` (ids separados por vírgula), `timeSavedMode` (fixed ou dynamic), `timeSavedPerExecution`, `redactionPolicy` (none, non-manual, manual-only, all), `redactCallerExecutions` (padrão true), `availableInMCP` (padrão false; exige fluxo ativo com nó de webhook ativo), `customTelemetryTags`, `credentialResolverId` (só leitura) [B196][B223].
- Padrão de política de chamadores da instância: `N8N_WORKFLOW_CALLER_POLICY_DEFAULT_OPTION` (padrão workflowsFromSameOwner; exige compartilhamento de fluxos) [B105].

**Inferência**
- `binaryMode` e `engineType` como campos só de leitura sugerem que o motor de execução e o modo de binário são decididos pela instância, não pelo autor do fluxo.

**Desconhecido**
- Valores possíveis de `engineType`; semântica de `binaryMode` "combined".

### 1.5 Tags, pastas, projeto, dono, arquivamento

**Observação**
- Tags são globais na instância; qualquer usuário renomeia; só donos da instância excluem; um fluxo pode ter várias; filtro por tags na lista; podem ser desativadas por `N8N_WORKFLOW_TAGS_DISABLED` [B22][B105].
- Pastas: recurso licenciado (gratuito na Registered Community); API por projeto com listagem filtrável (pai, nome, tags, excluir subárvore), ordenação, paginação por `skip` e `take` (padrão 10); criar (nome até 128, pai opcional); detalhes com totais recursivos de subpastas e fluxos; mover com `parentFolderId` ("0" leva à raiz); excluir com transferência para outra pasta ou, sem transferência, fluxos vão para a raiz e são arquivados e subpastas são excluídas [B205][B6][B28].
- Projetos: fluxos, credenciais, variáveis, tabelas e agentes vivem em projetos; cada usuário tem um papel por projeto; projeto pessoal versus de equipe; comunidade sempre usa o espaço pessoal [B4][B16][B168].
- O criador é dono do fluxo; propriedade só muda quando a conta é excluída. Em projeto de equipe o compartilhamento é pelo projeto; no espaço pessoal, por usuário [B24].
- Arquivar é exclusão lógica idempotente; desarquivar restaura; excluir remove de vez (a lista de execuções do fluxo some junto) [B196][B31].
- Mover fluxo entre projetos remove compartilhamentos existentes e pode quebrar dependências; na API, `PUT /workflows/{id}/transfer` com `destinationProjectId` [B168][B196].

**Inferência**
- A tabela de banco `shared_workflow` liga fluxos a usuários/projetos, então "dono" é uma relação de compartilhamento com papel, não uma coluna no fluxo (por quê: a doc do banco descreve essa tabela de mapeamento) [B160].

**Desconhecido**
- Profundidade máxima de pastas; regras contra movimentos circulares.

## 2. Modelo de execução

### 2.1 Modos de execução

**Observação**
- Uma execução é uma rodada de um fluxo: manual (a partir do editor) ou de produção (fluxo publicado) [B29][B4].
- Na API, o campo `mode` admite: cli, error, integrated, internal, manual, retry, trigger, webhook, evaluation, chat, agent [B197].
- Nas expressões, o modo exposto é "test" (disparo manual pelo editor), "production" (automático) ou "evaluation" [B58][B71].
- Execução de sub-fluxo gera sub-execução ligada à execução pai, com link de ida e volta [B45].
- Teste: "executar fluxo" roda tudo; "executar passo" roda um nó e os anteriores necessários (execução parcial) [B30].
- Cotas do Cloud: só produção conta; agenda conta a cada disparo; polling só quando há dados; webhook conta por requisição válida; não contam manuais, sub-fluxos, fluxos de erro, polls vazios e requisições rejeitadas [B29].
- Cada mensagem de chat gera uma execução; cada mensagem a um agente conta uma execução [B260][B273].

**Inferência**
- "integrated" corresponde a sub-fluxo chamado por outro fluxo e "internal" a disparos internos da plataforma (por quê: são os únicos modos que sobram depois de mapear manual, trigger, webhook, retry, error, cli, evaluation, chat e agent). Precisa confirmar.

**Desconhecido**
- Semântica oficial de "integrated" e "internal".

### 2.2 Estados e transições

**Observação**
- Estados na API: canceled, crashed, error, new, running, success, unknown, waiting [B197].
- O filtro de parada em lote aceita queued, running e waiting; "queued" não está na lista de estados de execução [B197].
- `startedAt` é nulo até a execução sair da fila; `stoppedAt` é nulo em new, running e unknown e preenchido em waiting; `waitTill` indica quando uma execução em espera retoma [B197].
- A lista de execuções filtra por Falha, Executando, Sucesso e Aguardando [B31][B32].
- Execuções em new, running e waiting nunca são podadas [B137].
- Desativação automática: `N8N_WORKFLOW_AUTODEACTIVATION_ENABLED` (padrão false) despublica o fluxo após `N8N_WORKFLOW_AUTODEACTIVATION_MAX_LAST_EXECUTIONS` (padrão 3) execuções com estado crashed [B91].
- Tempo limite cancela a execução (cancelamento suave após o nó atual; em processo próprio, encerra o processo após esperar um quinto do tempo limite) [B118].

**Inferência**
- "new" é o estado de criação e enfileiramento (por quê: `startedAt` nulo até sair da fila e "queued" aparece só como filtro de parada).
- "crashed" cobre falha do processo (memória, queda), enquanto "error" cobre erro de nó (por quê: a desativação automática fala de execuções "crashed" repetidas; o limite de memória descreve a execução parando no nó).
- Transições prováveis: new > running > (success | error | crashed | canceled); running > waiting > running; waiting > canceled; unknown para registros sem resultado consistente. Não há diagrama oficial.

**Desconhecido**
- Diagrama oficial de transições; o que acontece com "waiting" quando o tempo limite do fluxo expira.

### 2.3 Dados por nó, itens, múltiplas saídas, binários, dados fixados

**Observação**
- Todo dado entre nós é uma lista de itens; cada item tem `json` e/ou `binary`. Em `binary`, cada entrada nomeada tem `data` (base64, obrigatório), `mimeType`, `fileExtension`, `fileName` (opcionais) [B48]. A família de propriedades de arquivo binário nas expressões inclui diretório, extensão, nome, tamanho, tipo, id e tipo MIME [B56].
- Desde a versão 0.166.0, o nó de código envelopa automaticamente itens sem `json` e sem lista [B48].
- Nós processam cada item individualmente por padrão; "executar uma vez" limita ao primeiro item [B41][B48].
- Nós com múltiplas saídas: condicional (verdadeiro/falso), múltiplos caminhos (n saídas, saída extra de fallback), laço em lotes (loop/done), comparação de conjuntos (quatro saídas), filtro (mantidos/descartados), nó de resposta ao webhook (saída de resposta opcional), nó de parar com erro e saída de erro por nó [B248][B249][B247][B282][B250][B252][B12].
- Ligação de itens: cada item de saída aponta para os itens de entrada que o geraram; expressões escolhem o item certo automaticamente; no código, há método para rastrear o item correspondente; a 3.0 remove um auxiliar legado de item pareado [B52][B51][B9].
- Dados fixados: congelam a saída de um nó para testes; produção ignora; só nós com uma única saída principal (saídas de erro não contam); não aceita binário; podem ser editados em JSON; "copiar para o editor" fixa dados de uma execução passada no primeiro nó [B30][B62][B34].
- Dados de execução grandes: `EXECUTIONS_DATA_MAX_DISPLAY_SIZE` (padrão 100 MB) limita o que é carregado para exibição; na API, `dataTooLargeToDisplay` e `ignoreDataSizeLimit` [B91][B197].
- Tamanho de dados: `jsonSizeBytes` e `binaryDataSizeBytes` na execução (0 significa desconhecido) [B197].

**Inferência**
- O campo `binaryMode` "separate" indica que binários ficam fora do JSON de execução (por quê: há modos de armazenamento de binário distintos do banco).

**Desconhecido**
- Limite de tamanho por item; comportamento com mais de uma propriedade binária por item em cada nó.

### 2.4 Ordem de execução e execução parcial

**Observação**
- Ordem v1 (fluxos criados a partir da 1.0): executa um ramo até o fim antes do próximo; ramos ordenados pela posição no canvas, de cima para baixo, e o mais à esquerda primeiro em empate. Ordem v0 (legada): primeiro nó de cada ramo, depois segundo nó de cada ramo, e assim por diante [B40][B20].
- Execução parcial: roda o nó escolhido mais os anteriores necessários; exige gatilho conectado; fluxos com muitos ramos podem exceder o tamanho máximo da requisição (erro pede executar o fluxo inteiro); nós podem ser desativados temporariamente [B30].
- Nós "sujos": editar parâmetros, inserir ou remover nós, ligar, desativar, desafixar ou mudar dados fixados, mudanças em laços e em sub-nós marcam nós como desatualizados; execução parcial pode partir deles; executar novamente limpa o estado [B36].
- Sub-fluxos convertidos usam ordem v1 independentemente do pai [B46].

**Inferência**
- Como a execução parcial envia os dados existentes na requisição, há um limite de corpo (provavelmente `N8N_PAYLOAD_SIZE_MAX`) que explica o erro de tamanho (por quê: a doc fala em "tamanho máximo da requisição" sem nomear a variável).

**Desconhecido**
- Como múltiplos gatilhos ordenam a execução; qual limite exato bloqueia a execução parcial.

### 2.5 Repetir, parar, tempo limite e concorrência

**Observação**
- Repetir: só execuções com falha; "com o fluxo salvo atual" ou "com o fluxo original"; retoma do estado salvo e não do gatilho; nós concluídos mantêm resultados; o nó falho recebe a entrada salva e reprocessa todos os itens (risco de duplicidade; operações de upsert reduzem); se o nó falho for um chamador de sub-fluxo, o sub-fluxo inteiro reexecuta; mudanças só valem para nós não concluídos; ambas as opções carregam credenciais atuais; cada repetição é uma nova execução; só funciona enquanto a execução estiver armazenada; sucesso não se repete (usar "copiar para o editor") [B31][B32].
- Na API: `POST /executions/{id}/retry` com `loadWorkflow` (true usa o fluxo salvo atual); a resposta traz `retryOf`; o original ganha `retrySuccessId` quando a repetição dá certo [B197].
- Parar: `POST /executions/{id}/stop` e `POST /executions/stop` em lote com filtro de estado (queued, running, waiting), `workflowId` ou "all" e janela de datas; resposta com contagem `stopped` [B197]. Na fila de concorrência, cancelar ou excluir remove da fila [B136].
- Tempo limite: `EXECUTIONS_TIMEOUT` em segundos (padrão -1, desligado); `EXECUTIONS_TIMEOUT_MAX` (padrão 3600) limita o valor por fluxo; `N8N_AI_TIMEOUT_MAX` (3600000 ms) para nós de IA [B91][B118].
- Concorrência (self-hosted): `N8N_CONCURRENCY_PRODUCTION_LIMIT` (padrão -1, desligado no modo regular); conta execuções de produção (webhook e gatilho); não conta manuais, sub-fluxos, execuções de erro nem CLI; excedentes esperam em fila FIFO; não é possível repetir uma execução enfileirada; cancelar ou excluir tira da fila; ao reiniciar, retoma até o limite e reenfileira o resto; em modo fila, se o valor for diferente de -1 ele sobrepõe a concorrência do worker; a aba de execuções mostra ativos e limite [B136][B91].
- Avaliações têm limite próprio `N8N_CONCURRENCY_EVALUATION_LIMIT` (padrão por licença: Community e Cloud Pro 1, Business 3, Enterprise 5) [B91][B136][B162].
- No Cloud, cada plano tem limite de concorrência; a fila é FIFO; evaluações não contam [B162].
- Modo fila: concorrência por worker com a opção `--concurrency` (padrão 10; recomendado ao menos 5; valores muito baixos em muitos workers esgotam o pool do banco) [B135].

**Inferência**
- A repetição "retoma do estado salvo" depende de dados de execução salvos; com "salvar execuções com falha" em "não salvar", não há repetição (a doc confirma a dependência) [B31].

**Desconhecido**
- Comportamento do tempo limite em modo fila; se execuções em espera contam para a concorrência.

### 2.6 O que é salvo, retenção e limpeza

**Observação**
- Variáveis globais: `EXECUTIONS_DATA_SAVE_ON_ERROR` (all ou none; padrão all), `EXECUTIONS_DATA_SAVE_ON_SUCCESS` (padrão all), `EXECUTIONS_DATA_SAVE_ON_PROGRESS` (padrão false; salva após cada nó), `EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS` (padrão true). Configurações por fluxo sobrescrevem [B91][B137][B20].
- Poda: `EXECUTIONS_DATA_PRUNE` (padrão true) apaga execuções concluídas com seus dados e binários; `EXECUTIONS_DATA_MAX_AGE` (padrão 336 horas, 14 dias); `EXECUTIONS_DATA_PRUNE_MAX_COUNT` (padrão 10000; 0 ilimitado; apaga da mais antiga); poda ocorre quando qualquer gatilho é atingido; exclusão em duas etapas (marcação e remoção definitiva), `EXECUTIONS_DATA_PRUNE_SOFT_DELETE_INTERVAL` (60 min), `EXECUTIONS_DATA_PRUNE_HARD_DELETE_INTERVAL` (15 min), `EXECUTIONS_DATA_HARD_DELETE_BUFFER` (1 hora); nunca poda new, running, waiting e execuções anotadas (tags ou votos); no SQLite o espaço é reutilizado (`DB_SQLITE_VACUUM_ON_STARTUP`); a poda de binários segue o modo ativo [B91][B137].
- Armazenamento de dados de execução: `N8N_EXECUTION_DATA_STORAGE_MODE` (database, filesystem, s3, azure; s3 e azure exigem licença Business ou Enterprise); `N8N_STORAGE_PATH` (base para filesystem) [B91][B139]. No S3 o caminho segue workflows/{id}/executions/{id}/execution_data/bundle.json; a poda usa as variáveis de execução, sem regra de ciclo de vida no bucket [B139].
- Excluir um fluxo apaga seu histórico de execuções [B31].
- Dados personalizados de execução: chave até 50 caracteres, valor até 255 (o nó dedicado documenta 512 e trunca), até 10 itens por execução; servem de filtro na lista; licença Cloud Pro/Enterprise ou self-hosted Registered Community/Enterprise [B33][B261].
- Anotações: a API expõe tags por execução (GET e PUT em `/executions/{id}/tags`) e um objeto `annotation` com `vote` e `tags` na repetição [B197].
- Redação de dados: política por fluxo (nenhuma, produção, manual, todas) e piso de instância (off, production, all); metadados (nós, estado, tempos, estrutura) permanecem; JSON dos itens vira objeto vazio e binários somem; campos sensíveis sempre redigidos; mensagens de erro redigidas exceto tipo e código HTTP; `execution:reveal` revela uma execução com confirmação e evento de auditoria; execuções com credenciais dinâmicas não podem ser reveladas; novos fluxos herdam o piso; a API rejeita política abaixo do piso; Enterprise [B148][B218][B197].
- Credenciais de usuário final: quem não as possui vê entradas e saídas redigidas, inclusive dados de sub-fluxos [B29][B84].

**Inferência**
- A combinação "salvar progresso" mais repetição explica a retomada do ponto de falha (por quê: sem progresso salvo, não há estado intermediário para retomar).

**Desconhecido**
- Se "salvar progresso" muda o formato de armazenamento; limite de tags por execução.

### 2.7 Fila, workers e modo escalado

**Observação**
- Modo fila (`EXECUTIONS_MODE=queue`): a instância principal trata timers e webhooks, cria execuções e as enfileira; Redis é o broker obrigatório; workers (`n8n worker`) puxam execuções, leem o fluxo no banco, executam, gravam resultado e avisam; processadores de webhook opcionais (`n8n webhook`) atrás de balanceador; banco compartilhado (PostgreSQL recomendado; SQLite não serve para distribuição); mesma `N8N_ENCRYPTION_KEY` em todos [B135].
- Fluxo de despacho: principal cria a execução e envia o id ao Redis; worker consome, lê o fluxo, executa, grava e sinaliza; Redis notifica o principal. Webhook recebido no principal ou no processador roda no worker (latência extra) [B135].
- Roteamento: `/webhook/*` e `/webhook-waiting/*` para o pool de webhooks; `/webhook-test/*` e o resto para o principal; `N8N_DISABLE_PRODUCTION_MAIN_PROCESS=true` tira webhooks de produção do principal [B135][B92].
- Respostas grandes de webhook vindas do worker: `N8N_WEBHOOK_RESPONSE_RELAY_SIZE_MAX` (64 MiB) e `N8N_WEBHOOK_RESPONSE_RELAY_OFFLOAD_ENABLED` (guarda corpos grandes no armazenamento de binários) [B135][B95].
- Variáveis de Redis: `QUEUE_BULL_REDIS_HOST`, `PORT`, `DB`, `USERNAME`, `PASSWORD`, `TIMEOUT_THRESHOLD` (10000 ms), `CLUSTER_NODES`, `TLS`, `DUALSTACK`, `QUEUE_BULL_PREFIX`; worker: `QUEUE_HEALTH_CHECK_ACTIVE`, `QUEUE_HEALTH_CHECK_PORT` (5678), `QUEUE_WORKER_LOCK_DURATION` (60000 ms), `QUEUE_WORKER_LOCK_RENEW_TIME` (10000 ms), `QUEUE_WORKER_STALLED_INTERVAL` (30000 ms); `QUEUE_WORKER_MAX_STALLED_COUNT` removida na 2.0 (jobs travados não são mais repetidos automaticamente); `N8N_GRACEFUL_SHUTDOWN_TIMEOUT` (30 s) [B95][B8][B135].
- Multi-main (Enterprise): várias instâncias principais; seguidores servem API, UI e webhooks; o líder também roda tarefas "no máximo uma vez" (gatilhos não HTTP, pollers, conexões persistentes, poda); failover automático; `N8N_MULTI_MAIN_SETUP_ENABLED`, `KEY_TTL` (10 s), `CHECK_INTERVAL` (3 s); sessões pegajosas no balanceador; mesma versão em tudo [B135][B95].
- Binários em fila: filesystem não é suportado; usar s3, azure ou database [B135][B138].
- Na 3.0, execuções manuais sempre vão para workers (`OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS` removida) [B9].
- Task runners em modo externo: um sidecar por worker (e no principal se execuções manuais não forem descarregadas) [B128].
- Desempenho citado: até 220 execuções por segundo em uma única instância; cenários de benchmark publicados em gráficos; há framework de benchmark no repositório (não consultado) [B134].
- Agendador durável: execuções agendadas gravadas no banco antes do horário; qualquer principal reivindica; reaper libera reivindicações de instâncias caídas; retenção de histórico; reconciliação de donos [B129][B111].

**Inferência**
- O principal continua sendo ponto único para gatilhos não HTTP sem multi-main (por quê: só o líder roda pollers e timers; sem multi-main há um único principal).

**Desconhecido**
- Como nós da comunidade são instalados em workers; limites de tamanho de job no Redis além do relay de resposta.

## 3. Tratamento de erros

### 3.1 Erro por nó: continuar, saída de erro e tentar de novo

**Observação**
- Cada nó tem "ao errar" com três comportamentos: parar o fluxo; continuar com os últimos dados válidos; continuar usando uma saída de erro separada, que passa a informação do erro ao próximo nó [B12]. Na API, o campo `onError` guarda essa escolha e `continueOnFail` é a forma obsoleta [B196].
- "Tentar de novo em falha" reexecuta o nó até dar certo, com "máximo de tentativas" e "espera entre tentativas" em milissegundos (recomendação da doc de limites de taxa: espera maior que o intervalo do limite da API). Na API: `retryOnFail`, `maxTries`, `waitBetweenTries` [B12][B233][B196].
- O nó de requisição HTTP tem "nunca errar" (trata qualquer código como sucesso) e, por padrão, só 2xx é sucesso [B251].
- Dados fixados só valem para nós com uma única saída principal; saídas de erro não contam nessa regra [B62].

**Inferência**
- "Continuar usando saída de erro" cria uma segunda saída no nó, roteando os itens com erro por ela (por quê: a regra de fixação distingue saída principal de saída de erro).

**Desconhecido**
- Política de espera (fixa ou exponencial) e limite de `maxTries`; se "tentar de novo" se aplica a gatilhos.

### 3.2 Fluxo de erro e gatilho de erro

**Observação**
- Um fluxo de erro começa com o gatilho de erro e é escolhido nas configurações do fluxo monitorado ("fluxo de erro"); um fluxo de erro pode servir a vários fluxos; se um fluxo contém o gatilho de erro, ele usa a si mesmo por padrão; não é preciso publicar o fluxo de erro [B39][B244].
- O gatilho de erro dispara só para execuções automáticas (não manuais) [B244].
- Dados recebidos quando o erro ocorre dentro do fluxo: objeto `execution` com `id`, `url`, `retryOf` (só em repetições), `error` (`message`, `stack`), `lastNodeExecuted`, `mode`; objeto `workflow` com `id` e `name`. `id` e `url` exigem execução salva no banco [B39].
- Quando o erro acontece no gatilho do fluxo monitorado (falha de ativação), o payload traz `trigger` com `error` (`context`, `name`, `cause` com `message` e `stack`, `timestamp`, `message`, `node`) e `mode` (valor "trigger"), além de `workflow` [B39].
- O tipo de nó usado como gatilho de erro é configurável por `NODES_ERROR_TRIGGER_TYPE` [B101].
- Execuções do fluxo de erro não contam para cotas, concorrência nem tempo economizado; aparecem nas outras métricas de insights [B29][B136][B188].
- Hooks externos: se um hook de pré-execução lança erro, nenhuma execução é registrada (na 3.0 a variável que criava execução falha foi removida) [B124][B9].

**Inferência**
- Como `execution.url` só existe com execução salva, fluxos com "não salvar execuções com falha" entregam alertas sem link (por quê: a doc condiciona `id` e `url` ao salvamento).

**Desconhecido**
- Se o fluxo de erro recebe o erro de uma execução de sub-fluxo ou só do pai; se dispara para execuções "crashed".

### 3.3 Parar com erro, alertas e observabilidade

**Observação**
- O nó de parar com erro força a falha com "mensagem de erro" ou "objeto de erro" (JSON com propriedades), alimentando o fluxo de erro [B245].
- O nó auxiliar de depuração lança erros de tipos específicos e simula falta de memória [B303].
- Alertas: o uso típico do fluxo de erro é enviar e-mail ou mensagem em chat [B39]; log streaming envia eventos de fluxo (iniciado, sucesso, falha, cancelado) com detalhes do erro para webhook, syslog ou Sentry [B189]; insights mostram execuções falhas e taxa de falha [B188]; rastreamento OpenTelemetry marca estado por span [B157]; auto-despublicação após crashes repetidos [B91].
- Resposta de webhook em caso de erro antes do nó de resposta: HTTP 500 com erro [B252].
- Mensagens de erro são redigidas quando há política de redação, exceto tipo de erro e código HTTP [B148].

**Inferência**
- Não há "alerta nativo" por e-mail sem construir um fluxo; o fluxo de erro é o mecanismo primário (por quê: nenhuma página descreve notificação automática fora de fluxo de erro e log streaming).

**Desconhecido**
- Esquema do objeto de erro aceito pelo nó de parar com erro.

## 4. Lógica de fluxo, dados e expressões

### 4.1 Condições e divisão de caminhos

**Observação**
- Nó condicional: condições por tipo (texto, número, data e hora, booleano, lista, objeto) com operadores próprios; texto: existe, vazio, igual, contém, começa ou termina com, regex; número: igual, maior, menor, com ou sem igualdade; data: igual, depois, antes; booleano: verdadeiro, falso; lista: contém, comprimento comparado; objeto: existe, vazio. Combinação E ou OU. Saídas verdadeiro e falso [B248].
- Nó de múltiplos caminhos: modo regras (uma regra por saída, saídas renomeáveis) ou modo expressão (expressão retorna o índice da saída; número de saídas configurável); fallback nenhum, saída extra ou saída 0; "enviar a todas as saídas correspondentes"; ignorar maiúsculas; validação de tipo flexível [B249].
- Nó de filtro: mantém itens que atendem às condições e descarta o resto; E ou OU sem mistura; ignorar maiúsculas; validação flexível [B250].
- Na ordem v0 (fluxos anteriores à 1.0), um nó de junção após um condicional podia executar os dois ramos; removido na 1.0 [B246][B248].

**Desconhecido**
- Se o condicional tem opções de "ignorar maiúsculas" (a página do condicional não as documenta; a do múltiplos caminhos sim).

### 4.2 Juntar caminhos

**Observação**
- Nó de junção: aceita mais de duas entradas a partir da 1.49.0. Modos: anexar (concatena itens das entradas, aguardando todas as entradas conectadas); combinar por campos correspondentes (tipo de saída: manter correspondências, manter não correspondências, manter tudo, enriquecer entrada 1, enriquecer entrada 2), por posição, por todas as combinações; consulta SQL (entradas como tabelas input1, input2...; parâmetros com marcador de posição; opção para resultado vazio); escolher ramo (saída de uma entrada ou um item vazio). Opções: tratamento de colisão (priorizar uma entrada ou manter ambas com sufixo; mesclagem profunda ou rasa), comparação flexível de tipos, desativar notação de ponto, múltiplas correspondências (todas ou primeira), incluir itens sem par (posição). Quando as contagens diferem, a entrada 1 governa [B246][B42].
- Limite de memória do sandbox SQL do nó de junção: `NODES_MERGE_SQL_SANDBOX_MEMORY_LIMIT_MB` (64) [B101].
- Nó de comparação de conjuntos: campos de correspondência, quatro saídas (só em A, iguais, diferentes, só em B), fonte de verdade por lado ou mistura [B282].
- Juntar várias execuções de um mesmo nó em laços é feito com nó de código [B42].

**Desconhecido**
- Se o nó de junção executa com dados parciais quando um ramo não produz nada na ordem v1 (a doc só afirma que anexar e escolher ramo aguardam todas as entradas).

### 4.3 Laços e lotes

**Observação**
- Nós iteram item a item por padrão; laços explícitos só quando necessário [B41].
- Nó de laço em lotes: tamanho do lote; saída "loop" a cada iteração e "done" ao terminar com todos os dados processados; opção de reset (trata a entrada como nova; pode ser expressão); variáveis de contexto "não há itens restantes" e "índice da rodada atual"; termina sozinho ao esgotar os itens; com reset, exige condição de parada (condicional) sob risco de laço infinito [B247][B41].
- Nós que não iteram automaticamente: inserções e atualizações em alguns bancos (uma chamada para todos os itens), nó de código e chamador de sub-fluxo no modo "todos os itens", paginação do nó HTTP (precisa de laço), leitor de RSS [B41].
- Estratégias de limite de taxa: tentar de novo com espera, laço em lotes com nó de espera no retorno, lote interno do nó HTTP (itens por lote e intervalo em ms), paginação do nó HTTP [B233][B251].

**Desconhecido**
- Limite de iterações; proteção contra laço infinito além da expiração do tempo limite.

### 4.4 Esperar

**Observação**
- Nó de espera: retomar após intervalo (segundos, minutos, horas, dias), em data e hora específica, ao receber chamada de webhook (URL única gerada por execução, exposta como metadado da execução; vários nós de espera retomam em sequência) ou ao receber envio de formulário [B241][B44].
- Esperas abaixo de 65 segundos ficam em memória; acima disso, os dados da execução são descarregados para o banco [B241].
- Opções do webhook de retomada: autenticação (básica, cabeçalho, JWT, nenhuma), método HTTP, código de resposta, modo de resposta (imediato, ao terminar com opções de dados, via nó de resposta), limite de tempo de espera (intervalo ou data), propriedade binária, ignorar bots, lista de IPs (outros recebem 403), corpo bruto, dados e cabeçalhos de resposta personalizados, sufixo de webhook (deve ser anexado manualmente à URL de retomada) [B241].
- Formulário de retomada: título, descrição, campos (data, lista, número, senha, texto, área de texto; lista com múltipla escolha), obrigatórios, responder ao enviar, ao terminar ou via nó de resposta, limite de tempo, texto ou redirecionamento após envio [B241].
- Esperas usam a hora do servidor; o fuso do fluxo não afeta [B241].
- Execuções parciais mudam a URL de retomada; o nó que envia a URL deve rodar na mesma execução que o nó de espera [B241].
- Caminho das esperas: `/webhook-waiting/*` vai para o pool de webhooks em modo fila [B135][B92].
- Na 2.0, quando um sub-fluxo retoma de uma espera, o pai recebe a saída final do sub-fluxo e não mais a entrada [B8].
- Variantes "enviar e aguardar resposta" existem em e-mail SMTP, chat, WhatsApp e outros canais, com tipos de resposta aprovação (um ou dois botões), texto livre e formulário personalizado, e limite de tempo [B257][B276][B306].

**Inferência**
- A URL de retomada de formulário e a de webhook compartilham o mesmo mecanismo de espera com execução no estado "waiting" e campo `waitTill` (por quê: ambos descarregam a execução e retomam por chamada HTTP).

**Desconhecido**
- Limite máximo de duração de espera; o que acontece com execuções em espera ao reiniciar workers.

### 4.5 Sub-fluxos

**Observação**
- Chamador de sub-fluxo: fonte no banco (lista ou id); fontes por arquivo local, URL e JSON em parâmetro existem na doc do nó, mas a 3.0 remove arquivo local e URL [B242][B9]. Modos: uma execução com todos os itens ou uma execução por item; opção "aguardar conclusão do sub-fluxo" (desligada, o pai continua imediatamente) [B242].
- Gatilho de sub-fluxo ("quando executado por outro fluxo"): modo de entrada por campos tipados (o chamador exibe os campos automaticamente), por exemplo JSON ou aceitar tudo; campo removido no chamador chega como nulo; opção de converter tipos [B243][B242].
- Dados de volta: o último nó do sub-fluxo devolve itens ao chamador; sub-execução e execução pai se linkam mutuamente [B45][B242].
- Política de quem pode chamar: configuração "este fluxo pode ser chamado por" com valores any, none, lista de ids, mesmo dono (padrão) [B196][B45][B105].
- Sub-fluxo com erros não pode ser disparado pelo pai; sub-execuções não contam para cotas de execução nem para limite de fluxos ativos [B45][B243].
- Converter seleção em sub-fluxo: cria um novo fluxo com os nós selecionados, reescreve expressões que apontavam para fora e as transforma em parâmetros do gatilho; restrições de seleção contínua, um ponto de entrada e um de saída, sem gatilhos; sub-nós de IA com suporte limitado; usa ordem v1 [B46].
- Existe também uma ferramenta de agente que chama fluxos como ferramenta [B243].
- Carregar dados de execuções anteriores para construir sub-fluxos exige salvar execuções de produção bem-sucedidas no sub-fluxo e plano Cloud ou Registered Community [B45].

**Inferência**
- "Aguardar conclusão" desligado cria execução desacoplada estilo "fire and forget"; a execução filha ainda é registrada como sub-execução (por quê: links de ida e volta existem em ambos os modos; a doc não diferencia).

**Desconhecido**
- Profundidade máxima de aninhamento de sub-fluxos; propagação de tempo limite do pai para o filho.

### 4.6 Execução de código

**Observação**
- Nó de código em JavaScript (Node.js, promessas, saída de console para o navegador) e Python nativo (a partir da 1.111.0; estável na 2.x; via task runners; só as variáveis de itens; notação por colchetes; builtins inseguros negados por padrão; módulos por allowlist incluídos na imagem de runners). Modos: uma vez para todos os itens ou uma vez por item. Sem acesso a sistema de arquivos nem HTTP direto. Cloud: só módulo crypto e pacote moment no JS; nenhum módulo Python [B69].
- Módulos: `NODE_FUNCTION_ALLOW_BUILTIN` e `NODE_FUNCTION_ALLOW_EXTERNAL` (no modo externo, no arquivo de configuração dos runners) [B119][B102].
- Task runners: broker na instância, runner conecta por websocket; modo interno (deprecado na 3.0) ou externo (imagem de runners como sidecar; token compartilhado; endereço do broker; auto-desligamento por inatividade); variáveis de concorrência (5 por runner), tempo limite de tarefa (300 s; cai para 60 s na 3.0), heartbeat (30 s), tempo de espera por runner livre (60 s), modo inseguro, bloqueio de acesso ao ambiente do runner no Python; endurecimento com imagem distroless, usuário não root, filesystem somente leitura, AppArmor [B128][B102][B147][B9].
- Avaliador de expressões dentro do nó de código foi bloqueado em modo seguro (2.0) e removido na 3.0 [B8][B9].
- Acesso a variáveis de ambiente no código e em expressões é bloqueável por `N8N_BLOCK_ENV_ACCESS_IN_NODE` (padrão true a partir da 2.0 segundo a página de mudanças; a tabela de variáveis lista false) [B8][B94].
- Nó de transformação por IA gera código a partir de descrição (só Cloud; a 3.0 migra para nó de código) [B305][B9].
- Saída de console do nó de código em produção pode ir para stdout com `CODE_ENABLE_STDOUT` [B99].

**Inferência**
- A divergência de padrão de `N8N_BLOCK_ENV_ACCESS_IN_NODE` entre páginas indica documentação desatualizada em uma delas; assumir o padrão mais restritivo (true) para a 2.x e 3.x.

**Desconhecido**
- Limite de memória por tarefa de código além do heap do runner; limites de tempo em execuções longas de Python.

### 4.7 Transformação de dados

**Observação**
- Abordagens: expressões em parâmetros (recomendadas quando bastam), nó de código, nó de transformação por IA (Cloud) e nós visuais dedicados: agregar (campos individuais ou todos os dados em lista), limitar (primeiros ou últimos N), remover duplicatas (no lote atual ou entre execuções, com histórico de 10000 itens por padrão e escopo por nó ou por fluxo, critérios "valor novo", "maior que anterior", "data posterior"), ordenar (campos, aleatório, código), separar lista em itens, resumir (anexar, concatenar, média, máximo, mínimo, soma, contagem, contagem única; agrupar por campos), editar campos (mapeamento manual ou JSON; manter só campos definidos; incluir binários; notação de ponto), renomear chaves (inclusive por regex), data e hora (somar, subtrair, extrair parte, formatar, data atual, diferença, arredondar), criptografia (gerar aleatório ou UUID, hash, HMAC, assinar, cifrar e decifrar), HTML (gerar de template, extrair por seletor CSS, tabela), XML, Markdown, converter para arquivo (CSV, HTML, ICS, JSON, ODS, RTF, texto, XLS, XLSX, base64), extrair de arquivo (CSV, HTML, ICS, JSON, ODS, PDF, RTF, texto, XLS, XLSX), compressão, edição de imagem [B54][B49][B284][B287][B272][B286][B285][B283][B271][B288][B289][B290][B291][B292][B293][B280][B281][B294][B295].
- Filtro visual no painel de entrada e saída é só de exibição [B61].

### 4.8 Expressões e variáveis internas (conceitos)

**Observação**
- Sintaxe: trecho entre chaves duplas dentro de um parâmetro; dentro cabe JavaScript, inclusive objetos de data Luxon; várias instruções exigem função auto-invocada; expressões são de uma linha; referenciar nó não executado dá erro, com método para checar se o nó executou; em modo JSON a saída precisa ser JSON válido [B55].
- Expressões funcionam em qualquer campo que as suporte, inclusive em campos de credencial, e são avaliadas por execução [B55][B78].
- Motor de expressões no backend: `N8N_EXPRESSION_ENGINE` (vm padrão, quickjs, legacy sem isolamento), motor do editor (`N8N_EXPRESSION_ENGINE_FRONTEND`), pool de sandboxes, cache de expressões compiladas (1024), tempo limite por avaliação (5000 ms), memória por sandbox (128 MiB) [B112].
- Variáveis internas, em alto nível: dados JSON e binários do item atual; entrada do nó (todos, primeiro, último, item atual, parâmetros do nó anterior, contexto de laço); saída de outro nó por nome (todos, primeiro, último, item vinculado, item correspondente por índice, parâmetros, se executou; índices opcionais de ramo e de rodada); nó anterior (nome, índice da saída, índice da rodada); índice do item e índice da rodada; metadados da execução (id, modo, URL de retomada de webhook, URL do formulário de retomada, dados personalizados com ler e gravar); metadados do fluxo (id, nome, ativo); variáveis da instância ou do projeto; segredos externos (só em credenciais; nunca exibidos); variáveis de ambiente do processo (bloqueáveis); agora e hoje (data e hora Luxon no fuso do fluxo); versão do nó; parâmetros do nó; dados estáticos do fluxo (só no nó de código JS); valor preenchido por IA; funções de conveniência (condicional, valor padrão se vazio, máximo, mínimo); consulta JMESPath (objeto primeiro, consulta depois; indisponível em Python); variáveis do nó HTTP (resposta com corpo, cabeçalhos, código e mensagem; requisição; contagem de páginas) [B57][B51][B71][B58][B59][B60][B66][B73].
- Famílias de funções de transformação, com contagens aproximadas das listas documentadas: texto (cerca de 40: base64, extração de domínio, e-mail e URL, hash, validação de e-mail, URL, domínio e número, conversão para número, data, booleano e JSON, remoção de markdown e tags, substituições, caixa alta e baixa, snake, title e sentence case, codificação de URL), número (cerca de 14: arredondamentos, par e ímpar, inteiro, formatação, conversões), data (uma de conversão mais cerca de 40 métodos Luxon: partes da data, diferença, formatação, início e fim de período, somar e subtrair, fuso, relativo, ISO), lista (cerca de 35: média, soma, máximo, mínimo, pedaços, compactar, diferença, interseção, união, únicos, mapear, filtrar, reduzir, ordenar, extrair campo, juntar, aleatório, renomear chaves), objeto (cerca de 12: chaves, valores, mesclar, remover ou manter campos, vazio, JSON), booleano (4) e arquivo binário (7 propriedades) [B56].
- Datas: Luxon é recomendado sobre Date nativo; fuso resolvido na ordem fluxo, `GENERIC_TIMEZONE`, America/New_York; datas viram texto entre nós; concatenar data com texto produz timestamp em milissegundos [B65][B103].

**Inferência**
- A existência de um motor com isolamento (vm, quickjs) e limites de tempo e memória indica que expressões são tratadas como código não confiável (por quê: há sandbox e tempo limite por avaliação).

**Desconhecido**
- Limite de tamanho de expressão; comportamento de cache entre execuções.

## 5. Gatilhos

### 5.1 Manual, agendamento e polling

**Observação**
- Gatilho manual: roda só ao clicar em executar; um por fluxo; serve de ponto de partida sem gatilho automático; dados fixados valem nele [B255][B30].
- Agendamento: intervalos por segundos, minutos, horas (minuto de disparo), dias (hora e minuto), semanas (dias da semana), meses (dia do mês; meses sem o dia não disparam) e cron personalizado; várias regras no mesmo nó, cada uma independente; expressão cron com cinco campos e sexto opcional de segundos na frente; variáveis na expressão avaliadas só na publicação; fuso do fluxo, senão da instância (self-hosted America/New_York; Cloud detecta ou GMT); política de execuções perdidas (não rodar; rodar a mais recente; rodar a mais recente por regra) com período de graça (0 usa `N8N_SCHEDULER_MISFIRE_GRACE`, 60 s; teto de 30 dias), a partir de 2.36 com agendador durável; a partir de 2.45, intervalos de segundos e minutos contam a partir da publicação, cron continua alinhado ao relógio; exige publicar [B240][B129][B111].
- Agendador durável (padrão a partir de 2.45.0): grava execuções futuras no banco (janela de materialização 60 s, intervalo 10 s), executor a cada 5 s, lease de 60 s, lote de reivindicação 100, reaper a cada 30 s, até 5 tentativas antes de dead-letter, retenção de 1 dia para sucesso e 7 dias para falhas, reconciliação de donos, jitter; polls podem ser roteados por ele (opt-in) com cursores duráveis; tarefas de sistema também (opt-in) [B129][B111][B130].
- Polling: gatilhos de apps por sondagem usam "horários de sondagem" (a cada hora, dia, semana, mês, a cada X minutos ou horas, cron); polls sem dados novos não contam na cota; métricas de polling opcionais [B270][B29][B92].
- Eventos da própria instância: instância iniciada, fluxo publicado e fluxo publicado atualizado (só do fluxo que contém o nó); o antigo gatilho de ativação está obsoleto [B258][B263].

**Inferência**
- Com agendador durável, a semântica "no máximo uma vez" por execução agendada depende do lease e do reaper (por quê: a doc descreve reivindicação exclusiva com liberação por expiração).

**Desconhecido**
- Intervalo mínimo permitido; o que acontece quando o mesmo fluxo tem várias regras que coincidem no mesmo instante.

### 5.2 Webhook

**Observação**
- Gatilho de webhook: métodos DELETE, GET, HEAD, PATCH, POST, PUT; caminho aleatório por padrão ou personalizado com parâmetros de rota; autenticação nenhuma, básica, por cabeçalho, JWT ou "usuário da instância" (OAuth2 com token bearer; navegador sem token é redirecionado ao login; outros recebem 401; opção de exigir permissão de execução, senão 403; cliente OAuth2 auto-detectar, só bearer ou navegador); modos de resposta imediato (código e mensagem fixa), ao terminar o último nó (todas as entradas, primeiro item JSON, primeiro binário, sem corpo), via nó de resposta, ou streaming; código de resposta personalizável; opções: origens permitidas (CORS, padrão qualquer), propriedade binária (POST, PATCH, PUT), ignorar bots, lista de IPs permitidos (demais recebem 403), sem corpo de resposta, corpo bruto, tipo de conteúdo e cabeçalhos de resposta, nome de propriedade a devolver, "somente se" (expressão sobre corpo, cabeçalhos, parâmetros e query; falso devolve 200 sem execução) [B238].
- URL de teste (registrada ao "escutar evento de teste" ou executar fluxo inativo; ativa por 120 segundos; dados aparecem no editor) versus URL de produção (registrada ao publicar; dados só na aba de execuções) [B238][B239].
- Caminhos padrão: produção `webhook`, teste `webhook-test`, espera `webhook-waiting`, saúde `healthz`, REST `rest`, API pública `api` (variáveis `N8N_ENDPOINT_*`, `N8N_PUBLIC_API_ENDPOINT`); URL pública com `N8N_WEBHOOK_URL` (substitui `WEBHOOK_URL`, obsoleta desde 2.35.0); atrás de proxy reverso, `N8N_PROXY_HOPS` e cabeçalhos X-Forwarded [B92][B117].
- Limites: corpo até 16 MiB (`N8N_PAYLOAD_SIZE_MAX`), arquivos de form-data até 200 MiB (`N8N_FORMDATA_FILE_SIZE_MAX`) [B238][B92].
- Conflito: dois fluxos não podem registrar o mesmo caminho com o mesmo método; a atualização via API devolve 409 em conflito de caminho; na importação de pacotes o segundo fluxo fica com publicação "failed" [B196][B27].
- Respostas HTML são isoladas em iframe desde 1.103.0 [B238][B252].
- Nó de resposta ao webhook: responde com todos os itens, arquivo binário, primeiro item, JSON, token JWT, nada, redirecionamento ou texto; streaming como opção; código e cabeçalhos; uma resposta por execução; nós duplicados são ignorados; sem webhook de origem é ignorado; fluxo que termina sem alcançá-lo devolve 200 com mensagem padrão; erro antes dele devolve 500; saída opcional com o objeto de resposta [B252].
- Credenciais de webhook: básica (usuário e senha), cabeçalho (nome e valor), JWT (chave por passphrase ou PEM) [B316].
- Registro de webhooks ativos fica na tabela `webhook_entity`, para todos os gatilhos e não só o nó de webhook [B160].
- Metadado `webhookId` por nó na API [B196].

**Inferência**
- O `webhookId` por nó é o que torna estável a URL aleatória entre versões (por quê: a URL "aleatória" precisa sobreviver a republicações e o nó guarda esse id).

**Desconhecido**
- Comportamento de "somente se" com corpo binário; limite de requisições por segundo por webhook.

### 5.3 Formulário, chat, e-mail, apps, MCP e outros

**Observação**
- Gatilho de formulário: caminho, título, descrição (HTML sanitizado), campos (texto, área de texto, número, e-mail, senha, data, lista com múltipla escolha, botões de opção, caixas de seleção com limites, arquivo, campo oculto preenchível por query, HTML personalizado sem script, style e input), obrigatórios; autenticação nenhuma, básica ou usuário da instância (401 sem login; dados do usuário na saída; exigir permissão de execução); responder ao enviar ou ao terminar; opções: atribuição, rótulo do botão, ignorar bots, fuso do fluxo no timestamp, CSS personalizado; URLs de teste e produção; parâmetros de query pré-preenchem campos só em produção [B253].
- Nó de página de formulário: páginas encadeadas e página final (tela de conclusão, redirecionamento, texto ou arquivo); campos definíveis por JSON; só um final por execução; ramos sequenciais [B254].
- Gatilho de chat: tornar público; hospedado ou embutido (widget chama a URL de chat); autenticação nenhuma, básica ou usuário da instância; respostas ao terminar, via nós de resposta ou streaming; origens CORS; placeholder, título, subtítulo, mensagens iniciais; carregar sessão anterior da memória; botão de nova conversa; disponibilização no hub de chat; cada mensagem é uma execução [B260]. Nó de chat envia mensagem e opcionalmente aguarda resposta (texto livre ou aprovação com botões, limite de tempo); não funciona em modo embutido nem em sub-fluxo [B276].
- Gatilho de e-mail IMAP: caixa, marcar como lida, baixar anexos, formato (bruto, resolvido, simples), regras de busca, reconexão forçada [B256]. Envio SMTP: de, para, cc, cco, assunto, texto e HTML, anexos, responder para, atribuição, ignorar SSL; "enviar e aguardar" com aprovação, texto livre ou formulário e limite de tempo; sem cabeçalhos de thread [B257].
- Gatilhos de apps: 91 páginas de gatilhos de apps no sitemap (contagem aproximada); exemplo WhatsApp: eventos de conta, templates, mensagens, número e segurança; a plataforma registra a URL do webhook no app da Meta ao publicar; a Meta permite um webhook por app, então alternar entre teste e produção sobrescreve [B2][B307].
- Outros gatilhos centrais: SSE (URL de eventos), arquivo local (adicionado, alterado, removido; desativado por padrão desde 2.0; só self-hosted), RSS (sondagem), servidor MCP (expõe ferramentas a clientes MCP; caminho, autenticação nenhuma, bearer ou cabeçalho; transportes SSE e HTTP streamable; em modo fila exige uma única réplica de webhook para `/mcp*`; proxy sem buffer), avaliação (dataset de tabela de dados ou planilha, um caso por vez, limite de linhas, filtro), sub-fluxo, erro [B268][B269][B270][B266][B264][B243][B244].
- Credenciais de usuário final funcionam com gatilho manual, hub de chat, servidor MCP, webhook, formulário e chat (estes três com autenticação de usuário) [B84].

**Inferência**
- O servidor MCP por fluxo e o servidor MCP da instância são mecanismos distintos: o primeiro expõe ferramentas de um fluxo, o segundo gerencia a instância (por quê: páginas e autenticações separadas) [B266][B225].

**Desconhecido**
- Limite de tamanho de arquivo em formulários; formato de transporte do streaming (SSE ou JSON por linha).

### 5.4 Ativação, desativação e múltiplos gatilhos

**Observação**
- Publicar registra webhooks e inicia agendas e escutas; a publicação é assíncrona, com diff de gatilhos, estados parcial e falha; despublicar remove tudo; ao iniciar a instância, fluxos são publicados em lotes (`N8N_WORKFLOW_ACTIVATION_BATCH_SIZE`, padrão 1) [B17][B105].
- Em multi-main, só o líder roda gatilhos não HTTP, pollers e conexões persistentes; webhooks rodam em qualquer principal ou processador [B135].
- Um fluxo precisa de ao menos um gatilho que exija publicação; várias regras de agenda e vários gatilhos convivem; a ordem de execução com múltiplos gatilhos não está documentada [B17][B240][B40].
- Hooks externos de ativação e desativação podem bloquear a operação lançando erro [B124].
- Fluxos com nós bloqueados por política não publicam nem executam [B165].
- Pull do git despublica e republica fluxos publicados, com segundos de indisponibilidade [B184].

**Desconhecido**
- Como dois gatilhos no mesmo fluxo compartilham dados estáticos e contexto.

## 6 a 12. Seções não concluídas

O agente foi interrompido pelo usuário em 28/10/2026 antes de escrever estas seções pela documentação. Elas ficam cobertas, por enquanto, pelas evidências dos pacotes publicados em `04-artefatos-rea.md`:

- Credenciais, projetos, papéis, variáveis, chaves de API, controle de versão: rotas internas com escopos de permissão [E4].
- API pública: especificação OpenAPI 3.0, versão 1.1.1 [E5].
- Catálogo de nós e credenciais: 438 nós, 392 credenciais, 110 arquivos de gatilho [E6].

**Desconhecido**: variáveis de ambiente de operação, CLI, métricas e backup do n8n não foram levantados.
