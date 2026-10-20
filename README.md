
# EIMAX Studio

Primeira entrega local: editor React Flow, API NestJS, PostgreSQL/Prisma, versões imutáveis e simulação pelo interpretador compartilhado. Não é um SaaS em produção.

## Iniciar no Windows

Pré-requisito: Node.js 22.13+ recomendado e npm. Também validado neste ambiente com Node 20.18; o lint emite um aviso de engine de dependência transitiva nessa versão, mas executa. Não é necessário instalar PostgreSQL, Redis ou Docker globalmente.

```powershell
npm ci
npm run dev
```

Acesse **http://localhost:3000/editor/starter-sdr**. O comando compila os contratos, gera o Prisma, inicia um PostgreSQL local em `127.0.0.1:55432`, aplica migrações e inicia API (`4000`) e Next (`3000`). Dados persistem em `.local/postgres`. Ctrl+C encerra os processos iniciados por esse comando, sem apagar projetos. No Windows Administrador, pg_ctl inicia o servidor com privilégios restritos, sem criar conta ou serviço Windows.

Não execute duas instâncias do comando nas mesmas portas. Para usar um PostgreSQL já existente, copie `.env.example` para `.env`, configure `DATABASE_URL` e `USE_EXTERNAL_DATABASE=true`. Nesse modo o script não inicia nem encerra seu servidor de banco. A base indicada deve ser dedicada a este projeto.

## Experimentar o editor

1. Abra o modelo SDR inicial ou visite `/templates` e clique em **Usar este modelo** para criar uma cópia.
2. Selecione a condição. Configure orçamento mínimo e personalize os demais blocos no painel direito.
3. Arraste ou clique em blocos da biblioteca. Conecte alças inferiores às entradas superiores. A condição tem saídas Sim/Não. Selecione uma aresta para excluir ou arraste sua ponta para reconectar.
4. Use desfazer/refazer, Ctrl D, Delete, seleção múltipla com Shift e organização automática. Os rascunhos são salvos automaticamente; recarregue para verificar.
5. Clique em **Testar**, altere o orçamento do lead e simule. Consulte entradas/saídas de cada etapa no console ou em `/execucoes`.
6. Clique em **Publicar** para preservar uma versão. Consulte **Histórico de versões**. Alterações posteriores afetam somente o rascunho.

Publicação **não executa ações externas**. Simulação avalia condições e conexões no servidor com o interpretador que receberá adapters reais na fase 2. E-mail, SDR, espera, etiquetas e notificações têm efeitos substituídos por adapters de simulação. A animação apresenta o caminho calculado; os logs guardam o resultado real da interpretação.

## Empresas e permissões nesta fase

Há duas organizações de desenvolvimento e memberships owner/editor/viewer. Tokens opacos locais são gerados em `.local/development-sessions.json`; apenas seus hashes ficam no banco. O navegador recebe automaticamente um cookie HttpOnly do proprietário local. Não há seleção arbitrária de empresa pelo cliente: o servidor resolve a membership e aplica escopo e permissão em todas as rotas protegidas. Versões e simulações têm `organization_id` e chaves estrangeiras compostas.

Isso permite testar isolamento e RBAC desde já, mas não substitui cadastro, login ou uma sessão de produção. API e interface escutam apenas loopback; a API recusa NODE_ENV=production. Não exponha este ambiente na internet. Não publique tokens ou a pasta `.local`.

## Verificação

Com `npm run dev` ativo em outro terminal:

```powershell
npm run build
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
```

Playwright usa o Microsoft Edge instalado (`channel: msedge`). Se não houver Edge, instale o navegador de desenvolvimento local com `npx playwright install chromium` e ajuste o channel em `playwright.config.ts`. Screenshots e testes estão em `docs/validation/`, `tests/` e `playwright-report/`.

No Windows, se o Prisma não puder regenerar um engine em uso, encerre o dev com Ctrl+C, rode o build e inicie o dev novamente. Não apague a base para resolver um conflito de porta.

## Documentação

- [Arquitetura](docs/architecture.md) e [contrato da API](docs/api.md)
- [Design system](docs/design-system.md) e [referências analisadas](docs/design-references.md)
- [Especificação](docs/product-spec.md), [roadmap](docs/roadmap.md) e [progresso/testes](docs/progress.md)

Pendente: autenticação completa, CPF/verificações, trial, pagamentos, dashboard comercial completo, integrações reais, webhook de entrada autenticado, Redis/BullMQ e recuperação de workers. Compartilhamento aparece indisponível com explicação. Não houve contratação ou deploy.
