
# Critérios de aceitação

## Fatia 1
- [x] Abrir o modelo SDR salvo no PostgreSQL.
- [x] Oito blocos e campos específicos disponíveis. Contratos dos oito cobertos por unidade; adição/clique/drag com Esperar cobertos por E2E (não se alega E2E individual de todos os oito).
- [x] Mover, conectar, reconectar e excluir arestas em E2E; ciclos/entradas em gatilhos rejeitados pelo validador e pela conexão do editor.
- [x] Condições têm saídas verdadeiro/falso e validação sem execução de código.
- [x] Desfazer/refazer, duplicar, seleção múltipla e auto-layout verificados por E2E desktop.
- [x] Salvar e recarregar conserva alterações; conflito de revisão recusa sobrescrita, inclusive em gravações concorrentes.
- [x] Publicação cria snapshot imutável; rascunho posterior não altera versão. Trigger SQL testado.
- [x] Simulação testa ambos os ramos em unidade; caminho falso/logs seguros cobertos por integração e E2E. Efeitos não têm capacidade de rede.
- [x] Feedback de erro/validação e recuperação implementados; erros de dados/permissão/conflito cobertos por integração. Não foi automatizada uma queda de rede durante edição.
- [x] Desktop/notebook/mobile inspecionados e capturados; sem overflow de página. Arraste nativo ignorado no mobile, com alternativa por toque testada.
- [x] Build/lint/typecheck/unit/integration/E2E executados; resultados em docs/progress.md.

Resultado final: 23 unitários + 12 de integração + 3 E2E passaram; 1 E2E ignorado explicitamente no mobile. Capturas em `docs/validation/`; relatório interativo em `playwright-report/index.html` (gerado, não versionado).

## Gates futuros obrigatórios
Fase 2: idempotência, recuperação após crash, retry/backoff, webhook autenticado, falha permanente, esperas duráveis, dados sensíveis redigidos, integração autorizada.

Fase 3: empresa A não lê/altera/executa recursos de B, RBAC e compartilhamento, verificação de e-mail/CAPTCHA, CPF protegido, trial calculado no servidor, quotas concorrentes e expiração no worker.

Fase 4/5: jornada completa sem código, modalidades comerciais, assinatura e histórico, screenshots desktop/mobile, revisão de acessibilidade e segurança. Esses gates não são testes executados da fatia 1.
