# Relatório de Implementação — Fase 5.2 | Integridade Histórica e Preparação da Fase 6

**Data**: 20/10/2026  
**Ambiente**: PostgreSQL 18 Local (porta 55432), Node.js v24.16.0, NestJS 11, Next.js 16 (React 19), Prisma 6.19.3.  
**Estado da Base**: 19 tabelas, 4.191 registros históricos preservados, zero perda de dados, zero resets.

---

## 1. Vulnerabilidade Original e Sua Correção

### Diagnóstico
Na auditoria da Fase 5.1, identificou-se uma lacuna crítica na preservação de versões publicadas de processos:
1. **Trigger incompleto**: A tabela `WorkflowVersion` possuía apenas o gatilho `BEFORE UPDATE`, impedindo modificações, mas permitindo comandos diretos de `DELETE FROM "WorkflowVersion"`.
2. **Cascata destrutiva na Chave Estrangeira**: A relação `WorkflowVersion` → `Workflow` foi originalmente definida com `ON DELETE CASCADE`. Se um workflow fosse excluído fisicamente, todas as suas versões publicadas históricas eram eliminadas silenciosamente em cascata, sem disparar erros.
3. **Ausência de proteção contra `TRUNCATE`**: Comandos de `TRUNCATE` não disparam gatilhos em nível de linha (`FOR EACH ROW`), permitindo expurgo completo sem bloqueio.
4. **Ausência de mecanismo de arquivamento lógico**: Não havia coluna para arquivar workflows, forçando o sistema a manter processos descontinuados como ativos ou arriscar exclusão.

### Solução Implementada
1. **Chave Estrangeira com Restrição Estrita**:
   - `WorkflowVersion_workflowId_organization_id_fkey` alterada de `ON DELETE CASCADE` para `ON DELETE RESTRICT ON UPDATE NO ACTION`.
   - Tentativas de apagar o workflow pai são rejeitadas pelo PostgreSQL se houver qualquer versão publicada vinculada.
2. **Gatilho de Linha Imutável Expandido**:
   - Função `prevent_version_mutation()` atualizada para tratar `UPDATE` e `DELETE`.
   - Gatilho `immutable_workflow_version` agora é `BEFORE UPDATE OR DELETE ON "WorkflowVersion" FOR EACH ROW`.
3. **Gatilhos em Nível de Instrução contra TRUNCATE**:
   - `immutable_workflow_version_truncate`: `BEFORE TRUNCATE ON "WorkflowVersion" FOR EACH STATEMENT` aborta qualquer tentativa de truncar versões publicadas.
   - `protect_workflow_truncate`: `BEFORE TRUNCATE ON "Workflow" FOR EACH STATEMENT` impede truncar workflows se existirem versões publicadas.
4. **Proteção contra Exclusão no Workflow Pai**:
   - `protect_published_workflow_deletion`: `BEFORE DELETE ON "Workflow" FOR EACH ROW` verifica a existência de versões e orienta explicitamente o uso de arquivamento.
5. **Arquivamento Lógico Integrado**:
   - Adicionada coluna `archivedAt TIMESTAMP(3)` na tabela `Workflow` com índice composto `[organization_id, archivedAt]`.
   - Endpoints `POST /workflows/:id/archive` e `POST /workflows/:id/unarchive` com RBAC de proprietário (`owner`).
   - Bloqueio de alterações (`save`) e publicações (`publish`) em processos arquivados até que sejam formalmente desarquivados.

---

## 2. Arquivos Alterados e Criados

| Arquivo | Ação | Descrição |
|---|---|---|
| `packages/database/prisma/schema.prisma` | Modificado | Adicionado `archivedAt` e índice em `Workflow`; FK de `WorkflowVersion` alterada para `onDelete: Restrict`. |
| `packages/database/prisma/migrations/202610200013_phase52_historical_integrity/migration.sql` | Criado | Migração não-destrutiva com FK `RESTRICT`, gatilhos de `UPDATE`, `DELETE`, `TRUNCATE` e coluna `archivedAt`. |
| `apps/api/src/workflows/workflow.service.ts` | Modificado | Métodos `archive`, `unarchive`, bloqueio de salvamento/publicação de arquivados e inclusão de `archivedAt` no `list()`. |
| `apps/api/src/workflows/workflow.controller.ts` | Modificado | Rotas autenticadas `POST /workflows/:id/archive` e `POST /workflows/:id/unarchive`. |
| `apps/web/lib/api.ts` | Modificado | Tipagem de `WorkflowRecord` atualizada com `archivedAt?: string \| null`. |
| `apps/web/components/listings.tsx` | Modificado | Exibição do estado `Arquivado` na listagem de processos. |
| `scripts/development-sessions.mjs` | Modificado | Geração e persistência de `CONNECTOR_ENCRYPTION_KEY` para sessões de desenvolvimento locais. |
| `scripts/verify-migration-replay.mjs` | Modificado | Suporte à flag `--label=phase52`, auditoria dos gatilhos de `WorkflowVersion` e `Workflow`. |
| `tests/integration/historical-integrity.test.ts` | Criado | Suíte com 7 testes reais em PostgreSQL cobrindo todos os requisitos obrigatórios da Fase 5.2. |
| `tests/integration/database-integrity.test.ts` | Modificado | Ajustada expectativa de contagem para 13 migrações. |
| `docs/phase6-technical-plan.md` | Criado | Especificação arquitetural, contratos, diagrama de estados e plano técnico da Fase 6. |
| `docs/progress.md` | Modificado | Registro das verificações e status da Fase 5.2. |
| `README.md` | Modificado | Sincronização da documentação geral, removendo pendências já concluídas. |

---

## 3. Evidências dos Testes Negativos de Exclusão

Suíte executada em `tests/integration/historical-integrity.test.ts` contra o PostgreSQL real:

1. **UPDATE de versão publicada**:
   - Operação: `UPDATE "WorkflowVersion" SET "snapshot" = '{"hacked": true}'::jsonb WHERE id = ...`
   - Resultado: **BLOQUEADO**. Exceção gerada: `Published workflow versions are immutable and cannot be updated`.
2. **DELETE de versão publicada**:
   - Operação: `DELETE FROM "WorkflowVersion" WHERE id = ...`
   - Resultado: **BLOQUEADO**. Exceção gerada: `Published workflow versions are immutable and cannot be deleted`.
3. **Exclusão do workflow pai**:
   - Operação: `DELETE FROM "Workflow" WHERE id = ...`
   - Resultado: **BLOQUEADO**. Rejeitado por chave estrangeira `RESTRICT` e gatilho `protect_published_workflow_deletion`. Versão e workflow permanecem íntegros.
4. **Tentativas de TRUNCATE**:
   - Operação: `TRUNCATE TABLE "WorkflowVersion" CASCADE` e `TRUNCATE TABLE "Workflow" CASCADE`.
   - Resultado: **BLOQUEADO**. Exceção gerada: `Published workflow versions cannot be truncated`.
5. **Arquivamento lógico**:
   - Operação: `UPDATE "Workflow" SET "archivedAt" = NOW() WHERE id = ...`
   - Resultado: **SUCESSO**. Processo marcado como arquivado; versão publicada, histórico de execuções (`Execution`) e leads vinculados permanecem 100% preservados e legíveis. Desarquivamento restaura status normalmente.
6. **Isolamento de Tenants**:
   - Operação: Tenant B tenta referenciar ou alterar versão pertencente ao Tenant A.
   - Resultado: **BLOQUEADO**. Isolamento estrito por organização validado.

---

## 4. Resultado do Replay de Migrações em Banco Isolado

Executado via `node scripts/verify-migration-replay.mjs --label=phase52`:
- Banco isolado criado: `eimax_phase52_migration_replay`
- Total de migrações aplicadas do zero: **13 migrações** (`202610200001_foundation` até `202610200013_phase52_historical_integrity`).
- Comparação de schema (`prisma migrate diff` entre schema e banco de replay): **Zero diferenças detectadas**.
- Base principal: **Nenhum reset ou alteração destrutiva executada**.
- Evidência arquivada: `docs/validation/phase52-migration-replay.json`.

---

## 5. Resumo das Verificações da Fase 5.2

| Comando | Resultado |
|---|---|
| `npm run build` | **Aprovado**: compilação de pacotes TypeScript, Prisma Client, worker, NestJS e Next.js (11 rotas estáticas e dinâmicas). |
| `npm run lint` | **Aprovado**: zero erros, zero warnings. |
| `npm run typecheck` | **Aprovado**: tipagem estrita válida em todo o monorepo. |
| `npm test` | **74 testes unitários aprovados** (100% de sucesso). |
| `npm run test:integration` | **73 testes de integração reais aprovados** contra API e PostgreSQL local (inclui 7 testes de integridade histórica e testes de fila com 20 jobs concorrentes). |
| `npm run test:e2e` | **11 testes Playwright aprovados** (desktop e mobile); 1 teste de arraste exclusivo de desktop ignorado no mobile conforme design. |

---

## 6. Plano Técnico da Fase 6

Documentado integralmente em [`docs/phase6-technical-plan.md`](phase6-technical-plan.md). Resumo dos pilares:
1. **`ExecutionStatus.SUSPENDED`**: Adição do enum de suspensão no Prisma e PostgreSQL, com transições seguras para `QUEUED` e sem locks em memória.
2. **Checkpoints Persistentes**: Tabela `ExecutionCheckpoint` para salvar variáveis e posições de nós para retomada durável.
3. **Blocos de Aprovação Humana (`human.approval`)**: Decisão síncrona/assíncrona de operadores via interface e API autenticada com RBAC.
4. **Sub-Workflows Reutilizáveis (`workflow.call`)**: Chamadas aninhadas fixadas à `WorkflowVersion` imutável correspondente.
5. **Recuperação de Workers**: Reinicialização do processo sem perda de jobs suspensos (liberação automática de leases e retomada atômica).
6. **Preservação de Versão**: Garantia de que workflows suspensos por dias continuem executando a versão exata do momento de início.

---

## 7. Dependências que Ainda Exigem Homologação Externa

As seguintes integrações continuam em modo declarativo seguro ("Configuração necessária"), sem qualquer envio externo não autorizado:
- **Meta WhatsApp Cloud API**: Requer credenciais oficiais (WABA ID, Phone Number ID, System User Access Token) e aprovação de templates HSM.
- **Evolution API (Gateway Baileys)**: Requer instância e URL HTTPS homologada na allowlist do servidor.
- **Resend**: Requer API Key de produção e domínio corporativo verificado com DKIM/SPF.
- **Google Sheets**: Requer OAuth App verificado no Google Cloud Console com `client_id`, `client_secret` e redirecionamento configurado.
- **CRMs (HubSpot e RD Station)**: Contratos preparatórios prontos; adapters de escrita aguardando autorização de fase posterior.
