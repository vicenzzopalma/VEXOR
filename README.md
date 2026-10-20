# VEXOR / EIMAX Studio

Plataforma corporativa de automação visual de fluxos comerciais, qualificação de leads (SDR), orquestração de integrações e execução durável.

- **Stack**: Next.js 16 (React 19, React Flow 12, Tailwind), NestJS 11, Prisma 6, PostgreSQL 18 local (embedded-postgres), Worker autônomo desacoplado.
- **Fase atual**: **Fase 5.2 Concluída** (Integridade Histórica e Preservação de Versões Publicadas).
- **Status de Homologação**: Funcionalidades de motor, filas, idempotência, segurança e banco de dados 100% verificadas localmente. Conectores externos (Meta Cloud API, Evolution Gateway, Resend, Google Sheets) operam em modo declarativo seguro ("Configuração necessária") até homologação formal em produção.

---

## Iniciar no Windows

Pré-requisito: Node.js 20.9+ e npm. Não é necessário instalar PostgreSQL global ou Docker: o banco local roda via `embedded-postgres` escutando em `127.0.0.1:55432`.

```powershell
npm ci
npm run dev
```

Acesse:
- **Editor Visual**: [http://localhost:3000/editor/starter-sdr](http://localhost:3000/editor/starter-sdr)
- **Meus Processos**: [http://localhost:3000/processos](http://localhost:3000/processos)
- **Biblioteca de Modelos**: [http://localhost:3000/templates](http://localhost:3000/templates)
- **Gestão de Leads & Oportunidades**: [http://localhost:3000/leads](http://localhost:3000/leads)
- **Execuções & Simulações**: [http://localhost:3000/execucoes](http://localhost:3000/execucoes)
- **Catálogo de Integrações**: [http://localhost:3000/integracoes](http://localhost:3000/integracoes)
- **API NestJS (Status)**: [http://127.0.0.1:4000/health](http://127.0.0.1:4000/health)

---

## Funcionalidades Implementadas e Verificadas

### 1. Editor Visual e Motor de Regras
- Catálogo de 8 blocos nativos (`lead.created`, `webhook.received`, `condition`, `email.send`, `sdr.assign`, `wait`, `tag.add`, `manager.notify`) e blocos de integração WhatsApp (`whatsapp.message.received`, `whatsapp.text.send`, `whatsapp.template.send`, `whatsapp.sdr.notify`, `whatsapp.lead.update`).
- Validação estrita de contratos com Zod, auto-layout Dagre, histórico de versões imutáveis, simulação isolada no servidor sem chamadas externas e resolução de interpolação segura com pílulas visuais.

### 2. Integridade Histórica e Imutabilidade (Fase 5.2)
- **Proteção contra UPDATE e DELETE**: Gatilho SQL `immutable_workflow_version` impede mutações ou exclusões físicas de versões publicadas (`WorkflowVersion`).
- **Proteção contra Cascata**: Chave estrangeira `WorkflowVersion` → `Workflow` com `ON DELETE RESTRICT ON UPDATE NO ACTION`.
- **Proteção contra TRUNCATE**: Gatilhos em nível de instrução (`FOR EACH STATEMENT`) bloqueiam `TRUNCATE` em `WorkflowVersion` e `Workflow`.
- **Arquivamento Lógico**: Coluna `archivedAt` no `Workflow`, permitindo arquivar processos publicados preservando integralmente todas as versões históricas, leads e execuções vinculadas.

### 3. Fila Durável e Worker Desacoplado
- Tabela `Execution` persistida no PostgreSQL com reserva atômica via `FOR UPDATE SKIP LOCKED`, leases com token de posse, recuperação de falhas transitórias e deduplicação determinística por idempotência (`organizationId`, `workflowId`, `eventKey`).
- Worker autônomo em `apps/worker` com runner único compartilhado em `@eimax/workflow-runtime`.

### 4. Segurança e Multi-tenancy
- Isolamento rígido por organização (`organization_id`) e papéis RBAC (`owner`, `editor`, `viewer`).
- Criptografia AES-256-GCM para dados sensíveis e credenciais de conectores, hashes Scrypt com salt para senhas e validação matemática de dígitos verificadores de CPF (módulo 11).
- Rate limiter de login e ingressos de webhook com verificação de assinatura HMAC e janela temporal anti-replay.

---

## Verificação e Testes Automatizados

Com o PostgreSQL ativo e API em execução:

```powershell
npm run build              # Build de pacotes, worker, API e Next.js
npm run lint               # ESLint com zero warnings
npm run typecheck          # Verificação de tipos TypeScript em todo o monorepo
npm test                   # 74 testes unitários
npm run test:integration   # 73 testes de integração reais contra PostgreSQL
npm run test:e2e           # 11 testes ponta a ponta (Playwright Desktop & Mobile)
```

---

## Documentação Técnica

- [Progresso e Histórico de Fases](docs/progress.md)
- [Relatório de Implementação da Fase 5.2](docs/implementation-report-phase-5-2.md)
- [Plano Técnico da Fase 6](docs/phase6-technical-plan.md)
- [Arquitetura](docs/architecture.md) e [Contrato da API](docs/api.md)
- [Operações e Configuração](docs/operations.md)
