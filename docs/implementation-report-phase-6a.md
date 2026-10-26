# Fase 6A — Workflows duráveis

## Integridade da Fase 5.2

A verificação inicial encontrou os quatro artefatos: migração `202610200013_phase52_historical_integrity`, `tests/integration/historical-integrity.test.ts`, `docs/implementation-report-phase-5-2.md` e `docs/phase6-technical-plan.md`. Todos aparecem em `git ls-files` nesta revisão. O `monstro.txt` anterior foi gerado em 20/10/2026 com 159 arquivos e estava desatualizado; não houve evidência de perda desses arquivos.

O Git inicialmente não estava no PATH do sandbox. Foi localizado o Git incluído no Visual Studio e executado `git status --short`. A alteração em `scripts/dev.mjs` já existia e foi preservada. Arquivos novos desta implementação permanecem não rastreados até o responsável adicioná-los ao Git; nenhum commit foi criado.

O banco principal tinha 13 migrações concluídas, sem rollback e com todos os checksums correspondentes aos arquivos. A auditoria inicial contou 19 tabelas e 5.457 registros. Os sete testes históricos passaram antes da implementação, incluindo replay isolado das 13 migrações. O diff do banco principal também estava vazio. Nenhuma migração anterior foi editada, nenhum reset foi executado.

O gerador agora percorre diretamente `apps`, `packages`, `scripts`, `tests`, `docs`, `TEMPLATES` e configurações de código na raiz. Inclui fontes não rastreados, ordena a saída e falha se não conseguir ler um arquivo selecionado. Exclui `.env*`, arquivos de credenciais, configurações privadas como `.npmrc`, dados locais, links simbólicos/junctions, dependências, builds, logs, relatórios temporários e binários. Um teste usa uma árvore temporária sem Git para conferir inclusão e exclusão.

## Arquitetura

O interpretador compartilhado ganhou execução por segmentos. Uma execução real chega ao WAIT, calcula o próximo nó do snapshot, captura o contexto permitido e devolve uma suspensão ao runtime. A simulação permanece instantânea e sem efeitos externos.

Na mesma transação PostgreSQL, o runtime grava efeitos locais, etapas, checkpoint e `Execution.status=SUSPENDED`, removendo `leaseToken` e `leaseUntil`. A falha ao gravar o checkpoint reverte todo o segmento. O worker volta imediatamente ao polling e pode processar outros jobs. Nenhuma espera de negócio usa `setTimeout` longo; os timers em memória são apenas o polling curto dos serviços e das interfaces.

Cada polling chama `resumeDueExecution`: seleciona a execução vencida com `FOR UPDATE OF e SKIP LOCKED`, marca o checkpoint READY e muda SUSPENDED para QUEUED atomicamente. A reserva seguinte usa o lease e token de posse existentes. O checkpoint READY só é consumido na transação que confirma o segmento retomado; uma queda anterior deixa o estado recuperável. Dois workers ou uma chamada concorrente à API não conseguem confirmar a mesma retomada.

`segmentAttempt` limita falhas consecutivas do segmento, enquanto `attempt` e `attemptHistory` mantêm a contagem global. Isso permite mais de três WAITs sem esgotar artificialmente as tentativas. O horário inicial da execução é preservado; a duração total inclui o período suspenso.

## Persistência e migração

Migração aditiva `202610210014_phase6a_durable_wait`:

- Valor SUSPENDED no enum e coluna `segmentAttempt` em Execution.
- Tabela ExecutionCheckpoint com execução, organização, workflow, versão, nó da espera, próximo nó, estado, previsão UTC, expiração opcional, revisão e horários de suspensão/retomada/consumo.
- FK composta para `(execution_id, organization_id, workflow_id, version_id)` impede vínculos cruzados e mantém a versão exata.
- Índice parcial garante um único checkpoint WAITING/READY por execução. Índices atendem o agendador e consultas por organização.
- Gatilhos validam transições, proíbem lease em execução suspensa, impedem troca da versão após checkpoint e exigem um checkpoint na confirmação da suspensão.

O PostgreSQL truncou dois nomes longos de objetos. O Prisma recebeu `map` com os nomes efetivos; a migração aplicada não foi reescrita. O diff passou novamente sem diferenças.

## Estados e transições

| Origem    | Destino            | Condição                                            |
| --------- | ------------------ | --------------------------------------------------- |
| QUEUED    | RUNNING            | Reserva atômica com token de posse                  |
| RUNNING   | SUSPENDED          | Segmento e checkpoint confirmados juntos            |
| SUSPENDED | QUEUED             | Checkpoint vencido marcado READY na mesma transação |
| RUNNING   | COMPLETED / FAILED | Conclusão / falha da etapa ou contexto              |
| RUNNING   | QUEUED             | Falha transitória com rollback e retry limitado     |
| QUEUED    | FAILED             | Tentativas esgotadas                                |
| SUSPENDED | FAILED             | Prazo opcional de retomada expirado: WAIT_EXPIRED   |

O modelo anterior não prevê cancelamento; nenhum estado ou endpoint de cancelamento foi inventado. Estados de checkpoint: WAITING, READY, CONSUMED, EXPIRED e FAILED. A revisão é incrementada nas mudanças de estado. Erros de recuperação ficam em códigos sanitizados.

## Contratos, segurança e interface

WAIT aceita o formato legado `{minutes}`, intervalos inteiros em segundos, minutos, horas ou dias (até 366 dias), ou data ISO 8601 com `Z`/offset explícito. Datas inválidas ou passadas falham; horários sem fuso são rejeitados. Datas absolutas são instantes, sem recorrência ou regras implícitas de horário de verão. `resumeDeadlineMinutes`, opcional no contrato, limita quanto atraso a retomada tolera; sem ele, uma execução vencida continua elegível após indisponibilidade prolongada.

Checkpoints não recebem contas, credenciais ou payloads arbitrários. O contexto do lead é validado por schema; mensagem e telefone são removidos se não forem referenciados adiante. Saídas anteriores são limitadas à allowlist de variáveis e às referências ainda necessárias. Os endpoints retornam apenas metadados do checkpoint, nunca `state`.

`POST /executions/:id/resume` exige sessão, papel owner/editor, origem permitida e organização resolvida pela membership. Apenas solicita a retomada de uma espera já vencida; não antecipa timers. Inexistente ou outra organização retorna 404; papel insuficiente retorna 403; sem sessão, 401; execução sem espera vencida, 409. O agendamento automático depende exclusivamente do banco e do worker, sem depender da API permanecer ativa.

Editor e histórico distinguem execução real e simulação, mostram Aguardando, previsão local de continuidade, etapa da espera, etapas anteriores, suspensão, retomada e códigos de recuperação. Consultas periódicas atualizam o painel. A composição de navegação, biblioteca, canvas e inspetor foi preservada, usando Inter, Lucide e tokens existentes.

## Verificações e evidências

| Comando                                                           | Resultado observado                                                                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                                                   | Passou com pacotes, Prisma, worker, Nest e Next                                                                                     |
| Builds finais por workspace (`build:packages`, worker, API e web) | Passaram após as alterações finais, sem interromper os serviços do outro terminal                                                   |
| `npm run lint`                                                    | Passou, zero warnings                                                                                                               |
| `npm run typecheck`                                               | Passou                                                                                                                              |
| `npm test`                                                        | 86 testes passaram                                                                                                                  |
| `npm run test:integration`                                        | 83 testes passaram com API/PostgreSQL locais e workers em processos separados                                                       |
| `npm run test:e2e`                                                | 13 casos validados: 11 da suíte existente e os 2 novos em reexecução focalizada; 1 arraste exclusivo de desktop ignorado no celular |
| `node scripts/verify-phase52-integrity.mjs`                       | 14 migrações concluídas, nenhum rollback, todos os checksums íntegros                                                               |
| `prisma migrate diff ... --exit-code`                             | Nenhuma diferença no banco principal e no replay isolado                                                                            |
| `npm run monstro`                                                 | 176 arquivos, incluindo fontes novos ainda não rastreados                                                                           |

Os dez testes de integração novos cobrem suspensão curta, retomada automática, reinicialização durante a espera, dois workers concorrentes, idempotência, recuperação de READY/lease antigo, variáveis e saídas anteriores, publicação e arquivamento durante a espera, organização/RBAC/inexistência, expiração, rollback por falha injetada na persistência e transições inválidas. Quatro WAITs consecutivos comprovam que a contagem de tentativas não inviabiliza workflows longos. As datas, offsets e configurações inválidas também têm testes unitários do contrato usado pelo servidor.

As primeiras rodadas encontraram: banco temporariamente indisponível, restrição `os.userInfo` do sandbox, DLL Prisma em uso e interferência de um worker de desenvolvimento iniciado em outro terminal. Após estabilizar a execução dos processos, a regressão de integração passou integralmente. O teste histórico de TRUNCATE agora esvazia os eventos dos gatilhos adiados antes de exercitar a guarda histórica; a proteção original continua sendo verificada diretamente. A preparação móvel do E2E fecha o inspetor antes de selecionar o bloco e mantém a execução de teste indisponível na fila até a interface estar pronta. Uma rodada de navegador foi interrompida com o encerramento do Next. Na rodada completa seguinte, 11 testes passaram, 1 foi ignorado e os 2 novos falharam por um seletor de label de select; corrigido para o nome acessível do combobox. A reexecução `npm run test:e2e -- tests/e2e/durable-wait.spec.ts --reporter=line` passou nos dois projetos (32,5 s). Portanto, a aprovação dos 13 casos foi obtida em duas execuções complementares, sem tratar a rodada completa com falhas como aprovada. Capturas de desktop e celular em `docs/validation/phase6a-editor-*.png` foram inspecionadas visualmente.

### Demonstração operacional de 30 segundos

Executado `node --import tsx scripts/demo-durable-wait.ts`, sem chamar o interpretador no script e sem provedores externos. O script usa a API autenticada e processos do worker da aplicação. A atualização do lead utiliza o bloco existente de atribuição, que grava responsável e status QUALIFIED; a conclusão gera um aviso interno AVAILABLE.

Evidência sanitizada: [phase6a-durable-restart.json](validation/phase6a-durable-restart.json).

| Evidência persistida      | Valor                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| Execução                  | `3d1d448e-e856-4f46-ab23-6eb941329b7e`                                                              |
| Versão original           | `b06bdcc8-9b96-4272-ac1b-b282b76f44e9`                                                              |
| Suspensão                 | 21/10/2026 13:53:28.712, Brasília                                                                   |
| Previsão de retomada      | 13:53:58.705                                                                                        |
| Reinício durante a espera | 13:53:29.400; PID 17656 → 13072                                                                     |
| Retomada persistida       | 13:53:59.096                                                                                        |
| Conclusão                 | 13:53:59.181                                                                                        |
| Liberação do worker       | Lease nulo; outra execução concluída às 13:53:29.308 enquanto a original continuava suspensa        |
| Efeitos                   | Uma etapa de etiqueta, o mesmo ID antes/depois, lead QUALIFIED, um aviso interno AVAILABLE          |
| Histórico                 | Cinco etapas, checkpoint CONSUMED e versão original preservada após publicação de v2 e arquivamento |

Não há alegação de entrega de mensagens: a notificação desta demonstração é interna. O script salva somente identificadores, estados, horários e metadados necessários à comprovação, sem credenciais ou valores pessoais do lead.

## Limitações e impacto

- A retomada ocorre no primeiro polling disponível após o instante previsto, sem garantia de precisão de tempo real. Indisponibilidade do banco ou de todos os workers atrasa o processamento.
- Efeitos locais e registros de outbox são transacionais. A garantia de entrega única a provedores externos continua dependente da idempotência/conciliação dos adapters existentes; esta fase não homologa provedores e não realiza envios externos.
- Dados de negócio necessários ao contexto permanecem no PostgreSQL, protegidos pelo escopo organizacional. Não há nova política de retenção/expurgo de checkpoints nesta fase.
- O limite anterior de 20 segundos por transação continua aplicável a cada segmento ativo, sem abranger a espera.
- Arquivamento preserva execuções iniciadas e seus snapshots. Novas versões não alteram execuções suspensas.
- Windows exige parar processos que carregam a DLL Prisma antes de regenerar o cliente. O sandbox também impediu `os.userInfo` em `tsx`/embedded-postgres; testes com subprocessos foram executados fora dele.
- Fixtures locais de verificação são aditivas e permanecem no banco. Nenhum dado existente foi apagado.

## Preparação para a Fase 6B

O mecanismo oferece checkpoint versionado, revisão, agendamento e consumo cercado por token de posse para extensões futuras. Aprovação humana e sub-workflows não foram implementados. Uma próxima fase deve especificar autorização, sinais de retomada, auditoria e contratos próprios antes de reutilizar essas primitivas.
