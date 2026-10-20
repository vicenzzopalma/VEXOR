
# Arquitetura

## Decisão
Monorepo npm, monólito modular com três processos: Next.js (interface), NestJS (API), worker BullMQ (fase 2). PostgreSQL/Prisma persiste os dados; Redis será a fila. Sem código arbitrário dos clientes. Os contratos Zod versionados são compartilhados entre cliente, API e simulador.

```mermaid
flowchart LR
  WEB[Next.js / React Flow] -->|proxy de mesma origem| API[NestJS]
  API --> PG[(PostgreSQL / Prisma)]
  API --> SIM[Simulador seguro]
  API -. Fase 2 .-> REDIS[(Redis / BullMQ)]
  REDIS -.-> WORKER[Worker independente]
  WORKER -.-> PG
```

## Primeira fatia
- Abrir modelo SDR persistido, editar nós e arestas e salvar com revisão otimista.
- Estrutura do rascunho validada; configurações incompletas podem ser preservadas. Publicação/simulação exigem semântica completa.
- Publicação incrementa versão em transação, mantendo snapshots imutáveis.
- Simulação no servidor percorre o grafo com evento de exemplo, avalia condições e registra entradas/saídas redigidas. Nenhuma integração é chamada e o bloco esperar só descreve a espera.
- Simulações ficam persistidas; a UI destaca etapas e permite consultar seus resultados.
- Duas organizações de desenvolvimento, memberships owner/editor/viewer e sessões opacas locais. O servidor resolve organization_id pela membership da sessão e aplica escopo em leituras, escritas, versões e logs. O cliente não escolhe empresa por header/corpo/query. Leitores não escrevem/simulam; editores não publicam. Isolamento e RBAC estão cobertos por integração. Cadastro/login e sessões de produção permanecem na fase 3.
- API escuta apenas loopback e recusa iniciar sem DEVELOPMENT_WORKSPACE=true nesta fase. Escritas exigem origem local e header de cliente para impedir submissão cross-site simples. Não expor este ambiente na internet.

## Persistência
Organization, Membership, DevelopmentSession (token com hash SHA-256), Workflow (rascunho JSON, revisão), WorkflowVersion (snapshot imutável, unique workflow+version), Simulation (snapshot e logs JSON). organization_id em workflows/versões/simulações e chaves estrangeiras compostas impedem inconsistência de tenant. Trigger SQL impede UPDATE de versões publicadas, além da ausência de rota de atualização. Saves e publicações são transacionais. Migração SQL versionada. PostgreSQL local via embedded-postgres/pg_ctl para desenvolvimento em Windows sem Docker; Docker Compose para PostgreSQL/Redis também fornecido. Nenhum serviço/conta global instalado. Credenciais locais não são adequadas para produção.

## Próximas fases
Execuções reais terão Execution/StepLog/Outbox, constraint de idempotência por empresa+evento+versão, retries com backoff e checkpoints. Esperas serão jobs adiados, sem bloquear worker. Falhas entre envio e confirmação exigem idempotency key do provedor/outbox; não prometer exactly-once externo sem suporte do provedor.

Autenticação completa usará verificação de e-mail, CAPTCHA no servidor, CPF protegido por criptografia + hash de deduplicação e adapter de titularidade. A resolução local atual de memberships e RBAC será mantida nessa transição. Trial e quotas serão verificados na recepção e novamente pelo worker. Integrações terão segredos cifrados; HTTP externo limitado por allowlist, bloqueio de IPs privados/redirecionamentos e validação DNS para SSRF. Esses controles futuros não são alegados como concluídos.

## Fontes técnicas consultadas
- [React Flow: reconexão](https://reactflow.dev/examples/edges/reconnect-edge)
- [Next.js: instalação](https://nextjs.org/docs/app/getting-started/installation)
- [Prisma 6: generators](https://www.prisma.io/docs/orm/v6/prisma-schema/overview/generators)

Prisma 6.19.3 fixado para compatibilidade com Node 20.18 disponível; embedded-postgres é ferramenta de desenvolvimento, não infraestrutura de produção.
