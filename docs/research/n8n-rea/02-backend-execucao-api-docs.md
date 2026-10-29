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

## 6. Credenciais

Fontes desta seção e das seções 7 a 12: documentação pública acessada em 2026-10-29 (ids B317 em diante, ver "Ledger de fontes") e leituras diretas dos pacotes [E4][E5][E6].

### 6.1 O que é, criação, campos e teste

**Observação**
- Credencial é um conjunto guardado de dados de autenticação que liga fluxos a serviços externos (APIs, bancos) [B317].
- Três caminhos para criar: botão de criar no menu lateral, botão de criar na visão geral ou dentro de um projeto, e lista de credenciais dentro do painel do nó. Em instância com projetos, a pessoa escolhe o espaço pessoal ou um projeto; a edição Community cria sempre no espaço pessoal [B317].
- Nome padrão segue o padrão "nome do nó + conta" e pode ser renomeado; a variável `CREDENTIALS_DEFAULT_NAME` define o padrão da instância [B317][B323].
- Os campos dependem do tipo de credencial; a biblioteca de credenciais traz instruções por serviço [B317]. A API pública expõe o esquema de campos por tipo em `GET /credentials/schema/{credentialTypeName}` [B336][E5].
- Teste de conexão: ao salvar, a plataforma testa a credencial [B317]. A API pública tem `POST /credentials/{credentialId}/test`, que responde `status` (OK ou Error) e `message` usando os dados guardados [E5]. A API interna também tem teste de credencial ainda não salva e uma "sondagem" (`probe`) de credencial salva [E4].
- Campo "domínios permitidos para requisição HTTP" em muitas credenciais de APIs web: todos, lista de domínios separada por vírgula, ou nenhum. Só restringe o uso no nó de requisição HTTP, não nos nós dedicados [B317].
- Campos de credencial aceitam expressões; o dado referenciado precisa existir antes do nó que usa a credencial [B317][B55].
- No Cloud existem credenciais gerenciadas para serviços de IA, pagas com créditos da plataforma em vez de chave própria [B317].
- Tipos de uso: credencial fixa (padrão; a mesma para qualquer pessoa que rode o fluxo) e credencial de usuário final (cada pessoa conecta a própria conta) [B317][B327].

**Inferência**
- O teste "ao salvar" e o teste por id na API sugerem que cada tipo de credencial declara uma requisição de teste própria (por quê: a credencial genérica simplificada pede uma URL de teste opcional e códigos aceitos como sucesso) [B321].

**Desconhecido**
- Se o teste ao salvar bloqueia o salvamento quando falha ou só avisa.

### 6.2 Criptografia em repouso e chaves

**Observação**
- Credenciais são cifradas antes de ir para o banco com a chave `N8N_ENCRYPTION_KEY`. Sem a variável, a plataforma gera uma chave aleatória no primeiro início e a guarda na pasta do usuário (`~/.n8n`, arquivo de configuração). Em modo fila, todos os workers precisam da mesma chave [B324][B358][B135].
- Rotação de chaves em dois níveis: a chave da instância nunca muda e protege chaves de dados; as chaves de dados cifram as credenciais e são as que giram. Rotação pela tela de chaves de criptografia ou por `POST /encryption/keys` (escopo global `encryptionKey:manage`; só o dono da instância). Novas gravações usam a chave ativa; registros antigos continuam legíveis e só são recifrados quando alterados. Ligada por padrão na 3.0; na 2.x depende de `N8N_ENV_FEAT_ENCRYPTION_KEY_ROTATION`; não existe no Cloud; dados no formato novo não são lidos por versões antigas [B325][E4].
- Exportação de credenciais nunca leva segredos nos pacotes e JSON de fluxo [B18][B26]. A CLI exporta credenciais e só grava em texto puro com a opção de decifrar [B353].
- A doc de JWE para tokens OAuth 2.0 existe como página de segurança (não lida) [B362].

**Inferência**
- Perder a chave da instância torna as credenciais irrecuperáveis (por quê: a página de backup diz que sem a chave original as credenciais restauradas não podem ser decifradas) [B355].

**Desconhecido**
- Algoritmo de criptografia (a documentação não nomeia); formato do valor cifrado no banco.

### 6.3 Compartilhamento por projeto e por usuário

**Observação**
- Quem compartilha: o criador e dono da credencial; admin de projeto para credenciais do projeto; dono e admin da instância veem e compartilham todas. Na aba de compartilhamento, só o dono ou quem tem permissão altera acessos [B319].
- Quem recebe ganha o papel "pode usar": roda e publica fluxos com a credencial, mas não vê nem edita os detalhes [B319].
- Destino do compartilhamento: um usuário ou um projeto inteiro; membros do projeto usam conforme o papel no projeto [B319].
- Credencial pessoal usada em fluxo de projeto de equipe aparece para os membros com rótulo "pode ver": veem no fluxo, mas não usam nem editam; só o dono e quem recebeu direto podem rodar ou publicar esse fluxo [B319][B331].
- Mover fluxo ou credencial entre projetos remove todos os compartilhamentos existentes; ao mover um fluxo é possível compartilhar as credenciais de que ele precisa [B331][B168]. Na API pública: `PUT /credentials/{credentialId}/transfer` com `destinationProjectId` [E5].
- Em fluxo compartilhado, quem edita usa todas as credenciais do fluxo, mesmo as não compartilhadas com ele; mas não edita nós que usam credencial não compartilhada [B347].
- Licença do compartilhamento de credenciais: todos os planos Cloud; self-hosted Business e Enterprise [B319].
- Política de segurança da instância pode proibir compartilhar a partir do espaço pessoal (`N8N_PERSONAL_SPACE_SHARING_ENABLED`) [B348][B350].
- A API interna tem rotas de compartilhar, transferir, desconectar token OAuth e listar credenciais disponíveis para um fluxo [E4].

**Inferência**
- "Usar sem ver" implica que a resolução dos segredos acontece só no servidor na hora da execução e que o editor recebe apenas id, nome e tipo (por quê: o papel "pode usar" não dá leitura dos detalhes).

### 6.4 OAuth1 e OAuth2

**Observação**
- OAuth1 genérico: URL de autorização, URL de token de acesso, chave e segredo do consumidor, URL de token de requisição, método de assinatura (HMAC-SHA1, HMAC-SHA256, HMAC-SHA512) [B321].
- OAuth2 genérico: tipo de concessão "código de autorização" (URL de autorização, URL de token, id e segredo do cliente, escopo opcional, parâmetros extras na URL de autorização, autenticação por cabeçalho básico ou no corpo, ignorar SSL), "credenciais do cliente" (sem URL de autorização) e PKCE (mesmos campos do código de autorização) [B321].
- Nos dois casos, o serviço externo deve receber como URL de retorno a "OAuth Redirect URL" mostrada pela plataforma no formulário da credencial [B321].
- A API interna tem rotas separadas de "obter URL de autorização" e "retorno" para OAuth1 e OAuth2, sob o prefixo REST [E4][B92].
- A URL de retorno depende da URL pública do editor (`N8N_EDITOR_BASE_URL`) [B358].
- Credenciais OAuth gerenciadas: o administrador pode preencher id e segredo do cliente globalmente (sobrescrita de credenciais) e o usuário só clica em "conectar"; os campos sobrescritos ficam ocultos; `N8N_MANAGED_OAUTH_SHOW_SCOPES` libera o campo de escopo para tipos gerenciados [B328][B323].
- Desconectar o token OAuth de uma credencial existe como rota interna [E4].
- Escopos: alguns tipos de credencial predefinida têm escopos fixos e a interface avisa quais partes da API cobrem [B322].

**Inferência**
- O fluxo é o padrão de mercado: a plataforma abre a URL de autorização em janela, o provedor redireciona para a rota de retorno com código e estado, e o servidor troca o código pelo token e guarda o token cifrado na credencial (por quê: existem as rotas de autorização e de retorno e o token pode ser "desconectado") [E4].
- A renovação do token de acesso com o token de atualização é automática na execução (por quê: não há página que peça reconexão periódica). Não confirmado pela documentação oficial.

**Desconhecido**
- Caminho exato completo da URL de retorno (a doc manda copiar do formulário); política de renovação do token (antes de expirar ou ao receber 401); comportamento quando a renovação falha.

### 6.5 Predefinidas x genéricas e uso em requisições HTTP

**Observação**
- Credencial predefinida: tipo próprio de um serviço suportado, usado pelo nó dedicado e reaproveitável no nó de requisição HTTP e no nó GraphQL para operações que o nó dedicado não oferece, sem configurar autenticação de novo [B320][B322].
- Credencial genérica (para serviços sem nó): básica (usuário e senha), digest (usuário e senha), cabeçalho (nome e valor), bearer (cabeçalho Authorization com token), query (um parâmetro nome e valor), personalizada em JSON (cabeçalhos, query e corpo combinados), personalizada simplificada (a partir de 2.35.0: modelo JSON com marcadores, campos secretos ou de texto, obrigatórios, URL de teste, códigos de status aceitos no teste, link de documentação; valores redigidos após salvar), OAuth1 e OAuth2 [B320][B321].
- Credencial de certificados SSL para o nó HTTP: CA, certificado, chave privada e senha opcional [B321].
- Nós "só de credencial": serviços para os quais existe só a credencial, usada pelo nó HTTP [B360].
- Credencial de webhook (básica, cabeçalho, JWT) protege gatilhos [B316].
- Importar cURL preenche o nó HTTP e pode trazer cabeçalhos de autenticação em texto [B320][B18].
- Proteção SSRF opcional (a partir de 2.12.0) bloqueia redes privadas, loopback, link-local e metadados de nuvem em nós controláveis pelo usuário, com listas de permissão por hostname e faixa de IP [B359].

**Inferência**
- Para o VEXOR, separar "tipo de credencial com esquema e teste" de "uso da credencial pelo nó HTTP genérico" cobre a maior parte dos casos de cobrança sem escrever um conector por serviço (por quê: o nó HTTP aceita qualquer credencial predefinida ou genérica) [B322].

### 6.6 Credenciais de usuário final, segredos externos, sobrescritas e políticas

**Observação**
- Credenciais de usuário final (preview, Enterprise): só tipos OAuth; o admin cria um modelo e cada pessoa conecta a própria conta; conexão privada e dados de execução isolados; funcionam com gatilho manual, hub de chat, gatilho de servidor MCP, webhook, formulário e chat (estes com autenticação de usuário da instância); quem não conectou é convidado a conectar antes de disparar [B327][B84].
- Segredos externos (Enterprise): provedores 1Password (Connect), AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, HashiCorp Vault e Infisical; segredos em texto puro; referência por expressão com nome do cofre e do segredo; resolvem só em campos de credencial; cofre global ou por projeto (2.11.0); vários cofres por provedor (2.10.0); admin e editor de projeto podem usar cofres do projeto quando habilitado (2.13.0) [B326][B329].
- Sobrescrita de credenciais (self-hosted): `CREDENTIALS_OVERWRITE_DATA` (JSON por tipo; desaconselhado), `CREDENTIALS_OVERWRITE_ENDPOINT` com token opcional (`CREDENTIALS_OVERWRITE_ENDPOINT_AUTH_TOKEN`; sem token só aceita uma chamada), `CREDENTIALS_OVERWRITE_PERSISTENCE` (guarda cifrado no banco e propaga para workers); vale também para tipos filhos [B328][B323].
- Políticas de tipos de credencial e de tipos de nó (preview): regras por instância e por projeto, com ação padrão, versão e anexos por escopo [E5][B165].
- Resolvedores de credencial dinâmica existem na API interna (Enterprise) e o fluxo tem `credentialResolverId` só leitura [E4][B196].

**Desconhecido**
- Intervalo de atualização dos valores de segredos externos; cache de segredos em workers.

## 7. Variáveis, dados estáticos, dados binários, ambientes e git

### 7.1 Variáveis personalizadas

**Observação**
- Pares chave e valor reaproveitáveis em fluxos. Licença: Cloud Pro e Enterprise; self-hosted Business e Enterprise [B337].
- Só dono e admin da instância criam variáveis globais. Escopo global (toda a instância) ou de projeto (a partir de 1.118.0); variável de projeto com a mesma chave sobrepõe a global dentro do projeto [B337]. Papéis personalizados de projeto têm escopos de variável de projeto (ler, editar, criar, excluir) [B333].
- Chave até 50 caracteres; valor até 1000; só letras, números e sublinhado; todos os valores são texto [B337].
- Uso por expressão ou no nó de código através do objeto de variáveis; variável sem valor vira indefinida sem falhar o fluxo; fluxos não alteram variáveis (só pela interface ou API) [B337][B57].
- Na API: `GET /variables` (paginado; filtros `projectId` e `state=empty`), `POST /variables`, `PUT /variables/{id}`, `DELETE /variables/{id}`; campos `id`, `key`, `value`, `type`, `project` [E5].
- Valores de variáveis e credenciais não passam pelo git; vão só "stubs" (esqueletos) [B344][B343].

**Desconhecido**
- Valores aceitos em `type` além de texto; se existe limite de quantidade (a importação de pacotes cita uma cota de variáveis da instância) [E5].

### 7.2 Dados estáticos do fluxo

**Observação**
- Objeto persistente por fluxo, lido e gravado só no nó de código JavaScript, com escopo global (todos os nós) ou por nó; descrito como experimental [B338][B196].
- Gravado só quando a execução termina com sucesso e o conteúdo mudou; indisponível em execuções de teste; exige fluxo publicado e disparo por gatilho ou webhook; pode falhar com execuções muito frequentes; deve ser pequeno [B338].
- A doc recomenda tabelas de dados como alternativa (funcionam em teste, sem código) [B338][B340].
- `staticData` é campo do objeto de fluxo na API e não vai nos pacotes portáveis [B196][B25].

**Inferência**
- Como só grava em sucesso, duas execuções simultâneas podem sobrescrever o estado uma da outra (por quê: a doc avisa de comportamento instável com alta frequência).

### 7.3 Tabelas de dados

**Observação**
- Armazenamento tabular interno por projeto; uso pelo nó dedicado, pela API e pela aba da interface; criação manual ou por CSV; renomear, reordenar, excluir tabelas e colunas; editar linhas; exportar CSV; favoritar [B340].
- Limite padrão de 200 MiB somando todas as tabelas da instância (`N8N_DATA_TABLES_MAX_SIZE_BYTES`); aviso a 80%; no limite, inserções e atualizações dos fluxos falham [B340].
- Acesso por projeto; admin e dono veem todas; não há leitura direta em expressões nem no nó de código [B340].
- Escopos de papel personalizado: ver tabela, ver linhas, editar tabela, editar linhas, criar, excluir [B333].
- API: tabelas (listar com filtro e ordenação, criar com colunas ou a partir de arquivo, ler, renomear, excluir), colunas (listar, adicionar, renomear ou reordenar, excluir) e linhas (listar com filtro, ordenação e busca; inserir; upsert com simulação; atualizar por filtro; excluir por filtro; limpar) [E5].
- No git só o esquema sincroniza, nunca as linhas [B343].

### 7.4 Dados binários

**Observação**
- Modos: `default` (memória; arquivos grandes podem derrubar o processo), `filesystem`, `database`, `s3` e `azure`. Variáveis: `N8N_DEFAULT_BINARY_DATA_MODE` (padrão `default`), `N8N_AVAILABLE_BINARY_DATA_MODES`, `N8N_BINARY_DATA_STORAGE_PATH` (padrão pasta do usuário/binaryData), `N8N_BINARY_DATA_DATABASE_MAX_FILE_SIZE` (512 MiB, teto 1024) [B341][B339].
- Modo fila não aceita `filesystem`; usar `database`, `s3` ou `azure`. O armazenamento binário também guarda respostas de webhook grandes demais para a fila [B339][B135].
- Poda de binários acompanha a poda de execuções e só no modo ativo; dados de um modo antigo ficam órfãos [B339][B137].
- Armazenamento externo S3 e Azure exige licença Business ou Enterprise [B139].

**Desconhecido**
- Se o modo `database` grava binários em tabela própria ou junto da execução; limites de arquivo nos modos s3 e azure.

### 7.5 Ambientes e controle de versão por git

**Observação**
- Licença Business e Enterprise. Dono e admin configuram; dono e admin fazem push e pull; admin de projeto só faz push [B342][B343].
- Ambiente é uma instância mais um ramo git; padrão comum de desenvolvimento e produção; um ramo e várias instâncias (push numa, pull na outra) ou vários ramos com pull request no provedor git [B344].
- Push: escolher fluxos e tabelas, mensagem de commit; envia a versão salva e não a publicada; tags, stubs de variáveis e de credenciais vão automaticamente; projetos e pastas também [B343].
- Pull: avisa antes de sobrescrever; associa fluxos e credenciais a usuários e projetos correspondentes (cria projeto ausente; quem puxa vira dono se o usuário não existir); publicação automática desligada, "se já publicado" ou ligada; arquivados nunca são publicados; fluxo publicado é despublicado e republicado com segundos de indisponibilidade [B343][B184].
- Conflitos: fluxos não têm detecção de conflito (git é a fonte da verdade e sobrescreve); credenciais e variáveis existentes em geral não são atualizadas no pull; tags renomeadas podem quebrar unicidade; itens apagados no git só são removidos localmente se a pessoa confirmar; tabelas só esquema, e tabela local ausente no git é apagada no pull [B343].
- Versões de fluxo vindas do pull ficam no histórico do banco, não no git [B19].
- API: `GET /source-control/status` (prévia em direção push ou pull), `POST /source-control/push` (mensagem, arquivos, forçar), `POST /source-control/pull` (forçar, publicação automática), com lista de arquivos, estado, conflito e erro de publicação por item [E5].
- Promoções (API pública): provedores de repositório, conexões entre instâncias, aplicação e promoção de configurações e de projetos, listagem de mudanças por direção [E5].

**Inferência**
- "Promoções" parecem a evolução do push e pull manual para um pipeline entre instâncias (por quê: os recursos de conexão, promover e aplicar existem na API mas não têm página de produto lida) [E5].

**Desconhecido**
- Licença e estabilidade das promoções; formato dos arquivos no repositório git.

## 8. Organização e acesso

### 8.1 Usuários e papéis da instância

**Observação**
- Papéis globais embutidos: dono (tudo, inclusive console do Cloud), admin (quase tudo do dono, sem console; vê e compartilha todos os fluxos, vê e edita todas as credenciais, configura git, cria e vê projetos, adiciona e remove usuários), membro (próprios fluxos, cria e usa tags, gerencia o próprio e-mail e senha) e usuário de chat (só chat e fluxos e agentes compartilhados; sem criar fluxos, credenciais, projetos ou chaves de API) [B330].
- Admin e usuário de chat: Cloud Pro e Enterprise, self-hosted Enterprise [B330].
- Virar usuário de chat remove a pessoa dos projetos compartilhados, deixa o projeto pessoal só leitura e apaga as chaves de API; é bloqueado se ela for a única admin de um projeto [B330].
- A doc recomenda que o dono use uma conta de membro no dia a dia, porque a plataforma não mostra quem criou cada fluxo [B330].
- Usuários: lista com convites pendentes, reenviar convite, excluir com opção de transferir fluxos e credenciais para outra pessoa ou apagar [B346]. E-mail de convite exige SMTP; `N8N_INVITE_LINKS_EMAIL_ONLY` impede expor o link pela API [B351].
- Papéis globais personalizados (Enterprise) cobrem gestão de usuários, tags, chaves de API e papéis [B332].
- Na API: `GET /users` (paginado, `includeRole`, `projectId`), `POST /users` (lote de e-mail e papel; retorna usuário ou erro por linha), `GET /users/{id}` (aceita id ou e-mail), `DELETE /users/{id}` (com `transferId`), `PATCH /users/{id}/role` (`newRoleName`) [E5]. Valores de papel global na API: `global:owner`, `global:admin`, `global:member` [E5].

### 8.2 Projetos e papéis de projeto

**Observação**
- Projetos agrupam fluxos e credenciais; cada pessoa tem um papel por projeto [B331]. Tipos na API: `personal` e `team` [E5].
- Dono e admin da instância criam projetos; admin do projeto adiciona e remove membros; excluir projeto exige transferir conteúdo para outro projeto ou apagar; projetos podem ser favoritados [B331].
- Licença do RBAC por projetos: Cloud (todos os planos), self-hosted Registered Community, Business e Enterprise; a quantidade de projetos e papéis varia por plano [B331].
- Papéis de projeto: admin (sem requisito citado), editor (Cloud Pro e self-hosted Enterprise) e visualizador (Cloud Enterprise e self-hosted Enterprise) [B329].
- Matriz: os três veem fluxos, credenciais e execuções; admin e editor editam, criam e executam; só admin gerencia membros e altera o projeto; admin e editor usam segredos externos quando habilitado; só admin gerencia cofres do projeto [B329].
- Variáveis e tags não seguem o RBAC de projeto; são globais (a variável de projeto é um recurso à parte) [B329][B337].
- Escopos selecionáveis em papel de projeto personalizado (a partir de 1.122.0, Enterprise): fluxo (`read`, `execute`, `update`, `create`, `publish` que inclui `unpublish`, `move`, `delete`, ligar e desligar redação), credencial (`read`, `update`, `create`, `share`, `unshare`, `move`, `delete`), projeto (`read`, `update`, `delete`), pasta (`read`, `update`, `create`, `move`, `delete`), execução (`reveal`), cofres de segredos (ler, criar, atualizar, excluir, sincronizar), segredos (listar), tabela (ler, ler linhas, atualizar, gravar linhas, criar, excluir), variável de projeto (ler, atualizar, criar, excluir), git (`push`). Escopo de leitura inclui o de listagem [B333].
- Regras dos papéis personalizados: só dono e admin criam; admin de projeto atribui; editar um papel muda todos os usuários que o têm; não dá para excluir papel em uso [B333]. A API exige `reassignRoleSlug` para excluir papel e mostra contagem de uso [E5].
- API de projetos: listar, criar (nome, ícone, descrição, tags de telemetria; retorna papel e escopos de quem criou), atualizar, excluir, listar membros, adicionar membros em lote (`relations`), mudar papel do membro, remover membro [E5].
- Mapeamento de papéis por provedor de identidade: regras ordenáveis na API [E5].

**Inferência**
- O modelo é "escopo recurso:ação" avaliado no projeto, com papéis como conjuntos nomeados de escopos (por quê: a API de papéis grava `scopes` e as rotas internas exigem escopos de projeto) [E4][E5].

### 8.3 Compartilhamento de fluxos e políticas

**Observação**
- Licença: Cloud (todos), self-hosted Business e Enterprise. No espaço pessoal, compartilha-se com usuários; em projeto de equipe não há compartilhamento individual, entra-se no projeto [B347].
- Papéis do fluxo: criador e editor. Editor vê fluxo e execuções, atualiza (inclusive tags), executa e exporta; não compartilha nem exclui [B347].
- Políticas de segurança da instância (Business e Enterprise; redação Enterprise): exigir MFA para login por senha, permitir ou não compartilhar e publicar a partir do espaço pessoal, piso de redação de execuções, revisões de fluxo; podem ser fixadas por variáveis (`N8N_SECURITY_POLICY_MANAGED_BY_ENV`, a partir de 2.18.0) [B348][B350]. API: `GET` e `PUT /settings/security-policy` com contadores de fluxos publicados e compartilhados e credenciais compartilhadas no espaço pessoal [E5].

### 8.4 Auditoria

**Observação**
- Auditoria de segurança por CLI, por `POST /audit` ou por nó interno; cinco relatórios: credenciais (não usadas ou sem uso em fluxos ativos recentes), banco (nós SQL com expressões em consultas), sistema de arquivos (nós que acessam arquivos), nós (nós oficiais que rodam código no host, nós da comunidade e personalizados) e instância (webhooks sem proteção, ajustes de segurança faltando, versão desatualizada) [B345].
- Fluxo considerado abandonado após `N8N_SECURITY_AUDIT_DAYS_ABANDONED_WORKFLOW` dias sem execução (padrão 90) [B350]. A API aceita `additionalOptions` com categorias (credentials, database, nodes, filesystem, instance) [E5].
- Trilha de eventos para sistemas externos é o log streaming (Enterprise): destinos webhook, syslog e Sentry; API para listar tipos de evento, CRUD de destinos e mensagem de teste [B189][E5].
- Revelar execução redigida gera evento de auditoria [B148].

**Desconhecido**
- Se existe um registro de auditoria consultável dentro do produto (além do log streaming).

### 8.5 SSO, LDAP e MFA (só registro)

**Observação**
- Há páginas de SAML (com guias para Okta e Azure AD), OIDC, LDAP e exigência de dois fatores [B362]. A API pública tem configuração de SAML, OIDC e LDAP, mais histórico e disparo de sincronização LDAP [E5]. MFA ligado por padrão (`N8N_MFA_ENABLED`); CLI desliga MFA de um usuário e reseta LDAP [B351][B353].
- Sessão por JWT com duração padrão de 168 horas e renovação automática perto do fim (`N8N_USER_MANAGEMENT_JWT_DURATION_HOURS`, `N8N_USER_MANAGEMENT_JWT_REFRESH_TIMEOUT_HOURS`) [B351].

### 8.6 Chaves de API

**Observação**
- Criadas em Configurações, com rótulo e expiração; escopos só no Enterprise (fora dele a chave tem acesso total) [B334].
- Grupos de escopo: pacotes da comunidade, credenciais, tabelas, colunas, linhas, execuções, tags de execução, pastas, insights, projetos, auditoria de segurança, controle de versão, tags, usuários, variáveis, fluxos e tags de fluxo. Escopos de chave são separados dos escopos de papel de projeto [B334].
- A API interna tem criar, listar, atualizar, excluir, girar chave e listar escopos disponíveis [E4]. Cada operação da OpenAPI declara o escopo exigido (`x-required-scope`, 170 ocorrências) [E5].
- Usuário de chat perde as chaves ao mudar de papel [B330].
- API indisponível no período de teste do Cloud [B334][B336].

**Desconhecido**
- Prazos de expiração oferecidos; se a chave herda as permissões do papel do dono quando não há escopos.

## 9. API pública

### 9.1 Autenticação, versão, paginação e idempotência

**Observação**
- Base `/api/v1` (caminho configurável por `N8N_PUBLIC_API_ENDPOINT`, padrão `api`); OpenAPI 3.0, versão do contrato 1.1.1 [E5][B358].
- Autenticação por cabeçalho `X-N8N-API-KEY`. A especificação também declara bearer JWT e cookie de sessão como alternativas [B334][E5].
- Desligar a API e o playground: `N8N_PUBLIC_API_DISABLED` e `N8N_PUBLIC_API_SWAGGERUI_DISABLED` (ambos falsos por padrão); playground só self-hosted [B357][B358][B336].
- Paginação por cursor: `limit` padrão 100, máximo 250; resposta com `data` e `nextCursor`; o próximo pedido envia `cursor` [B335][E5]. Exceção: pastas usam `skip` e `take` [E5].
- Idempotência: cabeçalho `Idempotency-Key` opcional nos POST, de 1 a 128 caracteres ASCII visíveis; mesma chave e mesmo pedido devolvem a primeira resposta de sucesso; pedido diferente com a mesma chave dá 422; repetição enquanto o primeiro ainda roda dá 409 [E5][B336].
- Descoberta: `GET /discover` devolve o mapa de recursos e operações liberados para a chave, com opção de incluir esquemas [E5].
- Códigos comuns: 400, 401, 403, 404, 409, 415, 422 [E5].
- Também existe um nó interno que chama a própria API e uma CLI cliente que envolve a API [B336].

**Desconhecido**
- Política de versionamento (quando vira v2) e limites de taxa; nenhuma página consultada os cita.

### 9.2 Fluxos

| Método | Caminho | Parâmetros principais | Resposta (campos principais) |
| --- | --- | --- | --- |
| GET | /workflows | limit, cursor, active, tags, name, projectId, excludePinnedData, includeParentFolder | página de fluxos (id, name, active, activeVersionId, isArchived, versionId, nodes, connections, settings, tags, shared, parentFolder) |
| POST | /workflows | corpo: name, nodes, connections, settings, projectId, parentFolderId | fluxo criado |
| GET | /workflows/{id} | excludePinnedData | fluxo completo com activeVersion |
| PUT | /workflows/{id} | publishIfActive; corpo do fluxo | fluxo; 409 em conflito |
| DELETE | /workflows/{id} | | fluxo excluído |
| POST | /workflows/{id}/archive e /unarchive | | fluxo |
| PUT | /workflows/{id}/transfer | destinationProjectId | 204 |
| POST | /workflows/{id}/publish | versionId, name, description | fluxo publicado |
| POST | /workflows/{id}/unpublish | | fluxo |
| POST | /workflows/{id}/activate e /deactivate | obsoletos | fluxo |
| GET | /workflows/{id}/history | limit, cursor | versões (versionId, authors, name, description, datas) |
| GET | /workflows/{id}/versions/{versionId} | | versão com nodes e connections |
| GET, PUT | /workflows/{id}/tags | lista de ids | tags |

Fonte: [E5][B196]. Escopos `workflow:list`, `read`, `create`, `update`, `delete`, `move`, `activate`, `deactivate`, `workflowTags:*` [E5].

### 9.3 Execuções

| Método | Caminho | Parâmetros principais | Resposta (campos principais) |
| --- | --- | --- | --- |
| GET | /executions | limit, cursor, includeData, ignoreDataSizeLimit, redactExecutionData, status, workflowId, projectId, startedAfter, startedBefore | página (id, finished, mode, retryOf, retrySuccessId, status, startedAt, stoppedAt, workflowId, waitTill, storedAt, customData) |
| GET | /executions/{id} | includeData, ignoreDataSizeLimit, redactExecutionData | execução com data, jsonSizeBytes, binaryDataSizeBytes, workflowVersionId, tracingContext |
| DELETE | /executions/{id} | | execução excluída |
| GET, PUT | /executions/{id}/tags | lista de ids | tags |
| POST | /executions/{id}/stop | | mode, status, datas |
| POST | /executions/stop | status, workflowId, startedAfter, startedBefore | stopped (contagem) |
| POST | /executions/{id}/retry | loadWorkflow | nova execução com retryOf e annotation |

Fonte: [E5][B197].

### 9.4 Credenciais

| Método | Caminho | Parâmetros principais | Resposta (campos principais) |
| --- | --- | --- | --- |
| GET | /credentials | limit, cursor | página (id, name, type, datas, shared), sem segredos; só dono e admin |
| POST | /credentials | name, type, data, projectId, description | id, name, type, isManaged, isGlobal, isResolvable |
| GET | /credentials/{id} | | metadados, sem segredos |
| PATCH | /credentials/{id} | name, data, isGlobal, isPartialData | metadados |
| DELETE | /credentials/{id} | | metadados e usageScope |
| PUT | /credentials/{id}/transfer | destinationProjectId | 204 |
| POST | /credentials/{id}/test | | status (OK ou Error), message |
| GET | /credentials/schema/{tipo} | | esquema JSON dos campos do tipo |

Fonte: [E5].

**Inferência**: `isPartialData` na atualização permite trocar só alguns campos sem reenviar todos os segredos (por quê: nome do campo; descrição não lida).

### 9.5 Tags, usuários, projetos, variáveis e pastas

| Recurso | Operações | Parâmetros e campos principais |
| --- | --- | --- |
| Tags | GET lista, POST, GET um, PUT, DELETE em /tags e /tags/{id} | limit, cursor; id, name, datas |
| Usuários | GET lista, POST lote, GET por id ou e-mail, DELETE, PATCH papel | includeRole, projectId, transferId, newRoleName; id, email, firstName, lastName, isPending, mfaEnabled, role |
| Projetos | GET lista, POST, PUT, DELETE em /projects; membros em /projects/{id}/users (GET, POST, PATCH papel, DELETE) | id, name, type, icon, description, creatorId; relations, role |
| Variáveis | GET lista, POST, PUT, DELETE em /variables | projectId, state; id, key, value, type, project |
| Pastas | GET lista, POST, GET detalhe, PATCH, DELETE em /projects/{id}/folders | filter, select, sortBy, skip, take, transferToFolderId; id, name, parentFolderId, totalSubFolders, totalWorkflows |
| Papéis | GET lista, POST, GET, PUT, DELETE em /roles | withUsageCount, reassignRoleSlug; slug, displayName, roleType, scopes, systemRole |

Fonte: [E5][B205].

### 9.6 Auditoria, controle de versão, tabelas de dados e outros

| Recurso | Operações | Parâmetros e campos principais |
| --- | --- | --- |
| Auditoria | POST /audit | additionalOptions (categorias, dias de abandono); relatório por categoria |
| Controle de versão | GET /source-control/status, POST push, POST pull | direction; commitMessage, fileNames, force; autoPublish; arquivos com status, conflict, publishingError |
| Tabelas de dados | CRUD em /data-tables; colunas em /columns; linhas em /rows, /rows/upsert, /rows/update, /rows/delete, /rows/clear | filter, sortBy, search, returnData, dryRun; id, name, columns, projectId, sizeBytes; deletedCount |
| Insights | GET /insights/summary | startDate, endDate, projectId; total, failed, failureRate, timeSaved, averageRunTime |
| Pacotes portáveis (beta) | POST /n8n-packages/export, /import, /import-selection | políticas de dependência, versão, credencial, conflito, publicação, ids |
| Avaliações | GET e POST /workflows/{id}/test-runs, detalhe, casos, cancelar | status, metrics, testCaseCount |
| Log streaming | tipos de evento, CRUD de destinos, teste | destino como objeto |
| Configurações | /settings/ldap (e sync), /settings/sso/saml, /settings/sso/oidc, /settings/otel (e teste), /settings/security-policy | campos de configuração de cada recurso |
| Pacotes da comunidade | GET, POST instalar, PATCH atualizar, DELETE | name, version; installedNodes, updateAvailable |
| Políticas de tipos (preview) | /credential-type-policies e /node-type-policies por instância, projeto, política e anexos | rules, defaultAction, version |
| Promoções | provedores, conexões, projetos, aplicar e promover | direction |

Fonte: [E5][B345][B343][B340].

**Inferência**
- Para o VEXOR, o núcleo mínimo de paridade é fluxos, execuções, credenciais (sem segredos na leitura), tags, projetos e variáveis, com cursor e `Idempotency-Key` desde o início (por quê: são os recursos que a doc da API e os escopos de chave tratam como base) [B334][E5].

## 10. Operação

### 10.1 Variáveis de ambiente por categoria

**Observação**
- Convenção: quase toda variável aceita o sufixo `_FILE` para ler o valor de um arquivo [B349][B341][B351].
- Implantação: `N8N_HOST` (localhost), `N8N_PORT` (5678), `N8N_PROTOCOL` (http), `N8N_EDITOR_BASE_URL`, `N8N_USER_FOLDER`, `N8N_PATH` (/), `N8N_LISTEN_ADDRESS` (::), `N8N_ENCRYPTION_KEY`, `N8N_PROXY_HOPS` (0), `N8N_SSL_KEY` e `N8N_SSL_CERT`, `N8N_DIAGNOSTICS_ENABLED` (true), `N8N_TEMPLATES_ENABLED` e `N8N_TEMPLATES_HOST` [B358].
- Banco: `DB_TYPE` (sqlite padrão ou postgresdb), `DB_TABLE_PREFIX`, `DB_POSTGRESDB_DATABASE` (n8n), `HOST`, `PORT` (5432), `USER`, `PASSWORD`, `SCHEMA` (public), `POOL_SIZE` (2), opções SSL; SQLite com `DB_SQLITE_POOL_SIZE` (0 usa journal de rollback; acima de 0 liga WAL) e `DB_SQLITE_VACUUM_ON_STARTUP` [B349].
- Execuções e retenção: salvar em erro, sucesso, progresso e manuais; poda por idade (336 h) e por quantidade (10000); tempo limite; concorrência; armazenamento de dados de execução (ver 2.5 e 2.6) [B91][B137][B136].
- Webhooks e endpoints: caminhos `rest`, `webhook`, `webhook-test`, `webhook-waiting`, `healthz`; `N8N_WEBHOOK_URL`; `N8N_PAYLOAD_SIZE_MAX` (16 MiB); `N8N_FORMDATA_FILE_SIZE_MAX` (200 MiB); `N8N_DISABLE_PRODUCTION_MAIN_PROCESS` [B356][B92].
- Segurança: `N8N_BLOCK_ENV_ACCESS_IN_NODE`, `N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES` (true), `N8N_RESTRICT_FILE_ACCESS_TO`, `N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS`, nó de git sem repositórios nus e sem hooks, `N8N_SECURE_COOKIE` (true), `N8N_SAMESITE_COOKIE` (lax), política de CSP, origens de postMessage do editor embutido, dias de abandono da auditoria, políticas por variável (MFA, publicar e compartilhar no espaço pessoal) [B350]; SSRF (`N8N_SSRF_PROTECTION_ENABLED` e listas) [B359]; API pública desligável [B357].
- E-mail: `N8N_EMAIL_MODE` (smtp), `N8N_SMTP_HOST`, `PORT`, `USER`, `PASS`, `SENDER`, `SSL` (true), `STARTTLS` (true), OAuth de conta de serviço; modelos HTML de convite, redefinição de senha e avisos de compartilhamento de fluxo, credencial e projeto [B351].
- Usuários e sessão: segredo e duração do JWT, MFA, links de convite só por e-mail, dono da instância gerenciado por variáveis (e-mail, nome, hash bcrypt da senha) [B351].
- Logs: `N8N_LOG_LEVEL` (info; warn, error, debug), `N8N_LOG_OUTPUT` (console ou file), `N8N_LOG_FORMAT` (text ou json), tamanho (16 MB) e quantidade (100) de arquivos, local do arquivo, log de banco e de consultas lentas (1000 ms), saída do nó de código para stdout, `N8N_LOG_STREAMING_DESTINATIONS` [B352].
- Fila: `EXECUTIONS_MODE=queue`, variáveis de Redis, saúde e travas de worker, multi-main (ver 2.7) [B95][B135].
- Binários: ver 7.4 [B341].
- Credenciais: sobrescritas e nome padrão (ver 6.6) [B323].
- Há ainda páginas de variáveis para assistente de IA, motor de expressões, armazenamento externo, hooks externos, insights, licença, nós, OpenTelemetry, agendador, git, SSO, task runners, fuso e localização, fluxos e histórico de fluxos [B362].

### 10.2 CLI

**Observação**
- Comandos de fluxo: executar por id, publicar (rascunho atual ou versão), despublicar um ou todos; o antigo comando de atualizar estado ativo está obsoleto [B353].
- Exportar e importar: fluxos (com backup, versão, só publicados), credenciais (com opção de decifrar), entidades completas do banco (por exemplo para migrar de SQLite para Postgres; importação exige banco vazio ou truncar) [B353].
- Administração: auditoria, resetar gestão de usuários, desligar MFA de um usuário, resetar LDAP, informações e limpeza de licença, desinstalar nó ou credencial da comunidade [B353].
- Processos: principal, worker e processador de webhook são subcomandos (ver 2.7) [B135].
- Na 3.0, a exportação e importação de fluxos e credenciais pela CLI do servidor têm descontinuação prevista; existe uma CLI cliente separada sobre a API pública [B9][B18][B336].

### 10.3 Saúde e métricas

**Observação**
- `/healthz` responde 200 se a instância está no ar (não checa banco); `/healthz/readiness` responde 200 só com banco conectado e migrado; `/metrics` no formato Prometheus só self-hosted e desligado por padrão (`N8N_METRICS`) [B354][B356].
- Prefixo `n8n_`; métricas padrão do processo ligadas; opcionais: cache, barramento de eventos, rótulos de fluxo, tipo de nó e tipo de credencial, endpoints da API com caminho, método e código, fila (intervalo 20 s), agendador (20 s), gatilhos de polling, tarefas de sistema, SSRF, cache de DNS [B356].
- Worker em fila expõe saúde só com `QUEUE_HEALTH_CHECK_ACTIVE` [B354][B95].
- Outras fontes de observabilidade: insights (API de resumo), log streaming, OpenTelemetry com configuração pela API [B188][B189][B157][E5].

### 10.4 Backup e restauração

**Observação**
- O que guardar: a pasta do usuário (arquivo de configuração com a chave, banco SQLite, binários e dados de execução em modo filesystem), o banco Postgres com as ferramentas dele, armazenamento externo (S3, Azure), diretórios de nós personalizados e a chave de criptografia [B355].
- Métodos: exportação pela CLI (um JSON por fluxo e por credencial; não inclui usuários, execuções, variáveis nem ajustes), cópia completa com a instância parada, volume do contêiner [B355].
- Restauração: completar o cadastro do dono e importar, ou restaurar pasta, banco e configuração antes de iniciar. Importação sobrescreve itens com o mesmo id; fluxos importados chegam despublicados por padrão; exportação decifrada é texto puro e deve ser apagada; fazer backup antes de atualizar [B355].

## 11. Catálogo de nós e integrações para cobrança no Brasil

### 11.1 Catálogo em alto nível

**Observação**
- O pacote base declara 438 nós e 392 tipos de credencial; 110 arquivos de gatilho [E6]. A doc organiza a biblioteca em nós centrais, ações de apps e gatilhos; há nós da comunidade instaláveis, registro de servidores MCP, nós só de credencial e o nó HTTP para o resto [B360]. Nós de IA ficam em pacote separado (nós raiz e sub-nós) [E1][B2].
- Grupos observados na lista do pacote, descritos pela função: lógica e fluxo (condição, roteamento, junção, filtro, lotes, espera, sub-fluxo, parar com erro, sem operação), dados (editar campos, agregar, resumir, ordenar, limitar, remover duplicatas, separar lista, renomear chaves, data e hora, criptografia, XML, HTML, Markdown, compressão, arquivos), código, HTTP e GraphQL, webhook e resposta, formulário, agendamento, e-mail (IMAP e SMTP), bancos SQL e NoSQL, filas de mensagens (AMQP, Kafka, MQTT, RabbitMQ, Redis), armazenamento de arquivos (S3, FTP, nuvens), e centenas de apps SaaS [E6].

### 11.2 Integrações relevantes para um CRM de cobrança no Brasil

| Necessidade | O que o catálogo tem (por função) | Fonte |
| --- | --- | --- |
| WhatsApp | Nó da API de nuvem oficial do WhatsApp Business (enviar, enviar e aguardar resposta, enviar modelo; mídia: enviar, baixar, excluir) e gatilho de eventos da conta; operações faltantes pelo nó HTTP com a mesma credencial. Não há conector de WhatsApp não oficial | [B361][B307][E6] |
| E-mail | Envio SMTP com enviar e aguardar; leitura IMAP como gatilho; Gmail, Outlook, SendGrid, Mailgun, Brevo, Amazon SES, Mailchimp | [B257][B256][E6] |
| SMS e voz | Twilio, Vonage, Plivo, MessageBird, Msg91, Sms77, Mocean | [E6] |
| Mensageria | Telegram, Slack, Teams, Discord, Google Chat, Mattermost, Line | [E6] |
| Planilhas | Google Sheets (nó e gatilho), Excel 365, Airtable, Baserow, NocoDB, SeaTable, Grist, leitura e escrita de planilhas em arquivo | [E6] |
| HTTP | Nó de requisição HTTP com credenciais predefinidas e genéricas, paginação, lotes e cURL | [B320][B321] |
| SQL | Postgres (nó e gatilho), MySQL, SQL Server, Oracle, Snowflake, BigQuery, TimescaleDB, Supabase, MongoDB, Redis | [E6] |
| CRMs | HubSpot, Pipedrive, Salesforce, Zoho, ActiveCampaign, Copper, Keap, HighLevel, Dynamics, Freshworks, Odoo, Monday, Agile CRM, Salesmate | [E6] |
| Pagamentos e ERP | Stripe, PayPal, Chargebee, Paddle, QuickBooks, Xero, Wise, Invoice Ninja, ERPNext | [E6] |
| Agenda | Google Calendar (nó e gatilho), Cal e Calendly (gatilhos), Acuity (gatilho), iCalendar | [E6] |
| Formulários | Formulário nativo e páginas de formulário; gatilhos de Typeform, JotForm, Formstack, Wufoo, Form.io, SurveyMonkey; Google Forms não aparece como nó | [B253][B254][E6] |
| IA | Nó de OpenAI, Mistral, Perplexity e transformação por IA no pacote base; agentes e modelos (inclusive Gemini) no pacote de IA | [E6][B305] |

**Inferência**
- Gateways e bancos brasileiros (boleto, Pix, bureaus de crédito, CRMs nacionais) não aparecem como nós no pacote base; no n8n eles seriam atendidos pelo nó HTTP ou por nós da comunidade (por quê: nenhum nome desses serviços está na lista do pacote) [E6].
- Para o VEXOR, a paridade útil é ter o nó HTTP com credencial genérica forte, WhatsApp oficial e não oficial, e-mail, SMS, planilha, SQL e IA, e não perseguir a contagem de 438 nós [E6].

**Desconhecido**
- Quais nós da comunidade cobrem serviços brasileiros e sua qualidade; janela de 24 horas e regras de modelos do WhatsApp dentro do nó (a página não trata) [B361].

## 12. Funcionalidades de backend/API encontradas

Uma linha por funcionalidade, para a matriz de paridade. Ids de evidência entre colchetes.

| Id | Funcionalidade | Seção | Evidência |
| --- | --- | --- | --- |
| FB-001 | Fluxo como grafo de nós, ligações, notas e grupos de canvas | 1.1 | [B11][B196] |
| FB-002 | Ajustes por nó: sempre produzir saída, executar uma vez, ao errar, notas | 1.1 | [B12] |
| FB-003 | Ligações chaveadas pelo nome do nó de origem | 1.1 | [B196] |
| FB-004 | Bloqueio otimista por `versionId` | 1.1 | [B196] |
| FB-005 | Exportar e importar fluxo em JSON sem segredos | 1.2 | [B18] |
| FB-006 | Pacote portável com manifesto, dependências e políticas de importação | 1.2 | [B26][E5] |
| FB-007 | Salvamento automático com rascunho separado da versão publicada | 1.3 | [B17] |
| FB-008 | Publicar e despublicar com nome e descrição de versão | 1.3 | [B17][B196] |
| FB-009 | Publicação assíncrona com diff de gatilhos e estados parcial e falha | 1.3 | [B17] |
| FB-010 | Bloqueio de edição colaborativa (um editor por vez) | 1.3 | [B17] |
| FB-011 | Histórico de versões com restaurar, clonar, baixar e nomear | 1.3 | [B19] |
| FB-012 | Revisão de fluxo antes de publicar | 1.3 | [B23] |
| FB-013 | Configurações do fluxo: salvar execuções, tempo limite, fuso, fluxo de erro, política de chamadores | 1.4 | [B20][B196] |
| FB-014 | Redação de dados de execução por fluxo e piso da instância | 1.4, 2.6 | [B148] |
| FB-015 | Tags globais de fluxo | 1.5 | [B22] |
| FB-016 | Pastas aninhadas por projeto | 1.5 | [B205] |
| FB-017 | Arquivar, desarquivar e excluir fluxo | 1.5 | [B196] |
| FB-018 | Transferir fluxo entre projetos | 1.5 | [B196] |
| FB-019 | Modos de execução (manual, gatilho, webhook, repetição, erro, sub-fluxo, chat) | 2.1 | [B197] |
| FB-020 | Execução parcial a partir de um nó | 2.1, 2.4 | [B30] |
| FB-021 | Estados de execução e campos de tempo | 2.2 | [B197] |
| FB-022 | Despublicação automática após falhas graves seguidas | 2.2 | [B91] |
| FB-023 | Itens com JSON e binário entre nós | 2.3 | [B48] |
| FB-024 | Ligação de itens (rastreio item de saída para item de entrada) | 2.3 | [B52] |
| FB-025 | Dados fixados para teste | 2.3 | [B62] |
| FB-026 | Ordem de execução v1 por ramo | 2.4 | [B40] |
| FB-027 | Marcação de nós desatualizados | 2.4 | [B36] |
| FB-028 | Repetir execução falha com fluxo atual ou original | 2.5 | [B31][B197] |
| FB-029 | Parar execução e parar em lote | 2.5 | [B197] |
| FB-030 | Tempo limite por fluxo com teto da instância | 2.5 | [B118] |
| FB-031 | Limite de concorrência de produção com fila FIFO | 2.5 | [B136] |
| FB-032 | Retenção e poda de execuções por idade e quantidade | 2.6 | [B137] |
| FB-033 | Armazenamento de dados de execução em banco, disco ou objeto | 2.6 | [B139] |
| FB-034 | Dados personalizados de execução filtráveis | 2.6 | [B33] |
| FB-035 | Tags e votos em execuções | 2.6 | [B197] |
| FB-036 | Modo fila com Redis, workers e processadores de webhook | 2.7 | [B135] |
| FB-037 | Multi-main com líder para gatilhos não HTTP | 2.7 | [B135] |
| FB-038 | Agendador durável no banco | 2.7, 5.1 | [B129] |
| FB-039 | Ao errar: parar, continuar ou saída de erro | 3.1 | [B12] |
| FB-040 | Tentar de novo no nó com máximo e espera | 3.1 | [B12] |
| FB-041 | Fluxo de erro com gatilho de erro e payload padronizado | 3.2 | [B39] |
| FB-042 | Nó de parar com erro | 3.3 | [B245] |
| FB-043 | Condição, roteamento por regras e filtro | 4.1 | [B248][B249][B250] |
| FB-044 | Junção de caminhos com modos de combinação | 4.2 | [B246] |
| FB-045 | Comparação de conjuntos com quatro saídas | 4.2 | [B282] |
| FB-046 | Laço em lotes | 4.3 | [B247] |
| FB-047 | Espera por tempo, data, webhook ou formulário | 4.4 | [B241] |
| FB-048 | Enviar e aguardar resposta em canais | 4.4 | [B257][B361] |
| FB-049 | Sub-fluxos com entrada tipada e política de chamadores | 4.5 | [B242][B243] |
| FB-050 | Converter seleção em sub-fluxo | 4.5 | [B46] |
| FB-051 | Nó de código JavaScript e Python em sandbox | 4.6 | [B69] |
| FB-052 | Task runners externos | 4.6 | [B128] |
| FB-053 | Nós visuais de transformação de dados | 4.7 | [B54] |
| FB-054 | Expressões com sandbox, tempo limite e funções de transformação | 4.8 | [B55][B112][B56] |
| FB-055 | Gatilho manual | 5.1 | [B255] |
| FB-056 | Agendamento por intervalo e cron com política de disparos perdidos | 5.1 | [B240] |
| FB-057 | Gatilhos por polling | 5.1 | [B270] |
| FB-058 | Gatilhos de eventos da própria instância | 5.1 | [B258] |
| FB-059 | Gatilho de webhook com autenticação, CORS, IPs e modos de resposta | 5.2 | [B238] |
| FB-060 | URL de teste e de produção de webhook | 5.2 | [B238] |
| FB-061 | Nó de resposta ao webhook | 5.2 | [B252] |
| FB-062 | Gatilho de formulário e páginas de formulário | 5.3 | [B253][B254] |
| FB-063 | Gatilho de chat hospedado ou embutido | 5.3 | [B260] |
| FB-064 | Gatilho de e-mail IMAP | 5.3 | [B256] |
| FB-065 | Gatilhos de apps com registro automático de webhook | 5.3 | [B307] |
| FB-066 | Gatilho de servidor MCP por fluxo | 5.3 | [B266] |
| FB-067 | Ativação em lote no início da instância | 5.4 | [B105] |
| FB-068 | Credenciais com tipos, esquema de campos e nome padrão | 6.1 | [B317][E5] |
| FB-069 | Teste de credencial ao salvar e por id | 6.1 | [B317][E5] |
| FB-070 | Domínios permitidos por credencial para o nó HTTP | 6.1 | [B317] |
| FB-071 | Expressões em campos de credencial | 6.1 | [B317] |
| FB-072 | Credenciais cifradas com chave da instância | 6.2 | [B324] |
| FB-073 | Rotação de chaves de dados | 6.2 | [B325][E4] |
| FB-074 | Compartilhar credencial com usuário ou projeto ("pode usar") | 6.3 | [B319] |
| FB-075 | Transferir credencial entre projetos | 6.3 | [E5] |
| FB-076 | OAuth1 genérico | 6.4 | [B321] |
| FB-077 | OAuth2 genérico (código, credenciais do cliente, PKCE) | 6.4 | [B321] |
| FB-078 | Rotas de autorização e retorno OAuth e desconexão de token | 6.4 | [E4] |
| FB-079 | Credenciais predefinidas reaproveitadas no nó HTTP | 6.5 | [B322] |
| FB-080 | Credenciais genéricas básica, digest, cabeçalho, bearer, query e personalizada | 6.5 | [B321] |
| FB-081 | Credencial personalizada simplificada com modelo e URL de teste | 6.5 | [B321] |
| FB-082 | Certificados SSL de cliente | 6.5 | [B321] |
| FB-083 | Proteção SSRF | 6.5 | [B359] |
| FB-084 | Credenciais de usuário final | 6.6 | [B327] |
| FB-085 | Segredos externos em cofres | 6.6 | [B326] |
| FB-086 | Sobrescrita global de credenciais | 6.6 | [B328] |
| FB-087 | Políticas de tipos de credencial e de nó | 6.6 | [E5] |
| FB-088 | Variáveis globais e de projeto | 7.1 | [B337][E5] |
| FB-089 | Dados estáticos do fluxo | 7.2 | [B338] |
| FB-090 | Tabelas de dados com colunas, linhas, upsert e limite de tamanho | 7.3 | [B340][E5] |
| FB-091 | Modos de armazenamento de binários | 7.4 | [B341][B339] |
| FB-092 | Controle de versão por git com push e pull | 7.5 | [B343][E5] |
| FB-093 | Ambientes por instância e ramo | 7.5 | [B344] |
| FB-094 | Publicação automática no pull | 7.5 | [B343] |
| FB-095 | Promoções entre instâncias | 7.5 | [E5] |
| FB-096 | Papéis globais dono, admin, membro e usuário de chat | 8.1 | [B330] |
| FB-097 | Convite, reenvio e exclusão de usuário com transferência | 8.1 | [B346] |
| FB-098 | Projetos pessoais e de equipe | 8.2 | [B331][E5] |
| FB-099 | Papéis de projeto admin, editor e visualizador | 8.2 | [B329] |
| FB-100 | Papéis personalizados por escopos recurso:ação | 8.2 | [B333][E5] |
| FB-101 | Mapeamento de papéis por provedor de identidade | 8.2 | [E5] |
| FB-102 | Compartilhar fluxo no espaço pessoal | 8.3 | [B347] |
| FB-103 | Políticas de segurança da instância | 8.3 | [B348] |
| FB-104 | Auditoria de segurança em cinco categorias | 8.4 | [B345] |
| FB-105 | Log streaming para webhook, syslog e Sentry | 8.4 | [B189][E5] |
| FB-106 | SSO SAML e OIDC, LDAP e MFA (registro) | 8.5 | [B362][E5] |
| FB-107 | Chaves de API com expiração e escopos | 8.6 | [B334][E4] |
| FB-108 | API pública versionada em /api/v1 com chave no cabeçalho | 9.1 | [B334][E5] |
| FB-109 | Paginação por cursor | 9.1 | [B335] |
| FB-110 | Idempotência por cabeçalho | 9.1 | [E5] |
| FB-111 | Descoberta de capacidades por chave | 9.1 | [E5] |
| FB-112 | API de fluxos | 9.2 | [E5] |
| FB-113 | API de execuções | 9.3 | [E5] |
| FB-114 | API de credenciais sem segredos na leitura | 9.4 | [E5] |
| FB-115 | API de tags, usuários, projetos, variáveis, pastas e papéis | 9.5 | [E5] |
| FB-116 | API de auditoria, controle de versão e tabelas de dados | 9.6 | [E5] |
| FB-117 | API de insights | 9.6 | [E5] |
| FB-118 | API de avaliações | 9.6 | [E5] |
| FB-119 | API de pacotes da comunidade | 9.6 | [E5] |
| FB-120 | Configuração por variáveis de ambiente com sufixo de arquivo | 10.1 | [B349] |
| FB-121 | Banco SQLite ou Postgres | 10.1 | [B349] |
| FB-122 | E-mail SMTP da instância com modelos | 10.1 | [B351] |
| FB-123 | Logs com nível, saída e formato | 10.1 | [B352] |
| FB-124 | CLI de execução, publicação, exportação, importação e administração | 10.2 | [B353] |
| FB-125 | Saúde e prontidão | 10.3 | [B354] |
| FB-126 | Métricas Prometheus | 10.3 | [B356] |
| FB-127 | Rastreamento OpenTelemetry | 10.3 | [B157][E5] |
| FB-128 | Backup e restauração documentados | 10.4 | [B355] |
| FB-129 | Catálogo de nós e credenciais | 11.1 | [E6][B360] |
| FB-130 | Nós da comunidade instaláveis | 11.1 | [B360][E5] |
| FB-131 | Integração WhatsApp oficial | 11.2 | [B361] |
| FB-132 | Integrações de e-mail, SMS, planilhas, SQL, CRM, agenda, formulários e IA | 11.2 | [E6] |
| FB-133 | Servidor MCP da instância | 0 | [B225] |
| FB-134 | Insights de execuções e tempo economizado | 3.2, 10.3 | [B188] |

## Desconhecidos em aberto

Consolidado das seções 0 a 11. Os itens de 0 a 5 já aparecem nas seções; aqui estão os mais relevantes para a paridade.

- Data de lançamento da 3.0 e quais recursos em preview ficam estáveis (seção 0).
- Formato do id de fluxo, limites de nós por fluxo e de tamanho do JSON (1.1).
- Diagrama oficial de transições de estado da execução; semântica de "integrated" e "internal" (2.1, 2.2).
- Tempo limite em modo fila e se execuções em espera contam para a concorrência (2.5).
- Política de espera em "tentar de novo" e limite de tentativas (3.1).
- Ordem de execução com vários gatilhos no mesmo fluxo (2.4, 5.4).
- Algoritmo de criptografia das credenciais e formato cifrado no banco (6.2).
- Caminho completo da URL de retorno OAuth e política de renovação de token, inclusive o que acontece quando falha (6.4).
- Se o teste de credencial bloqueia o salvamento (6.1).
- Intervalo de atualização de segredos externos (6.6).
- Tipos aceitos em variáveis além de texto e cota de variáveis (7.1).
- Onde o modo `database` guarda binários (7.4).
- Licença e estabilidade das promoções entre instâncias; formato dos arquivos no repositório git (7.5).
- Registro de auditoria consultável dentro do produto (8.4).
- Prazos de expiração de chaves de API; permissões de uma chave sem escopos fora do Enterprise além de "acesso total" (8.6).
- Política de versionamento da API e limites de taxa (9.1).
- Nós da comunidade para serviços brasileiros (Pix, boleto, bureaus) e regras de janela e modelos do WhatsApp dentro do nó (11.2).
- URLs das fontes B1 a B316: o agente anterior foi interrompido antes de gravar o ledger dessas fontes. Os ids continuam válidos no texto, mas a URL exata de cada um precisa ser recuperada.

## Ledger de fontes

Fontes acrescentadas nesta rodada (acesso em 2026-10-29). Os ids B1 a B316 foram usados nas seções 0 a 5, mas o ledger deles não foi gravado (ver "Desconhecidos em aberto").

| Id | Fonte |
| --- | --- |
| B317 | https://docs.n8n.io/build/understand-workflows/create-and-edit-credentials |
| B318 | https://docs.n8n.io/administer/manage-credentials |
| B319 | https://docs.n8n.io/administer/manage-credentials/share-credentials-securely |
| B320 | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest |
| B321 | https://docs.n8n.io/integrations/builtin/credentials/httprequest |
| B322 | https://docs.n8n.io/integrations/builtin/custom-api-actions-for-existing-nodes |
| B323 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/credentials |
| B324 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/configuration-examples/set-a-custom-encryption-key |
| B325 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/rotate-encryption-keys |
| B326 | https://docs.n8n.io/administer/manage-credentials/use-external-secret-stores |
| B327 | https://docs.n8n.io/administer/manage-credentials/end-user-credentials |
| B328 | https://docs.n8n.io/administer/manage-credentials/credential-overwrites |
| B329 | https://docs.n8n.io/administer/manage-users-and-access/set-permissions-and-roles-rbac/see-available-roles |
| B330 | https://docs.n8n.io/administer/manage-users-and-access/understand-instance-roles |
| B331 | https://docs.n8n.io/administer/manage-users-and-access/set-permissions-and-roles-rbac/organize-work-in-projects |
| B332 | https://docs.n8n.io/administer/manage-users-and-access/set-permissions-and-roles-rbac/create-custom-roles |
| B333 | https://docs.n8n.io/administer/manage-users-and-access/set-permissions-and-roles-rbac/create-custom-roles/create-custom-project-roles |
| B334 | https://docs.n8n.io/connect/n8n-api/authentication |
| B335 | https://docs.n8n.io/connect/n8n-api/pagination |
| B336 | https://docs.n8n.io/connect/n8n-api |
| B337 | https://docs.n8n.io/build/code-in-n8n/define-custom-variables |
| B338 | https://docs.n8n.io/build/code-in-n8n/cookbook/built-in-methods-and-variables-examples/getworkflowstaticdata |
| B339 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/handle-binary-data |
| B340 | https://docs.n8n.io/build/work-with-data/data-tables |
| B341 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/binary-data |
| B342 | https://docs.n8n.io/administer/use-source-control-and-environments/understand-source-control |
| B343 | https://docs.n8n.io/administer/use-source-control-and-environments/push-and-pull-changes |
| B344 | https://docs.n8n.io/administer/use-source-control-and-environments/work-with-environments |
| B345 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/run-security-audits |
| B346 | https://docs.n8n.io/administer/manage-users-and-access/add-and-remove-users |
| B347 | https://docs.n8n.io/build/manage-workflows/share-with-others |
| B348 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/manage-security-policies |
| B349 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/database |
| B350 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/security |
| B351 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/user-management-and-2fa |
| B352 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/logs |
| B353 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/use-the-command-line |
| B354 | https://docs.n8n.io/deploy/host-n8n/keep-n8n-running/monitor-n8n |
| B355 | https://docs.n8n.io/deploy/host-n8n/keep-n8n-running/backup-and-restore |
| B356 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/endpoints |
| B357 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/disable-the-public-api |
| B358 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/deployment |
| B359 | https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/enable-ssrf-protection |
| B360 | https://docs.n8n.io/integrations |
| B361 | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.whatsapp |
| B362 | Mapas do site: https://docs.n8n.io/administer/sitemap-pages.xml, https://docs.n8n.io/connect/sitemap-pages.xml e https://docs.n8n.io/deploy/sitemap-pages.xml (existência de páginas de SAML, OIDC, LDAP, dois fatores, JWE e variáveis por categoria) |

Evidências de pacote citadas nesta rodada: [E1] proveniência, [E4] rotas internas, [E5] especificação OpenAPI 1.1.1, [E6] catálogo de nós e credenciais, todas em `00-ledger-evidencias.md`.
