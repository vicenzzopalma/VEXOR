# Matriz de paridade funcional: n8n e VEXOR

Base: pesquisa existente de 28/10/2026, versões dos pacotes e evidências em [ledger](00-ledger-evidencias.md); inventário VEXOR em [03](03-inventario-vexor.md). A análise E8 é estática e limitada a um arquivo. A documentação é evidência de comportamento descrito, não de execução observada. Não foram copiados código, textos de interface, ícones ou marca.

Prioridades: P1, próximo passo de uso; P2, ampliar operação com segurança; P3, capacidades mais amplas. Esforço é estimativa inicial: P, pequeno; M, médio; G, grande. Planos/licenças do produto de referência podem restringir funcionalidades; isso precisa de confirmação antes de comparações por edição.

| Capacidade | Referência e evidência | VEXOR hoje | Prioridade / esforço | Próximo passo |
| --- | --- | --- | --- | --- |
| Painel de nó com entrada, parâmetros e saída | Documentação de dados e tutorial [A6, A22]; estrutura estática [E7, E8] | Inspetor edita parâmetros; entrada e saída aparecem em histórico por etapa [03 §3.3, §4.5] | P1 / M | Abrir detalhe com três áreas e dados da simulação ou execução selecionada; indicar ausência e origem dos dados. |
| Canvas e nós | Nós e conexões [A12, A31, A32]; áreas do editor [E7] | Edição visual, biblioteca, conexões e desfazer; fluxo SAIR tem apresentação própria [03 §3.1, §3.6] | P1 / M | Aplicar visual já existente do SAIR ao editor comum, sem perder seleção, conexões, validação, mobilidade ou acessibilidade. |
| Projetos e fluxos | Organização por projeto [A8, E4] | Projetos, busca, criação, movimento, duplicação e arquivamento [03 §2.1, §2.3] | P2 / M | Papéis por projeto e compartilhamento, após definir política de acesso. |
| Execuções e diagnóstico | Listas, filtros e detalhe [A4, A14, A15] | Filtros por fluxo, estado e data e paginação no servidor; histórico por etapa e detalhe do nó com dados selecionados. A API em execução precisa ser atualizada para disponibilizar a busca. | P1 / M | Evoluir diagnóstico por nó e busca conforme uso real. |
| Controle de execução | Repetição e parada documentadas [A14, A15, E5] | Fila, tentativas e espera durável; sem cancelamento ou reexecução de etapa [03 §4] | P2 / G | Projetar transições e idempotência antes de adicionar parar ou repetir efeitos externos. |
| Teste parcial e dados fixados | Execução parcial e dados fixados [A17, A20] | Simulação do fluxo e registros por etapa; sem fixação [03 §3.5, §10] | P2 / G | Definir armazenamento, permissões e expiração de dados de teste; evitar dados reais simulados. |
| Credenciais e integrações | Criação e teste de credencial [A18, A27, E4] | Conexões cifradas por organização, adaptadores e aba explicativa no projeto [03 §6] | P2 / G | Gestão e escopo por projeto com teste seguro e sem expor segredos. |
| Gatilhos | Webhooks e agendamento [E6, A105] | Webhook e mensagem recebida; agendamento ausente [03 §5] | P2 / G | Agendamento durável com fuso explícito, deduplicação e isolamento por empresa. |
| Lógica e transformação | Condições, roteamento, dados e subfluxos [A7, E6] | Condição, espera e ações comerciais; catálogo reduzido [03 §3.2, §5] | P2 / G | Acrescentar capacidades genéricas em fatias validadas e com limites de segurança. |
| Versões e histórico | Publicação e histórico [A11, A38, E3] | Rascunho com revisão e versões publicadas imutáveis [03 §3.4] | P2 / M | Comparação e restauração com revisão otimista, preservando snapshots históricos. |
| Expressões e mapeamento | Referências e expressões [A19, A21, A43] | Variáveis e campos definidos pelo esquema [03 §3.3] | P2 / G | Ampliar mapeamento com validação e ambiente seguro; sem executar código arbitrário. |
| Importação e exportação | Contratos públicos e formatos [A40, E5] | Modelos internos; paridade de importação não confirmada [03 §2.7] | P3 / G | Definir formato próprio versionado e validado, sem credenciais ou dependência de formato proprietário. |
| API e permissões | API pública e escopos [E4, E5, A26] | API local autenticada, RBAC por organização e revisão [03 §8] | P2 / G | Versionamento e permissões por recurso após estabilizar contratos e autenticação. |
| Pastas, tags, tabelas e colaboração | Recursos documentados [A24, A25, E4] | Projetos e dados de leads; faltam modelos equivalentes [03 §10] | P3 / G | Priorizar por uso real, sem criar métricas ou dados fictícios. |

## Limites e decisões

- **Observação:** a pesquisa do servidor e do editor combina documentação, leitura de metadados e evidências estáticas REA. O n8n não foi executado nesta fase [E2, E4, E7, E8].
- **Inferência:** o detalhe do nó e o canvas são a primeira fatia por serem a prioridade explícita do usuário e aproveitarem dados e componentes já existentes.
- **Desconhecido:** foco exato, animações e interação fina no produto de referência; a implementação seguirá padrões próprios e acessíveis do VEXOR.
- Execuções reais, confirmações de descadastro, gateway e banco de uso devem continuar separados de qualquer teste; testes persistentes usam `eimax_test`.
