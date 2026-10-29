# Ledger de evidências

Pasta das evidências: `D:\VEXOR\_ref\n8n\evidence` (fora do git). Ferramenta: REA 6.7.0 (`rea-agents`, MIT) em Node 24.16.0, Windows 11.

| Id | Tipo | Alvo | Comando ou fonte | Resultado |
| --- | --- | --- | --- | --- |
| E1 | leitura direta | 7 tarballs do npm | `npm pack` + `sha256sum` | `tarballs.sha256`; licença de todos é Sustainable Use License |
| E2 | REA | n8n-workflow 2.16.0 (sha256 do diretório `1402bd20...`) | `rea analyze-javascript-application <pasta> --max-heap-mb 640 --analysis-timeout-ms 240000` | `ev_cf30899ff104fcad5ed07f9ed7a8a21bbd77fd6b5620c297db8cb28ee69a9865` (completa, `n8n-workflow.json`, 178 MB, 210 s) |
| E2a | REA | idem | `rea inspect-analysis-view` com `view: summary` | `ev_fe1eea28aa1f57d4abb1999056a3f0476e15546776a76865a31fc11ffa84f02b` |
| E2b | REA | idem | `rea inspect-analysis-view` página de módulo `dist/cjs/execution-status.js` | `ev_4d0f892edec1f2c5afcbb115a100c5258feee64009682a428d5fc829edd50e3c` |
| E3 | leitura direta | n8n-workflow `dist/cjs` | listagem de módulos e exports | nomes de módulos e funções exportadas |
| E4 | leitura direta | n8n 2.45.5 `dist` | script `rest-routes.mjs` (decoradores compilados) | `n8n-rest-interno.csv`: 125 controladores, 667 rotas |
| E5 | leitura direta | n8n 2.45.5 `dist/public-api/v1/openapi.yml` | cópia + grep de caminhos e esquemas | `n8n-public-api-openapi.yml`, OpenAPI 3.0, versão 1.1.1 |
| E6 | leitura direta | n8n-nodes-base 2.15.1 | listagem e `package.json` | 438 nós, 392 credenciais, 110 arquivos de gatilho |
| E7 | leitura direta | n8n-editor-ui 2.16.2 `dist/assets/*.map` | script `map-sources.mjs` (só o campo de caminhos) | `editor-ui-fontes.txt`: 1.876 caminhos fora de dependências |
| E8 | REA | n8n-editor-ui 2.16.2, `dist/assets/RunData-DCyM875J.js` | `analyze-javascript-application`, um arquivo, heap 512 MB e até 3.000 nós semânticos | `ev_c5dcac785c2d39c7c783ca6fd51c72d5df33463cc6b6e9dda625167652771153`; saída em `editor-rundata-rea.json` fora do repositório (envelope UTF-16LE, evidência em `data`); análise estática limitada, não comprova comportamento em execução |

Fontes de documentação pública: ids A1..An em `01-editor-frontend-docs.md` e B1..Bn em `02-backend-execucao-api-docs.md`. Inventário do VEXOR: `03-inventario-vexor.md` (citações arquivo:linha).

## Rodada aprofundada (29/10/2026)

| Id | Tipo | Alvo | Resultado |
| --- | --- | --- | --- |
| E9 | REA + leitura direta | editor: painel do nó, canvas, execuções, logs (1 a 3 chunks por análise, heap 512 MB) | quatro análises e cinco vistas/rastreios; ids completos no "Ledger R1" de `06-editor-rea-aprofundado.md`; pacote exportado `D:\VEXOR\_ref
8n\evidence
1-editor-rea-bundle.json` |
| E10 | REA + leitura direta | servidor: ciclo de vida, espera, recuperação, ativação, fila, credenciais, OAuth, permissões | `ev_0f607cdd...`, `ev_8312e066...` e rastreios; ids completos no "Ledger R2" de `07-backend-rea-aprofundado.md` |

Limite comum às duas rodadas: o REA confirmou estrutura e campos, mas não indexa textos soltos; o comportamento fino veio de leitura direta e está rotulado assim. Nada foi executado. Os fontes extraídos dos mapas de origem para leitura foram apagados ao fim da rodada.
| E11 | código-fonte (leitura) | repositório oficial `github.com/n8n-io/n8n`, commit `1faf2acf9e8a7f5e829db6271532880f64751c82` (29/10/2026) | clone raso e esparso em `D:\VEXOR\_ref
8nepo` (editor, workflow, core, cli, db, engine): 9.790 arquivos. Licença: Sustainable Use License; os 867 arquivos com `.ee` no nome ou na pasta têm licença enterprise e não podem ser lidos nem usados. Uso permitido aqui: ler fonte e testes para escrever especificação; quem implementa no VEXOR não lê o fonte |

