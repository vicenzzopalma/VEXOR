# Rodada de usabilidade e banco SaaS, 26/10/2026

## Coordenação e contexto

Trabalho dividido entre os dois terminais Codex já existentes no Orca, supervisionados pelo run `run_a940e2529f80`. A primeira onda tratou janelas e leads; a segunda trata concorrência persistente e sua interface. Arquivos com alterações anteriores foram preservados. Não houve commit, push, deploy ou chamada a provedor.

Contexto consultado: `docs/progress.md`, catálogo de referências e notas `D:/OBSIDIAN/000 - MASTER_CONTEXT.md`, `projetos/CLAUDE.md`, `projetos/vexor.md` e `projetos/vexor-snapshot.md`. O snapshot de 20/10 registra fase 5.1; o repositório já registra 6A. Não há ferramenta Obsidian exposta nesta sessão; a tentativa de inicialização do MCP local em `127.0.0.1:27201/mcp` não conectou. A leitura das notas foi feita pelo sistema de arquivos.

## Fase UX1: janelas

Dialog compartilhado controla pilha, foco, Tab/Shift+Tab e Escape. Janelas inferiores ficam inertes e fora da árvore acessível enquanto a superior está aberta. Eventos de teclado não chegam aos atalhos do canvas, mantendo edição nativa dos campos. O editor também verifica a presença de janela modal antes de executar atalhos. O foco volta ao acionador conectado ao fechar.

Quatro E2E focais passaram em desktop/celular. O teste de sobreposição abre o segundo portal programaticamente, pois o backdrop impede corretamente clicar no acionador inferior.

## Fase UX2: detalhes e histórico

Respostas antigas não substituem o lead mais recentemente solicitado. Há carregamento cancelável; fechamento invalida a solicitação pendente. Alterações não salvas exigem confirmação de descarte. Salvamento bloqueia fechamento e edição concorrente na mesma janela. Polling de execuções limpa o erro ao recuperar a conexão e ignora respostas de efeitos encerrados.

Quatorze cenários de contrato de interface foram aprovados em execuções complementares de desktop/celular. Respostas interceptadas exercitam a interface e não comprovam persistência ou RBAC do servidor. A validação final consolidada deve incluir as mudanças da segunda onda.

## Navegação do editor

Ao salvar antes de seguir um link, o destino preserva query e fragmento. Cliques modificados, downloads e links com outro alvo mantêm seu comportamento. Dois E2E focais passaram, incluindo consulta ao registro persistido. A proteção específica de Voltar/Avançar durante o debounce do autosave continua pendente; esta alteração cobre cliques em links.

## Fase DB1 e DB2

Migração aditiva `202610260015_lead_revision` aplicada localmente. PostgreSQL é dono da revisão do lead e incrementa o contador em toda atualização, inclusive SQL direto e worker. PATCH exige a revisão lida pelo cliente e compara ID, organização da sessão e revisão na mesma atualização. Conflito retorna 409. A interface deve manter campos locais e oferecer recarregamento explícito.

Auditoria e próximas fatias: [database-saas-audit.md](database-saas-audit.md). A migração não converte o ambiente local em operação SaaS homologada.

## Verificação da rodada

- Build inicial completo, lint, typecheck e 91 unitários passaram.
- Primeira integração: 81 aprovados e sete falhas com worker automático ativo, disputando jobs que os testes reservam explicitamente. Ambiente reiniciado com `RUN_WORKER=false` para repetição controlada.
- `npm run db:generate` passou. `npm run db:migrate` isolado falhou por `DATABASE_URL` ausente; o início seguinte por `npm run dev` forneceu o destino local e aplicou a migração 15 com sucesso.
- Verificação final de lint, typecheck e 91 unitários passou após as mudanças de aplicação.
- `npm run test:e2e -- --output=.local/e2e-final`: 41 aprovados e um arraste exclusivo de desktop ignorado no celular, em 2,9 minutos. Inclui os testes novos e as jornadas existentes.
- Repetição de integração após a migração: 91 aprovados e três falhas; duas eram expectativas antigas de 14 migrações, embora replay e schema diff já estivessem corretos, e a terceira ocorreu enquanto E2E também consumia as filas do mesmo banco. Corrigidas as duas contagens para 15. Repetição serial final de `npm run test:integration`: **94 aprovados em 12 arquivos, 57,27 s**, incluindo replays isolados sem schema diff. Não houve reset do banco da aplicação.
- Os quatro dispatches das duas ondas concluíram com sucesso. Terminais preexistentes permaneceram disponíveis; o Orca não identificou workers pendentes de decisão de liberação.
- `npm run build` final após a migração passou em pacotes, Prisma, worker, API e web, com API/web parados para liberar a DLL Prisma no Windows.

## Limites

Sem homologação externa, carga representativa, RLS implantado, pool de produção ou recuperação de backup comprovada nesta rodada. A listagem comercial ainda limita a 100 leads; paginação e filtros no servidor são próximos passos. Não se afirma prontidão para SaaS público a partir de testes locais.
