# Roadmap incremental

## Continuidade técnica atualizada em 26/10/2026

O quadro original abaixo é histórico. O estado verificado está em [progress.md](progress.md); a fase 6A já foi entregue localmente. Esta rodada concluiu isolamento de janelas, proteção de edição de leads, recuperação do histórico e concorrência otimista de leads controlada pelo PostgreSQL. Validação: build completo, lint, typecheck, 91 unitários, 94 integrações e 41 E2E aprovados, com um arraste desktop ignorado em celular.

Próximas fatias de SaaS e critérios de aceite estão em [database-saas-audit.md](database-saas-audit.md): autenticação/membership, paginação, RLS/papéis, pool, backup/restauração e isolamento dos bancos de testes. Esses itens não estão homologados por testes locais da interface. Navegação por histórico do navegador durante autosave também requer uma fatia própria.

## Planejamento original

| Fase | Entrega | Estado atual |
| --- | --- | --- |
| 0 | Inspeção, referências, arquitetura, design system, contratos e critérios | Concluída |
| 1 | Monorepo, editor funcional e persistência servidor | Concluída e validada |
| 2 | Worker, oito executores, evento autenticado, retries e idempotência | Concluída e validada |
| 3 | Auth de produção, CPF (AES-256-GCM), titularidade, scrypt, rate limiter | Concluída e validada |
| 4 | Landing, onboarding final, dashboard comercial expandido, planos e quotas | Pendente |
| 5 | Suíte integral E2E, recuperação avançada de worker, expiração de sessões | Pendente |

Cada fase termina com build, lint, testes adequados, documentação dos resultados e itens incompletos.
