
# Roadmap incremental

| Fase | Entrega | Estado inicial |
| --- | --- | --- |
| 0 | Inspeção, referências, arquitetura, design system, contratos e critérios | Concluída |
| 1 | Monorepo, editor funcional e persistência servidor | Concluída e validada no escopo desta entrega |
| 2 | Redis/BullMQ, workers, oito executores, evento autenticado, outbox, retries/idempotência | Pendente; simulador e snapshots antecipados na fase 1 |
| 3 | Auth, CPF, titularidade, e-mail, CAPTCHA, trial/quotas | Pendente; organizações, escopo de servidor e RBAC local antecipados e testados na fase 1 |
| 4 | Landing, onboarding final, dashboard, biblioteca expandida, planos e negociador | Pendente; listagens auxiliares antecipadas |
| 5 | Suíte integral, isolamento, recuperação worker, expiração, segurança, revisão visual | Pendente; testes da fatia 1 executados antes da entrega |

Cada fase termina com build, lint, testes adequados, documentação dos resultados e itens incompletos. Não iniciar toda a plataforma em uma alteração. A primeira entrega é fundação local revisável, não lançamento de produção.
