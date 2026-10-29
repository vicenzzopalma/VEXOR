# Pesquisa de paridade VEXOR x n8n (engenharia reversa clean-room com REA)

Pasta de trabalho da pesquisa iniciada em 28/10/2026. Objetivo: levar o VEXOR ao nível funcional do n8n (projetos, editor, painel do nó, execuções, credenciais, gatilhos, API), sem copiar nada do n8n.

## Regras inegociáveis

1. **Clean-room.** O n8n usa a Sustainable Use License (fair-code). Observamos comportamento, telas, fluxos e contratos públicos; escrevemos especificação em português nas nossas palavras; implementamos do zero na stack do VEXOR. Nunca copiar código, CSS, SVG/ícones, textos de interface, nomes de nós, marca ou assets do n8n, nem para estes documentos, nem para o produto. Sem trechos de código do n8n, nem "para ilustrar".
2. **Três rótulos, sempre.** Em cada tópico separar **Observação** (vista no artefato, na documentação ou numa evidência do REA), **Inferência** (dedução nossa, com o porquê) e **Desconhecido** (não dá para afirmar com as fontes que temos).
3. **Fontes aceitas.** Pacotes públicos do npm guardados em `D:\VEXOR\_ref\n8n` (observação por REA cita o `evidence_id`; observação por leitura direta com grep/cat é rotulada "leitura direta, sem REA"), documentação pública (docs.n8n.io, citar URL) e a API pública (OpenAPI). Não executar o n8n, não criar contas, não usar serviço pago.
4. **Memória da máquina.** 16 GB com cerca de 2 GB livres e produção local no ar. Proibido subir o n8n, rodar builds, abrir navegadores extras ou rodar mais de uma análise REA por vez (só o orquestrador roda `rea analyze-javascript-application`). Leitura (grep, find, cat, `rea inspect-analysis-view` sobre evidência salva) é liberada.
5. **Nunca tocar** em `.env`, no banco `eimax`, no gateway 8088, no worker, nos serviços 3000/4000/8080, em `D:\VERITAS` e em `D:\Novo\Esfera v3`. A fase 1 é somente leitura no repositório; cada agente escreve apenas o próprio arquivo nesta pasta.
6. **Formato.** Markdown em pt-BR, sem travessão, sem métricas inventadas, frases curtas. Cada afirmação relevante cita um id do ledger entre colchetes (ex.: `[A3]`, `[B12]`, `[E4]`).

## Arquivos

| Arquivo | Conteúdo | Autor |
| --- | --- | --- |
| `00-ledger-evidencias.md` | Ledger consolidado: evidências do REA (ids, SHA-256, comandos), leituras diretas e fontes públicas | orquestrador |
| `01-editor-frontend-docs.md` | Editor, canvas, painel do nó, execuções, credenciais e atalhos, pela documentação pública | agente A |
| `02-backend-execucao-api-docs.md` | Modelo de fluxo, execução, gatilhos, credenciais, variáveis, versões, importação/exportação e API pública | agente B |
| `03-inventario-vexor.md` | O que o VEXOR já tem (telas, editor, API Nest, worker, Prisma, conectores, testes) | agente D |
| `04-artefatos-rea.md` | Observações tiradas dos pacotes publicados com o REA (rotas, catálogo de nós e credenciais, superfícies de API) | orquestrador |
| `05-matriz-paridade.md` | Fase 2: funcionalidade do n8n, existe no VEXOR?, prioridade, esforço, evidências | orquestrador |
| `06-editor-rea-aprofundado.md` | Painel do nó, canvas, execuções e logs em detalhe, com especificação para o VEXOR | agente R1 |
| `07-backend-rea-aprofundado.md` | Ciclo de vida da execução, espera, ativação, erros, fila, credenciais, OAuth e permissões, com especificação para o VEXOR | agente R2 |

## Ambiente

- REA 6.7.0 (`rea-agents`, MIT) instalado com `npm install -g rea-agents`; MCP registrado com `claude mcp add --scope user rea -- cmd /c rea mcp` (precisa de `MSYS_NO_PATHCONV=1` no Git Bash).
- Pacotes de referência: `D:\VEXOR\_ref\n8n\tarballs` (tarballs do npm) e `D:\VEXOR\_ref\n8n\pkg\<pacote>` (extraídos). Evidências do REA em `D:\VEXOR\_ref\n8n\evidence`.
- Código-fonte oficial do n8n (leitura para especificação): `D:\VEXOR\_ref
8nepo`, ver E11 no ledger. Arquivos `.ee` ficam fora. Agentes que implementam no VEXOR recebem só a especificação, nunca o fonte.
- Parte C do plano (comportamento em execução com `capture_browser_scenario`) não foi feita por falta de memória; fica registrada como desconhecido onde a documentação não resolve.
