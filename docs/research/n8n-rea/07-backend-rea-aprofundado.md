# 07. Backend de execução do n8n, aprofundado com REA (agente R2)

Pesquisa de paridade VEXOR x n8n, fase 1 aprofundada. Data: 29/10/2026.
Alvo: servidor `n8n` 2.45.5 (`pkg/n8n-2.45.5/package/dist`), núcleo `n8n-core` 2.16.1 e modelo `n8n-workflow` 2.16.0, todos em `D:\VEXOR\_ref\n8n\pkg`.
Complementa `02-backend-execucao-api-docs.md` (o que a documentação diz) e fecha parte das seções 6 a 12 que ficaram sem conclusão lá.

## Como ler

- **Observação (REA ev_...)**: o fato aparece numa evidência do REA gerada nesta rodada (ver "Ledger R2").
- **Observação (leitura direta)**: o fato saiu da leitura do JavaScript compilado com grep ou sed, sem cadeia de evidência do REA. Cito arquivo e linha aproximada do pacote. Nada foi copiado: o texto abaixo descreve comportamento com palavras nossas.
- **Inferência**: dedução nossa, com o porquê.
- **Desconhecido**: as fontes lidas não permitem afirmar.
- Ids `[B..]` apontam para `02-backend-execucao-api-docs.md`, `[E..]` para `00-ledger-evidencias.md`, `[R2-..]` para o ledger no fim deste arquivo. Referências ao VEXOR vêm de `03-inventario-vexor.md` (cito a seção, ex.: "inventário 4.3").
- Limite do REA nesta rodada: análise estática com `source_paths` restritos (10 e 14 arquivos), cobertura semântica parcial. Rastreios por literal de texto (ex.: nome de estado) não casaram, porque o REA indexa propriedades e ligações, não literais soltos dentro de listas. Rastreios por nome de propriedade funcionaram. Por isso o grosso da semântica veio de leitura direta, e o REA ficou como prova de presença e localização.
- Cada seção tem três partes: "Como o n8n faz", "O que o VEXOR já tem" e "Especificação para o VEXOR". A especificação descreve comportamento a reproduzir, não implementação.

---

## 1. Ciclo de vida da execução

### Como o n8n faz

**Observação (leitura direta)** [R2-10]: o modelo declara oito estados de execução: cancelada, quebrada (crashed), erro, nova, em execução, sucesso, desconhecida e aguardando. É a mesma lista que a evidência E2b do REA já tinha localizado no módulo de estados do `n8n-workflow` (`ev_4d0f892e...`).

**Observação (leitura direta)** [R2-11]: criação. Toda execução nasce como registro no banco antes de rodar. Uma execução nova entra como "nova"; uma retomada (espera vencida, recuperação) reaproveita o registro existente e já entra como "em execução". No modo normal (sem fila), a execução nova é marcada "em execução" logo depois de passar pela reserva de concorrência. No modo fila, ela fica "nova" até um worker pegá-la.

**Observação (leitura direta)** [R2-11]: troca de estado com guarda. Ao retomar uma execução existente, o servidor grava o novo estado somente se o estado atual for o esperado (por exemplo, só retoma se ainda estiver "aguardando"). Se a gravação condicional não afetar a linha, o servidor conclui que outro processo já pegou aquela execução e desiste sem erro. O mesmo padrão aparece em parar, salvar progresso e salvar o resultado final (condições do tipo "exigir não cancelada" e "exigir não finalizada").

**Observação (REA ev_9ffc249d...)** [R2-5]: o campo "aguardar até" (data de retomada) é lido em oito pontos distintos espalhados pelos ganchos de ciclo de vida, pelo executor e pela recuperação. Confirma que a data de retomada é dado de primeira classe da execução, não do nó.

**Observação (leitura direta)** [R2-12]: estado final. Ao terminar, o servidor calcula o estado final assim: se a execução já está marcada como quebrada, fica quebrada; se foi cancelada, fica cancelada; se existe data de retomada, fica "aguardando" (vence qualquer outra regra); senão, sucesso quando não há erro registrado e erro quando há.

**Observação (leitura direta)** [R2-12]: persistência por modo. Ao terminar:
- Execução manual com "salvar execuções manuais" desligado e sem espera pendente: o registro é apagado de forma lógica.
- Execução de produção cujo resultado não deve ser salvo (sucesso com "salvar sucesso" desligado, ou falha com "salvar erro" desligado) e sem espera: o registro é removido, mas o fluxo de erro ainda é disparado antes.
- Nos demais casos, grava dados, estado, tempos, versão do fluxo usada e metadados personalizados. A gravação final exige que a execução não tenha sido cancelada no meio.
- Execuções em espera nunca são descartadas, mesmo com "não salvar".

**Observação (leitura direta)** [R2-12]: cada configuração de salvamento do fluxo aceita "padrão", que herda o valor global da instância (as variáveis `EXECUTIONS_DATA_SAVE_ON_ERROR`, `EXECUTIONS_DATA_SAVE_ON_SUCCESS`, `EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS`, `EXECUTIONS_DATA_SAVE_ON_PROGRESS` [B91]).

**Observação (leitura direta)** [R2-12]: salvar progresso. Com a opção ligada, depois de cada nó o servidor regrava os dados da execução e o "último nó executado", sempre com a guarda "não finalizada e não cancelada". Falha ao salvar progresso só gera log; a execução continua.

**Observação (leitura direta)** [R2-11]: o fluxo é congelado na execução. O registro guarda uma cópia do fluxo (nós, ligações, configurações, dados fixos) no momento da criação, e a retomada usa essa cópia, não o rascunho atual.

**Inferência**: transições válidas, montadas a partir das guardas: nova > em execução; nova > cancelada; nova > quebrada (falha ao iniciar); em execução > sucesso | erro | cancelada | quebrada | aguardando; aguardando > em execução (retomada) | cancelada; desconhecida > cancelada. O motivo: são exatamente os pares que as gravações condicionais permitem.

### O que o VEXOR já tem

- Estados QUEUED, RUNNING, SUSPENDED, COMPLETED, FAILED com gatilho SQL que valida transições (inventário 4.2). Equivalem a nova, em execução, aguardando, sucesso e erro.
- Execução fixada numa versão publicada imutável, `eventData` congelado (inventário 4.3). Mais forte que a cópia do n8n, porque a versão é imutável no banco.
- Histórico de tentativas por execução, com ABANDONED quando o lease vence (inventário 4.2).
- Falta: estados cancelada e quebrada separados de FAILED; política "o que salvar" por modo e por fluxo; salvar progresso por nó configurável; apagar execução manual.

### Especificação para o VEXOR

1. Acrescentar dois estados terminais: CANCELED (parada pedida por pessoa, tempo limite ou desligamento) e CRASHED (o processo morreu ou o registro ficou órfão). FAILED fica reservado a erro de nó ou de regra.
2. Toda troca de estado é condicional ao estado anterior esperado. Se a linha não mudou, o chamador trata como "outro processo já cuidou" e não sobrescreve. O VEXOR já faz isso com token de posse; estender para parar, retomar e salvar final.
3. Regra de estado final: espera pendente vence tudo; depois cancelada; depois quebrada; depois erro se houver erro registrado; senão sucesso.
4. Política de salvamento por fluxo, com valor "herdar da organização": salvar sucesso, salvar erro, salvar testes manuais, salvar progresso por nó. Execução em espera é sempre salva. Quando não salvar, o fluxo de erro dispara antes de descartar.
5. Execução de teste manual não salva vira exclusão lógica (some da lista, recuperável por um tempo).

---

## 2. Cancelamento

### Como o n8n faz

**Observação (leitura direta)** [R2-13]: só dá para parar execuções nos estados nova, desconhecida, aguardando ou em execução. Qualquer outro estado devolve erro de operação dizendo que só execuções em andamento ou em espera podem ser paradas.

**Observação (leitura direta)** [R2-13]: o pedido de parada faz, nesta ordem:
- Se a execução ainda está na fila de concorrência, sai da fila e é marcada parada antes de rodar.
- Se está rodando neste processo, recebe um sinal de cancelamento; a resposta HTTP pendente (webhook esperando resultado) é rejeitada.
- Se está em espera com temporizador local, o temporizador é desarmado.
- No modo fila, publica um comando "parar execução" para os workers.
- Por fim grava estado cancelado, hora de término, limpa a data de retomada e registra um erro de "cancelamento manual" nos dados. A gravação é condicional ao estado lido. Se perdeu a corrida, relê: se já está cancelada, devolve; senão tenta parar de novo.

**Observação (leitura direta)** [R2-13]: parar em lote recebe um filtro, tenta parar uma a uma e devolve a contagem das que pararam. Execuções que sumiram no meio são ignoradas em silêncio.

**Observação (leitura direta)** [R2-13]: excluir uma execução em execução é proibido (erro de requisição). Excluir uma execução "nova" tira ela da fila de concorrência antes.

**Observação (leitura direta)** [R2-11]: no desligamento do processo (modo normal), execuções rodando são registradas como canceladas com prazo de 3 segundos para a escrita; execuções novas e em espera não são canceladas, ficam para a recuperação.

**Inferência**: o cancelamento é cooperativo. O nó em andamento termina e o motor para antes do próximo (o documento 02 já dizia isso para tempo limite [B118]).

### O que o VEXOR já tem

- Nada de cancelamento (inventário 4.4: "Não há cancelamento de execução, pausa manual").

### Especificação para o VEXOR

1. `POST /executions/:id/stop` e parada em lote por filtro (fluxo, estado, janela de datas), devolvendo quantas pararam.
2. Paráveis: QUEUED, RUNNING, SUSPENDED. Demais estados devolvem 409 com mensagem clara.
3. QUEUED: muda direto para CANCELED. SUSPENDED: cancela o checkpoint (status próprio) e muda para CANCELED. RUNNING: grava um pedido de cancelamento na linha; o worker confere o pedido entre um nó e o próximo e encerra com CANCELED. Se o lease vencer com pedido pendente, a reserva seguinte fecha como CANCELED em vez de reexecutar.
4. Gravar no resultado um erro do tipo "cancelada por pessoa" (ou "por tempo limite", "por desligamento"), com quem pediu.
5. Proibir exclusão de execução RUNNING.
6. No SIGTERM do worker, terminar o nó atual e devolver a execução para a fila (já existe) ou marcar CANCELED se houver pedido pendente.

---

## 3. Tempo limite

### Como o n8n faz

**Observação (leitura direta)** [R2-14]: o tempo limite efetivo é o valor do fluxo, ou o global quando o fluxo não define, sempre limitado pelo teto global (`EXECUTIONS_TIMEOUT` e `EXECUTIONS_TIMEOUT_MAX` [B91]). Valor zero ou negativo desliga.

**Observação (leitura direta)** [R2-14]: o prazo é contado desde o início original da execução. Numa retomada, desconta-se o tempo já gasto; se não sobra nada, a execução é cancelada na hora. Quando o prazo vence, a execução é parada com um erro específico de tempo esgotado, que vira estado cancelado.

**Observação (leitura direta)** [R2-14]: o prazo também é passado ao motor como "instante limite", para nós que respeitam prazo.

**Desconhecido**: se o tempo parado em espera conta para o prazo. A leitura sugere que conta (desconto desde o início original), mas não vi teste disso.

### O que o VEXOR já tem

- Transação de até 20 s por segmento e lease de 30 s (inventário 4.3). Não há tempo limite de execução configurável.
- Espera com prazo de retomada opcional (`resumeDeadlineMinutes`) que vira FAILED `WAIT_EXPIRED` (inventário 4.4).

### Especificação para o VEXOR

1. Configuração por fluxo "tempo limite da execução" em segundos, com teto por organização.
2. O prazo conta do primeiro início. Na retomada, se já venceu, encerrar como CANCELED com motivo "tempo limite".
3. Decidir e documentar se o tempo em SUSPENDED conta. Sugestão: não contar, porque esperas de dias são o caso de uso do VEXOR. É divergência consciente do n8n.

---

## 4. Execução travada, quebrada e recuperação após reinício

### Como o n8n faz

**Observação (leitura direta)** [R2-15]: há um serviço único que marca execuções como quebradas. Ele registra quem detectou (recuperação de partida, recuperação de fila, falha ao iniciar, desativação do fluxo), conta para estatísticas e emite um evento de "execução quebrada" com fluxo, versão, modo e horários.

**Observação (leitura direta)** [R2-15]: recuperação por registros de evento. Ao subir, o principal tenta reconstruir execuções interrompidas a partir do log de eventos por nó: nós com evento de início e de fim viram sucesso artificial; o nó com início e sem fim vira "nó quebrado", e a execução recebe um erro de "fluxo quebrado". O estado vira quebrado (ou mantém erro se já era erro). Depois roda os ganchos de fim e avisa o editor. Só o líder faz isso.

**Observação (leitura direta)** [R2-15]: desativação automática. Depois da recuperação, para cada fluxo afetado o servidor olha as últimas N execuções (N vem de `N8N_WORKFLOW_AUTODEACTIVATION_MAX_LAST_EXECUTIONS` [B91]). Se todas estão quebradas, despublica o fluxo como sistema, manda e-mail ao responsável, avisa o editor e marca as execuções restantes daquele fluxo como quebradas.

**Observação (leitura direta)** [R2-16]: recuperação de execuções enfileiradas (modo normal). Ao subir, o servidor busca todas as execuções "nova". As que têm dados ilegíveis viram quebradas. As demais são reiniciadas com guarda "esperado: nova". Se outro processo já pegou, ignora. Se falha ao iniciar, vira quebrada com detector "falha ao iniciar".

**Observação (leitura direta)** [R2-17]: recuperação de fila (modo fila). Periodicamente, o principal lista execuções em andamento no banco (em lotes) e compara com os jobs ativos ou em espera no broker. As que estão no banco e não no broker são "penduradas" e viram quebradas. Se o lote veio cheio, o próximo ciclo roda na metade do intervalo.

**Observação (leitura direta)** [R2-17]: o worker, ao pegar um job, lê a execução; se ela já está quebrada, desiste sem rodar.

**Observação (leitura direta)** [R2-14]: quando o broker acusa job travado além do limite, o principal converte o erro em "quebrada" e emite evento de job travado. A documentação diz que, desde a 2.0, jobs travados não são repetidos automaticamente [B8].

**Inferência**: o n8n prefere "quebrada e visível" a "repetida em silêncio". O motivo é evitar efeito duplicado em nós com efeito externo.

### O que o VEXOR já tem

- Lease de 30 s com token de posse; lease vencido volta a ser reservável e a tentativa anterior vira ABANDONED; após `maxAttempts` vira FAILED `ATTEMPTS_EXHAUSTED` (inventário 4.3).
- Testes de morte de processo (inventário 12, `queue.test.ts`).
- Falta: estado CRASHED, evento de quebra com detector, desativação automática por quebras seguidas, aviso ao responsável.

### Especificação para o VEXOR

1. Lease vencido em RUNNING: em vez de reexecutar o segmento inteiro por padrão, olhar se o segmento já produziu efeito externo registrado (outbox). Se produziu, marcar CRASHED com detector "lease vencido" e exigir repetição manual. Se não produziu, pode reenfileirar (comportamento atual).
2. Registrar em cada execução quebrada: detector, worker, nó em andamento quando houver.
3. Desativação automática opcional por organização: se as últimas N execuções de um fluxo forem CRASHED, despublicar, avisar o titular por e-mail e mostrar aviso no editor.
4. Na subida do worker, varrer QUEUED com dados ilegíveis (snapshot ausente) e marcar CRASHED com detector "falha ao iniciar".

---

## 5. Repetir execução: fluxo atual x fluxo original

### Como o n8n faz

**Observação (leitura direta)** [R2-13]: regras para repetir:
- Execução inexistente ou sem acesso: 404.
- Execução ainda "nova" (na fila): recusada com erro próprio.
- Execução sem dados de pilha de execução (abortada antes de rodar): recusada com erro próprio.
- Execução finalizada com sucesso: 409.

**Observação (leitura direta)** [R2-13]: como repete:
- O modo da nova execução é "repetição", com referência à original.
- Parte dos dados salvos da original. Apaga o erro geral e remove o último resultado do nó que falhou, para ele rodar de novo com a mesma entrada.
- Com "fluxo original", usa a cópia congelada na execução. Com "fluxo atual", carrega o fluxo salvo agora e substitui, na pilha pendente, cada nó pelo nó de mesmo nome do fluxo atual. Se um nó pendente não existe mais (renomeado ou apagado), falha com mensagem explícita.
- Em ambos os casos o fluxo da repetição é tratado como não publicado.
- A chamada espera a repetição terminar e devolve o resultado.
- Quando a repetição dá certo, a original recebe o id da repetição bem-sucedida.

**Observação (leitura direta)** [R2-18]: quando um nó falha sem "continuar", o motor devolve esse nó ao topo da pilha pendente antes de parar. É isso que torna a repetição "a partir do ponto de falha" possível.

**Observação (leitura direta)** [R2-19]: execuções de repetição não entram na fila de concorrência de produção.

### O que o VEXOR já tem

- Retry automático só para erros transitórios do banco (inventário 4.3). Não há repetição manual.
- Checkpoint com estado mínimo (lead, saídas filtradas, visitados, próximo nó) (inventário 4.1). É a base certa para retomar do ponto de falha.

### Especificação para o VEXOR

1. `POST /executions/:id/retry` com `{ mode: 'original' | 'current' }`.
2. Recusar: QUEUED (409 "ainda na fila"), sem checkpoint utilizável (409 "falhou antes de começar"), COMPLETED (409 "sucesso não se repete").
3. Cria uma execução nova com `retryOf` apontando para a original. A original ganha `retrySuccessId` quando a repetição terminar em sucesso.
4. "original": usa o mesmo `versionId`. "current": usa a última versão publicada; recusa se o nó em que parou não existir mais nela (comparar por id estável do nó, não por nome, porque o VEXOR já tem ids).
5. Retoma do nó que falhou com o estado do checkpoint anterior a ele. Nós já concluídos não rodam de novo.
6. Aviso na interface: o nó que falhou roda de novo e pode repetir efeito externo.

---

## 6. Execução parcial e dados fixados

### Como o n8n faz

**Observação (leitura direta)** [R2-20]: há três caminhos de execução manual:
- Partir de um gatilho com dados já capturados e uma lista de nós iniciais: recria a pilha pendente a partir do grafo e roda até o destino.
- Rodar o fluxo inteiro (ou até um nó destino), opcionalmente começando por um nó com dados fixados.
- Execução parcial com dados de uma rodada anterior: exige nó destino.

**Observação (leitura direta)** [R2-21]: algoritmo da execução parcial no núcleo:
1. Acha o gatilho que alimenta o destino. Se não houver, usa o primeiro nó pai do destino que tenha dados anteriores. Se nada servir, erro pedindo para ligar um gatilho.
2. Recorta o subgrafo entre gatilho e destino, ignorando nós desativados.
3. Descarta os dados anteriores dos nós "sujos" (editados) e de tudo que depende deles.
4. Calcula os nós de partida: os primeiros nós do caminho sem dados válidos nem dados fixados.
5. Trata ciclos (laços) para não partir do meio de um laço.
6. Recria a pilha pendente e roda só esse recorte, guardando a lista de nós permitidos.

**Observação (leitura direta)** [R2-18]: dados fixados. Se um nó ativo tem dados fixados, o motor usa esses dados como saída e não executa o nó. Dados fixados só valem nos modos manual e avaliação; em produção são ignorados [R2-14].

**Observação (leitura direta)** [R2-14]: na partida de um fluxo, o servidor carrega os dados estáticos do fluxo (memória persistente entre execuções, usada por gatilhos de sondagem) e, ao terminar uma execução que não seja manual, grava os dados estáticos alterados.

### O que o VEXOR já tem

- Simulação sem efeitos externos, espera instantânea, dados sensíveis ocultos (inventário 3.5).
- Falta: teste de nó isolado, execução parcial, dados fixados (inventário 13, item 15).

### Especificação para o VEXOR

1. "Executar até aqui" no editor: roda a simulação só do subgrafo entre o gatilho e o nó escolhido.
2. Reaproveitar saídas da última simulação para nós não editados. Editar um nó invalida a saída dele e de todos os descendentes.
3. "Fixar saída" por nó, salva no rascunho (não na versão publicada). A simulação usa a saída fixada sem rodar o nó. Execução real ignora sempre.
4. Se não houver gatilho ligado, mensagem pedindo para ligar um gatilho.
5. Laços: se o nó escolhido está dentro de um laço, partir do início do laço.

---

## 7. Espera durável e retomada

### Como o n8n faz

**Observação (leitura direta)** [R2-22]: o nó de espera por tempo, quando a espera é menor que 65 segundos, dorme dentro do processo e a execução segue "em execução". Acima disso, grava uma data de retomada e a execução sai do processo como "aguardando". Espera sem prazo (por webhook ou formulário) usa uma data sentinela no ano 3000.

**Observação (leitura direta)** [R2-1]: o rastreador de espera roda só no líder. A cada 60 segundos consulta o banco por execuções em espera e arma um temporizador em memória para cada uma ainda não acompanhada. Quando o temporizador dispara:
- Recarrega a execução. Recusa se não existe, se já terminou ou se o fluxo não tem id.
- Para esperas do tipo "suspensa", exige estado "aguardando"; se mudou, outro processo já pegou.
- Reinicia com guarda "esperado: aguardando", preservando o início original e a versão do fluxo congelada.
- Se for sub-execução cujo pai espera o resultado, injeta o resultado no pai e retoma o pai, com até 3 tentativas e espera exponencial curta entre elas.

**Observação (REA ev_01c0cc4a...)** [R2-4]: o módulo do rastreador de espera depende do serviço de persistência de execuções, do executor e do serviço de publicação, e expõe um único serviço. Confirma o acoplamento descrito acima.

**Observação (leitura direta)** [R2-1]: o mesmo laço de 60 segundos também procura pais "estacionados" esperando sub-execuções. Se alguma filha terminou, injeta o resultado e retoma o pai. Filhas desaparecidas geram aviso.

**Observação (leitura direta)** [R2-23]: retomada por webhook de espera:
- Se a execução tem token de retomada, o token da URL é comparado em tempo constante. Token inválido: 401.
- Execução inexistente: 404. Em execução: 409. Já sendo retomada: 409. Terminou com erro: 409. Já finalizada: 409 (ou página "nada a fazer" para aprovação por mensagem).
- Senão, localiza o nó em espera que casa com caminho e método. Se não casa: 404.
- Emite evento "execução retomada" com origem webhook.

**Inferência**: o temporizador em memória mais a varredura de 60 s implica atraso de até cerca de 60 s em esperas longas logo após reinício. A espera curta dentro do processo evita esse atraso, mas não sobrevive a queda.

**Desconhecido**: a janela da consulta de esperas (quantos segundos à frente) fica no repositório do banco, que não está no pacote lido.

### O que o VEXOR já tem

- Espera durável por intervalo ou data, com checkpoint mínimo, status WAITING/READY/CONSUMED/EXPIRED/FAILED, um checkpoint ativo por execução, retomada automática pelo worker antes de cada reserva, expiração opcional e retomada manual (inventário 4.4). Isto já é mais robusto que o n8n: tudo no banco com `SKIP LOCKED`, sem temporizador em memória e sem depender de líder.
- Falta: retomada por webhook com token, retomada por formulário ou aprovação humana, espera de sub-fluxo.

### Especificação para o VEXOR

1. Manter o modelo atual (sem temporizador em memória). É a vantagem do VEXOR.
2. Nova forma de espera "até chamada externa": o checkpoint guarda um token aleatório de retomada. A URL pública de retomada é `/webhooks/resume/:executionId?token=...`. Comparar token em tempo constante.
3. Respostas: token errado 401; execução inexistente 404; RUNNING 409; já retomada (checkpoint READY ou CONSUMED) 409; terminal 409. Sucesso grava o corpo recebido no estado do checkpoint, marca READY e enfileira.
4. Espera com prazo máximo opcional: vencido o prazo sem chamada, seguir por uma saída "expirou" (configurável) em vez de só falhar.
5. Esperas abaixo de um limiar (ex.: 60 s) podem continuar dentro do mesmo segmento, como o n8n faz, para evitar o custo de checkpoint. Decisão de desempenho, não obrigatória.

---

## 8. Ativação, publicação e gatilhos

### Como o n8n faz

**Observação (leitura direta)** [R2-24]: o fluxo tem duas referências de versão: a versão atual do rascunho e a versão ativa (publicada). Um fluxo está "ativo" quando a versão ativa não é nula. Salvar só gera nova versão quando nós, ligações ou grupos de nós mudam; mudar só configurações mantém a versão.

**Observação (leitura direta)** [R2-24]: salvar exige a soma de verificação esperada (controle de concorrência otimista); conflito bloqueia o salvamento, salvo opção de forçar.

**Observação (leitura direta)** [R2-24]: publicar uma versão faz, em ordem: valida acesso do publicador às credenciais usadas na versão; valida referências a sub-fluxos; roda ganchos externos de ativação (que podem barrar); aplica política de publicação; checa guarda de publicação (revisões pendentes); detecta conflito de caminho de webhook (409); troca a versão ativa; registra no histórico de publicação e emite eventos de desativação da versão anterior e ativação da nova.

**Observação (leitura direta)** [R2-25]: ativar no gerenciador de fluxos ativos:
- Fluxo arquivado não é publicado.
- Usa sempre os nós e ligações da versão ativa, não do rascunho.
- Exige ao menos um nó capaz de iniciar o fluxo.
- Registra webhooks de produção (cada um com caminho, método, nó e id estável do webhook). Caminho já ocupado vira erro de "caminho em uso"; em caso de erro, remove os webhooks já registrados daquele fluxo.
- Liga gatilhos que não são HTTP e gatilhos de sondagem só no líder.
- Grava a contagem de gatilhos do fluxo e limpa o erro de ativação registrado.
- Em qualquer erro, registra a mensagem de erro de ativação do fluxo e propaga.
- Na partida da instância, ativa os fluxos em lotes (`N8N_WORKFLOW_ACTIVATION_BATCH_SIZE` [B105]).

**Observação (leitura direta e REA ev_ab176ea3...)** [R2-7] [R2-25]: reativação com espera exponencial. Se a ativação falha na partida, ou se um gatilho falha em produção, o fluxo entra numa fila de reativação: primeira tentativa após 1 segundo, depois o intervalo dobra a cada falha até o teto de 24 horas. O REA localizou a leitura e a escrita desse intervalo no gerenciador de fluxos ativos. Falha por política de publicação tira o fluxo da fila de reativação.

**Observação (leitura direta)** [R2-25]: quando um gatilho em produção emite erro, o servidor desliga os gatilhos do fluxo, registra o erro de ativação, dispara o fluxo de erro com um erro de ativação (o fluxo "foi desativado porque o gatilho falhou") e agenda a reativação.

**Observação (leitura direta)** [R2-25]: em multi-instância, quando a ativação falha por motivo que não é política nem erro de isolamento, o servidor limpa webhooks e gatilhos e zera a versão ativa (o fluxo fica despublicado), com evento de auditoria.

**Observação (leitura direta)** [R2-26]: webhooks de teste. Ficam registrados por padrão 2 minutos, com máximo de 10 minutos se o chamador pedir mais, e o registro vive 30 segundos além do prazo. Ao receber a chamada ou ao vencer, os webhooks de teste do fluxo são desregistrados. Webhook de teste inexistente: erro de "não encontrado".

**Observação (leitura direta)** [R2-27]: agendamento durável. Execuções agendadas são materializadas no banco antes da hora, reivindicadas com lease por qualquer principal, com coletor de reivindicações órfãs, e cada disparo tem chave de deduplicação: um disparo repetido da mesma ocorrência é recusado como duplicado. O servidor avisa em log quando a tolerância de atraso é menor que o intervalo do executor ou que a janela de materialização.

### O que o VEXOR já tem

- Publicar cria versão imutável numerada com validação de grafo e conexões e revisão otimista (inventário 3.4).
- Webhooks e mensagens usam a última versão publicada; não há interruptor ativo/inativo; não há agendamento; webhook com URL fixa por fluxo, só POST, sem URL de teste (inventário 5).
- `eventKey` único por organização e fluxo deduplica disparos (inventário 4.3). Equivale à chave de deduplicação do agendador do n8n.

### Especificação para o VEXOR

1. Separar "publicada" de "ativa": campo `activeVersionId` nulo ou não. Publicar e ativar podem ser a mesma ação na interface, mas despublicar zera `activeVersionId` sem apagar versões.
2. Ao ativar: exigir um gatilho; registrar webhooks numa tabela própria (organização, método, caminho, fluxo, nó) com unicidade (método, caminho) por organização; conflito devolve 409 com o fluxo dono do caminho.
3. Gatilho de agendamento: tabela de ocorrências materializadas com `eventKey` determinístico (fluxo, nó, instante previsto). Reivindicação com `SKIP LOCKED` e lease, como a fila atual. Política de atraso: descartar, rodar a última ou rodar todas, com tolerância configurável.
4. Erro de ativação fica salvo no fluxo e aparece no editor. Gatilho que falha em produção: desliga, registra, dispara fluxo de erro e reagenda reativação com espera exponencial (1 s, dobrando, teto de 24 h).
5. URL de teste separada (`/webhooks/test/...`) que só existe enquanto o editor escuta, com prazo padrão de 2 minutos e máximo de 10.

---

## 9. Tratamento de erro

### Como o n8n faz

**Observação (leitura direta)** [R2-18]: tentar de novo por nó. Desligado, o nó roda uma vez. Ligado, o número de tentativas fica entre 2 e 5 (padrão 3) e a espera entre tentativas entre 0 e 5 segundos (padrão 1 s), espera fixa. O motor também repete quando o nó devolve um item com erro em vez de lançar exceção.

**Observação (leitura direta)** [R2-18]: ao errar depois das tentativas:
- "Continuar com saída normal" ou "continuar com saída de erro": o nó passa adiante a própria entrada (primeira entrada principal), e com saída de erro os itens com erro são desviados para a saída de erro.
- Padrão (parar): grava o resultado do nó com erro, devolve o nó ao topo da pilha pendente e encerra.
- Itens com erro viram um objeto com a mensagem de erro no JSON.
- "Sempre produzir dado": se o nó não produziu itens, gera um item vazio ligado a todos os itens de entrada.

**Observação (leitura direta)** [R2-28]: fluxo de erro. Ao fim de uma execução com erro registrado:
- Execução manual nunca dispara fluxo de erro. Recusa por política também não.
- Monta o pacote do erro: com id de execução, leva id, link para a execução, erro, último nó, modo, `retryOf` e contexto; sem id (falha de ativação do gatilho), leva só o erro e o modo.
- Se o fluxo tem "fluxo de erro" configurado (e não é ele mesmo rodando em modo erro), roda esse fluxo no projeto do fluxo que falhou.
- Senão, se o próprio fluxo contém um gatilho de erro, roda a si mesmo.
- O fluxo de erro roda com a versão publicada dele. Se não estiver publicado, não roda e só gera log.
- Se a política de sub-fluxos não permitir que o fluxo de erro seja chamado pelo fluxo que falhou, grava uma execução falha no fluxo de erro explicando o bloqueio.

**Observação (leitura direta)** [R2-19]: execuções em modo erro não entram na fila de concorrência de produção.

**Inferência**: há uma divergência entre a documentação ("não é preciso publicar o fluxo de erro" [B39]) e o servidor 2.45.5, que carrega a versão publicada e recusa fluxo de erro sem versão ativa. Para o VEXOR vale o comportamento do servidor: exigir publicação torna o alerta previsível.

### O que o VEXOR já tem

- Falha interrompe o fluxo (inventário 12, testes unitários). Retry só para erro transitório do banco.
- Falta: tentar de novo por nó, continuar, saída de erro, fluxo de erro.

### Especificação para o VEXOR

1. Por nó com efeito externo: "tentar de novo" com 2 a 5 tentativas e espera fixa de 0 a 5 s (manter os mesmos limites para não surpreender quem vem do n8n). Para efeitos com outbox, a nova tentativa é do envio e não do nó, respeitando idempotência do provedor (já existe na outbox).
2. "Ao errar": parar (padrão), continuar com a entrada original, ou seguir por uma saída de erro com o objeto de erro.
3. "Fluxo de erro" nas configurações do fluxo, escolhendo outro fluxo publicado do mesmo projeto, com um gatilho "quando outro fluxo falhar". Pacote: execução (id, link, erro, último nó, modo, `retryOf`) e fluxo (id, nome). Não dispara em testes manuais nem em CANCELED por pessoa.
4. Fluxo de erro despublicado: não roda, registrar aviso visível no fluxo monitorado.

---

## 10. Fila, workers e concorrência

### Como o n8n faz

**Observação (leitura direta)** [R2-14]: decisão de enfileirar. No modo fila, execuções de produção vão para o broker; manuais rodam no principal, exceto com `OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS` (a 3.0 remove a opção e manda tudo para workers [B9]). Prioridade do job: execuções "em tempo real" (alguém esperando resposta) têm prioridade maior que as demais.

**Observação (leitura direta)** [R2-17]: o job leva só referências (id da execução, id do fluxo, se carrega dados estáticos, se alguém espera o resultado, projeto). O worker relê tudo do banco. Retenção de jobs concluídos e falhos é configurável.

**Observação (leitura direta)** [R2-17]: parar em modo fila publica um comando para todos os processos; o worker que tem a execução a cancela.

**Observação (leitura direta)** [R2-19]: concorrência (modo normal):
- Duas filas FIFO independentes: produção e avaliação, cada uma com seu limite (`N8N_CONCURRENCY_PRODUCTION_LIMIT`, `N8N_CONCURRENCY_EVALUATION_LIMIT` [B91]). Limite zero é inválido; -1 é ilimitado.
- Entram na fila de produção os modos webhook, gatilho e chat. Ficam fora: erro, sub-fluxo, CLI, interno, manual e repetição.
- No modo fila, este controle fica desligado (a concorrência passa a ser a do worker).
- Ao desligar, a fila é esvaziada; execuções enfileiradas com alguém esperando resposta são canceladas.

**Observação (leitura direta)** [R2-11]: a vaga de concorrência é reservada quando a execução é criada ou retomada e liberada quando a execução termina ou entra em espera.

**Inferência**: execução em espera não ocupa vaga. Responde ao desconhecido do documento 02 ("se execuções em espera contam para a concorrência") [B136]: não contam.

### O que o VEXOR já tem

- Fila em PostgreSQL com `SKIP LOCKED`, lease, token de posse, backoff com teto, várias filas (execuções, inbox, outbox, opt-out) num laço de worker (inventário 9). Sem broker externo.
- Falta: limite de concorrência por organização, prioridade, painel de fila.

### Especificação para o VEXOR

1. Limite de execuções RUNNING simultâneas por organização (produção). A reserva só pega uma execução se a organização tem vaga, contando RUNNING com lease válido. SUSPENDED não conta. Testes manuais e fluxo de erro não contam.
2. Ordem FIFO por organização (`availableAt`, `createdAt`), que já é o índice atual.
3. Prioridade: execuções com alguém esperando resposta HTTP passam na frente.
4. Manter o desenho "job leva só o id, worker relê do banco". Não adotar broker.

---

## 11. Credenciais

### Como o n8n faz

**Observação (leitura direta)** [R2-29]: os dados da credencial são guardados como texto cifrado com AES-256 em modo CBC, chave e vetor derivados da chave da instância (`N8N_ENCRYPTION_KEY` [B135]) com sal aleatório de 8 bytes por gravação, no formato do OpenSSL. Não há autenticação do texto cifrado.

**Observação (leitura direta)** [R2-30]: ao ler uma credencial pela API, campos marcados como senha são trocados por um valor de mascaramento (ou por um marcador de vazio). Tokens OAuth e segredo CSRF sempre saem mascarados. Valores que são expressões não são mascarados. Só quem tem permissão de atualizar a credencial recebe os dados decifrados (mascarados).

**Observação (leitura direta)** [R2-30]: ao atualizar, há três modos de mesclagem: substituir tudo; mesclar parcial (campos enviados sobre os atuais); e "desmascarar" (padrão), em que o valor mascarado enviado de volta significa "manter o valor atual".

**Observação (leitura direta)** [R2-30]: testar credencial existe por id (usa os dados salvos) e com dados enviados (mescla com os salvos; credenciais gerenciadas pela plataforma não aceitam dados enviados). Há também uma "sondagem" separada do teste. Rotas e escopos em [E4].

**Observação (leitura direta)** [R2-31]: OAuth2:
- O início do fluxo gera um segredo CSRF e um estado codificado; o estado do fluxo fica em cache por 5 minutos e é consumido uma única vez no retorno.
- O retorno valida o estado e o CSRF; estado inválido é erro. Há opção de amarrar o fluxo ao navegador que o iniciou; retorno de outro navegador é recusado e gera evento.
- Suporta PKCE e descoberta do recurso do servidor de autorização.
- O token recebe uma data de expiração calculada no recebimento.
- Renovação: serializada por credencial com trava distribuída (espera de até 10 s, lease de 30 s). Antes de renovar, relê a credencial; se o token já mudou desde que o pedido começou, devolve o novo sem renovar de novo. Concessão revogada vira erro "precisa reconectar". Falha ao salvar o token renovado vira erro.
- Existe rota para desconectar o token OAuth de uma credencial (escopo de atualizar credencial) [E4].

### O que o VEXOR já tem

- AES-256-GCM com chave de 32 bytes, credenciais nunca voltam pela API, contas WhatsApp e integrações por organização, OAuth no Google Sheets com testes (inventário 6 e 12). A cifra do VEXOR é mais forte (autenticada).
- Falta: credencial genérica por tipo (chave de API, básica, cabeçalho, OAuth2 livre), mascaramento com "manter valor", teste por id, credencial por projeto, renovação serializada.

### Especificação para o VEXOR

1. Manter AES-256-GCM. Guardar versão da chave em cada credencial para permitir rotação.
2. Leitura devolve campos secretos como um marcador fixo. Na atualização, marcador recebido significa "manter". Campos não secretos voltam em claro.
3. `POST /credentials/:id/test` usa os dados salvos; `POST /credentials/test` aceita dados novos mesclados aos salvos, sem gravar.
4. OAuth2 genérico: estado com CSRF guardado no banco por 5 minutos e consumido uma vez; PKCE; URL de retorno fixa por instância (`/oauth2/callback`); retorno amarrado à sessão que iniciou.
5. Renovação: trava por credencial (advisory lock do PostgreSQL), reler antes de renovar, não renovar se outro processo já renovou, concessão revogada vira estado "precisa reconectar" visível nas integrações.

---

## 12. Histórico de versões e publicar x despublicar

### Como o n8n faz

**Observação (leitura direta)** [R2-24]: cada salvamento que muda nós, ligações ou grupos gera nova versão com id aleatório; mudar configurações não gera versão. Publicar fixa uma versão como ativa; republicar a mesma versão não troca nada. Despublicar zera a versão ativa e registra no histórico de publicação.

**Observação (leitura direta)** [E4]: rotas de histórico: listar versões de um fluxo, ler uma versão, linha do tempo de publicações. Publicar e despublicar têm escopos próprios, separados de atualizar.

**Observação (leitura direta)** [R2-24]: salvar com "publicar se ativo" republica a nova versão automaticamente quando o fluxo já está ativo, com checagem de permissão de publicar. Mudar só configurações de um fluxo ativo reaplica a versão ativa.

**Observação (leitura direta)** [R2-15]: a despublicação pelo sistema (por quebras seguidas) usa o mesmo caminho da despublicação manual, com ator "sistema".

### O que o VEXOR já tem

- Versões imutáveis numeradas, deduplicação de snapshot igual, gatilhos SQL de imutabilidade, histórico na interface (inventário 3.4).
- Falta: despublicar, linha do tempo de publicações, versão ativa separada da última, restaurar versão como rascunho, diff.

### Especificação para o VEXOR

1. Tabela de eventos de publicação (fluxo, versão, evento publicado ou despublicado, ator pessoa ou sistema, motivo, data).
2. `POST /workflows/:id/unpublish` zera a versão ativa, desliga webhooks e agendamentos, registra evento. Execuções em andamento terminam na versão que começaram.
3. "Restaurar como rascunho": copia o snapshot de uma versão para o rascunho, sem publicar.
4. Configurações do fluxo (salvamento, fluxo de erro, tempo limite) ficam fora do snapshot versionado, como no n8n, e valem na hora.

---

## 13. Permissões por escopo de projeto

### Como o n8n faz

**Observação (leitura direta)** [R2-32]: a checagem de acesso funciona assim:
- Se o usuário tem os escopos pedidos no nível global, passa.
- Senão, busca os projetos em que o papel do usuário contém todos os escopos pedidos.
- Para uma credencial ou fluxo, passa se algum compartilhamento do recurso estiver num desses projetos com um papel de recurso que contenha o escopo. Recurso sem compartilhamento: 404.
- Credenciais globais da instância têm regra própria (só leitura ou conexão).

**Observação (leitura direta)** [E4] [R2-33]: escopos usados nas rotas de fluxo: ler, atualizar, excluir (também arquivar e desarquivar), executar, publicar, despublicar e mover. Credencial: criar, ler, atualizar, excluir, mover. Projeto: criar, ler, atualizar, excluir, gerenciar membros.

**Observação (leitura direta)** [R2-13]: as rotas de execução não declaram escopo no decorador. O serviço filtra pela lista de fluxos que o usuário pode acessar; execução de fluxo fora da lista vira 404, nunca 403.

**Observação (leitura direta)** [R2-14] [R2-24]: na execução e na publicação, o servidor confere se o usuário que dispara ou publica tem acesso a todas as credenciais usadas pelos nós. Sem acesso, a execução é criada e falha na hora, e a publicação é recusada.

### O que o VEXOR já tem

- Papéis por organização (titular, editor); só titular publica; isolamento entre organizações com FKs compostas (inventário 3.4 e 10).
- Falta: papéis por projeto, escopos por ação, checagem de acesso a credenciais na publicação.

### Especificação para o VEXOR

1. Papéis por projeto (administrador do projeto, editor, leitor) com escopos por ação: `workflow:read|update|delete|execute|publish|unpublish|move`, `credential:read|update|delete|use`, `execution:read|retry|stop`.
2. Recurso fora do alcance do usuário responde 404, não 403, para não vazar existência.
3. Publicar exige `workflow:publish` e acesso de uso a toda credencial referenciada na versão.
4. Execução disparada por pessoa grava quem disparou; execução de produção roda com o projeto do fluxo como dono.

---

## Desconhecidos

1. Janela exata da consulta de execuções em espera e da consulta de recuperação de fila (ficam no repositório do banco, fora do pacote lido).
2. Se o tempo em espera conta para o tempo limite da execução. A leitura sugere que sim, sem confirmação.
3. Lista exata de estados considerados terminais pelo servidor (a função vem de uma versão do modelo mais nova que a 2.16.0 lida). Inferência: sucesso, erro, quebrada e cancelada.
4. Comportamento do motor novo de execução (o servidor tem um despacho para um "motor v2" com ids próprios e parada própria). Não foi analisado.
5. Nomes das variáveis de ambiente da recuperação de fila (intervalo e tamanho do lote) e da retenção de jobs do broker.
6. Ordem de execução quando há vários gatilhos no mesmo fluxo (continua aberto, como no documento 02).
7. Se o fluxo de erro dispara para execuções quebradas detectadas na recuperação. Os ganchos de fim rodam na recuperação por log, então provavelmente sim, mas não foi confirmado.
8. Formato do pacote de erro quando a origem é sub-fluxo.
9. Comportamento em execução real de qualquer item acima: nada foi executado (regra de memória da máquina). Tudo é análise estática.

---

## Ledger R2

Evidências REA gravadas na sessão do MCP `rea` (REA 6.7.0), alvo `D:\VEXOR\_ref\n8n\pkg\n8n-2.45.5\package\dist`, sha256 do diretório `ab3826baf77b83472e0cf12b9660eb09d08773904d0dc2a4beb23a64cefc7892`. Leituras diretas sobre os mesmos pacotes, sem execução.

| Id | Ferramenta | Alvo | evidence_id | O que mostrou |
| --- | --- | --- | --- | --- |
| R2-1 | leitura direta | `wait-tracker.js` | n/a | rastreador só no líder, varredura de 60 s, temporizador por execução, retomada com guarda de estado, retomada de pai de sub-execução com 3 tentativas |
| R2-2 | REA `analyze_javascript_application` | 10 arquivos: executor, execuções ativas, rastreador de espera, recuperação, quebra, recuperação de enfileiradas, ganchos de ciclo de vida, salvar progresso, configurações de salvamento, fluxo de erro; heap 512 MB, `detail: summary` | `ev_0f607cdd0cce8f8f4e752fc4e4a6968a7a32aae3620fcb9ebc31026a92b33de3` (resumo `ev_b902c579ff4f8d5cabbcd9e261641a564c50fce06d6114c5f3cca58af540a51e`) | 10 arquivos sem falha de parse, 321 achados, 14.699 nós de AST; cobertura parcial |
| R2-3 | REA `trace_application_feature` e `trace_javascript_semantics` | semente literal "crashed" sobre R2-2 | `ev_25960236bee8cc702e5e890256afdcc2b0158f7738cc402e02cb3640e5656c60`, `ev_79a552cb0af404b07e3829afa824b0870e769a7d79f723abb59405d07653582c` | sem casamento; literais dentro de listas não são indexados (não prova ausência) |
| R2-4 | REA `inspect_analysis_view` (`javascript-facts`) | `wait-tracker.js` em R2-2 | `ev_01c0cc4a13d6bc0715453f503e60f7273ea3c278a6f3bd6b7b493b6845289f1f` | 23 fatos: dependências do módulo (persistência, executor, publicação) e um único serviço exportado |
| R2-5 | REA `trace_javascript_semantics` | propriedade "aguardar até" em R2-2 | `ev_9ffc249d0692566001c8bf26c30309731d677937f8aa7d8266fb48d5ad01a088` | 8 pontos de leitura em ganchos de ciclo de vida, executor e recuperação |
| R2-6 | REA `analyze_javascript_application` | 14 arquivos: gerenciador de fluxos ativos, execução manual, concorrência, fila, processador de jobs, parada em fila, serviço de execuções, webhooks de teste e de espera, credenciais, OAuth, checagem de acesso, serviço de fluxos; heap 512 MB | `ev_8312e0661a6bd0cf09a2bd66dc8940db78116b0e412ea5f00a659d17efc0cc6d` (resumo `ev_c72ef7767040b0e6884bb2834ae8240e398cadbf360c2fe12efd0063b34fc9b2`) | 14 arquivos sem falha de parse, 668 achados, 45.271 nós de AST; cobertura parcial |
| R2-7 | REA `trace_javascript_semantics` | propriedade do intervalo de reativação em R2-6 | `ev_ab176ea39c3e1de35dc292c94178d7412660cf35a70a21d8aa0bbed4f50a39b2` | leitura e escrita do intervalo na fila de reativação do gerenciador de fluxos ativos |
| R2-8 | REA `trace_javascript_semantics` | propriedade da guarda de estado em R2-6 | `ev_c73607a3af1a62c4652cbe48e59e82c24c9f7d1cae153a1ae31fb28ea145b4d6` | sem casamento (chave de objeto literal passada como argumento não vira slot); não prova ausência |
| R2-9 | REA (existente, E2b) | módulo de estados do `n8n-workflow` | `ev_4d0f892edec1f2c5afcbb115a100c5258feee64009682a428d5fc829edd50e3c` | página do módulo de estados de execução (reaproveitada, não regerada) |
| R2-10 | leitura direta | `n8n-workflow` `dist/cjs/execution-status.js` e constantes | n/a | oito estados; data sentinela de espera sem prazo no ano 3000 |
| R2-11 | leitura direta | `active-executions.js` | n/a | criação "nova" x retomada "em execução", reserva de concorrência, guarda de estado na retomada, parada, desligamento com prazo de 3 s |
| R2-12 | leitura direta | `execution-lifecycle/` (ganchos, estado final, configurações de salvamento, salvar progresso) | n/a | regra do estado final, o que salvar por modo, exclusão lógica de manuais, progresso por nó com guarda |
| R2-13 | leitura direta | `executions/execution.service.js` | n/a | repetir (recusas, original x atual, remoção do resultado falho), parar e parar em lote, estados paráveis, exclusão |
| R2-14 | leitura direta | `workflow-runner.js` | n/a | enfileirar x rodar local, prioridade, tempo limite com teto e desconto, dados fixados só em manual, checagem de credenciais, travado vira quebrada |
| R2-15 | leitura direta | `executions/execution-recovery.service.js`, `execution-crash.service.js` | n/a | recuperação por log de eventos, quebra com detector, desativação automática por quebras seguidas |
| R2-16 | leitura direta | `executions/enqueued-execution-recovery.service.js` | n/a | reinício de execuções "nova" na partida, quebra por dados ilegíveis ou falha ao iniciar |
| R2-17 | leitura direta | `scaling/scaling.service.js`, `job-processor.js`, `execution-stop.service.js` | n/a | job só com referências, retenção, recuperação de fila por comparação banco x broker, worker ignora quebrada, comando de parada |
| R2-18 | leitura direta | `n8n-core` `execution-engine/workflow-execute.js` | n/a | tentar de novo (2 a 5, 0 a 5 s), continuar, saída de erro, nó falho volta à pilha, dados fixados substituem o nó |
| R2-19 | leitura direta | `concurrency/concurrency-control.service.js` | n/a | filas FIFO de produção e avaliação, modos que contam, desligado no modo fila |
| R2-20 | leitura direta | `manual-execution.service.js` | n/a | três caminhos de execução manual |
| R2-21 | leitura direta | `n8n-core` execução parcial e `partial-execution-utils/` | n/a | algoritmo de subgrafo, nós sujos, nós de partida, ciclos |
| R2-22 | leitura direta | `n8n-nodes-base` nó de espera; `n8n-core` contexto de execução | n/a | limiar de 65 s para espera dentro do processo; espera de sub-fluxo põe o pai em espera sem prazo |
| R2-23 | leitura direta | `webhooks/waiting-webhooks.js` | n/a | retomada por webhook com token em tempo constante e respostas 401, 404, 409 |
| R2-24 | leitura direta | `workflows/workflow.service.js` | n/a | quando gera versão, soma de verificação, passos de publicar, despublicar, republicar ao salvar |
| R2-25 | leitura direta | `active-workflow-manager.js`, `constants.js` | n/a | ativação pela versão ativa, registro de webhooks, líder, reativação com espera de 1 s dobrando até 24 h, falha de gatilho em produção |
| R2-26 | leitura direta | `webhooks/test-webhooks.js`, `constants.js` | n/a | webhook de teste 2 min padrão, 10 min máximo, folga de 30 s |
| R2-27 | leitura direta | `scheduling/durable-scheduler.js`, tratador do gatilho de agendamento, persistência de execuções | n/a | agendador durável com lease, avisos de configuração, chave de deduplicação por ocorrência |
| R2-28 | leitura direta | `execution-lifecycle/execute-error-workflow.js`, `workflows/workflow-execution.service.js` | n/a | regras de disparo do fluxo de erro, pacote do erro, exige versão publicada, bloqueio por política de sub-fluxo |
| R2-29 | leitura direta | `n8n-core` `encryption/cipher.js`, `credentials.js` | n/a | AES-256-CBC com sal de 8 bytes e derivação no formato OpenSSL |
| R2-30 | leitura direta | `credentials/credentials.service.js` | n/a | mascaramento, modos de mesclagem, teste por id e com dados, sondagem |
| R2-31 | leitura direta | `oauth/oauth.service.js`, `oauth/types.js` | n/a | estado CSRF de 5 min consumido uma vez, amarração ao navegador, PKCE, renovação serializada com trava |
| R2-32 | leitura direta | `permissions.ee/check-access.js` | n/a | escopo global, papéis por projeto, compartilhamento de recurso, 404 para recurso sem compartilhamento |
| R2-33 | leitura direta | `evidence/n8n-rest-interno.csv` [E4] | n/a | contagem de escopos por recurso nas rotas; rotas de execução sem escopo declarado; rotas de histórico |
