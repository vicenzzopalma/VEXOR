# Paridade VEXOR x n8n, fase 1 aprofundada: editor pelo REA (agente R1)

Data: 2026-10-29. Alvo: `n8n-editor-ui` 2.16.2, pasta `dist/assets` (sha256 do diretório `6c1a59ae...`). Escopo: painel de detalhe do nó, canvas, execuções e painel de logs. Complementa `01-editor-frontend-docs.md` (documentação) e `04-artefatos-rea.md`.

## Como ler

- **Observação (REA ev_...)**: fato tirado de uma evidência do REA. O id da evidência vem no rótulo e no Ledger R1.
- **Observação (leitura direta)**: fato lido nos mapas de origem publicados (campo de conteúdo dos `.map`), extraídos por script nosso para uma pasta temporária fora do repositório. Lido só para entender comportamento. Nada foi copiado: sem código, sem CSS, sem textos de interface, sem nomes de componentes, sem chaves de armazenamento literais.
- **Inferência**: dedução nossa, com o motivo.
- **Desconhecido**: as fontes não permitem afirmar.
- Ids entre colchetes (ex.: [R1-5]) apontam para o Ledger R1 no fim. Ids [A..] apontam para `01-editor-frontend-docs.md`.

Limite geral. **Observação (REA ev_98bf0cba..., ev_1ee4191a..., ev_9d3a99a6..., ev_4179c667...)**: as quatro análises são estáticas, com cobertura semântica parcial, e não provam execução em tempo real. A análise do canvas bateu no teto de 20.000 nós semânticos (truncada) [R1-5]. Por isso o REA serviu para confirmar estrutura (quais arquivos formam cada área, armazenamento local, rede, ligações entre módulos) e a leitura direta dos mapas serviu para o comportamento fino. Nenhum comportamento foi visto rodando.

## 1 Painel do nó

### 1.1 Estrutura e abertura

- **Observação (REA ev_98bf0cba...)**: o painel novo, o painel de saída com nós flutuantes e o painel de configurações estão em três arquivos separados do pacote; o arquivo do painel novo lê e grava armazenamento local do navegador [R1-1][R1-3][R1-4].
- **Observação (leitura direta)**: existem duas gerações do painel. A atual é um diálogo modal sobre fundo escurecido, com três colunas: entrada à esquerda, parâmetros e configurações no centro, saída à direita [R1-12].
- **Observação (leitura direta)**: nó gatilho de webhook ou de consulta periódica troca a coluna de entrada por um painel de gatilho. Gatilho sem esse painel fica sem coluna de entrada; o centro encosta na esquerda [R1-12].
- **Observação (leitura direta)**: fechar acontece por Esc, clique no fundo ou botão de fechar. Não fecha se o usuário está arrastando um painel. Se a saída estiver em edição, pergunta se deve fixar o que foi editado antes de sair [R1-12].
- **Observação (leitura direta)**: ao abrir, o foco vai para o primeiro campo do centro. Com o painel aberto, Ctrl/Cmd + S é bloqueado. Notas adesivas não abrem o painel [R1-12].
- **Observação (leitura direta)**: o cabeçalho tem ícone, nome editável no lugar (nome vazio volta ao nome padrão do tipo), link de documentação e fechar [R1-12].

### 1.2 Larguras e redimensionamento

- **Observação (leitura direta)**: larguras guardadas em porcentagem. Há três perfis de nó: sem entrada (centro com 480 px), largo (centro com 640 px) e normal (centro com 420 px), laterais iguais. Mínimo do centro 368 px, mínimo das laterais 120 px. Se a soma passar de 100%, o excesso sai das laterais na proporção [R1-12].
- **Observação (leitura direta)**: redimensiona pelas bordas do centro ou arrastando o centro inteiro por uma alça. A largura é gravada só ao soltar, no armazenamento local, uma entrada por perfil de nó [R1-12]. **Observação (REA ev_437888af...)** confirma leitura e gravação de armazenamento local nesse arquivo [R1-3].
- **Inferência**: o layout se adapta ao tipo de nó e ao gosto do usuário sem configuração explícita. O VEXOR deve guardar larguras por perfil e não por nó.

### 1.3 Navegação entre nós sem fechar

- **Observação (leitura direta)**: ícones flutuantes nas bordas do diálogo. Esquerda: pais diretos. Direita: filhos diretos. Topo: subnós (ligações que não são de dados principais). Clicar troca o nó ativo sem fechar [R1-12].
- **Observação (leitura direta)**: atalhos Ctrl/Cmd + Shift + Alt + seta esquerda (primeiro pai), seta direita (primeiro filho), seta para cima (primeiro subnó) [R1-12].
- **Observação (leitura direta)**: trocar de nó zera a escolha de rodada, religa o vínculo de rodadas entre entrada e saída e zera o nó de entrada escolhido [R1-12].

### 1.4 Painel de entrada

- **Observação (leitura direta)**: o seletor de nó de entrada lista todos os ancestrais em qualquer profundidade, sem repetição, por distância. Cada opção mostra o nome (cortado em 30 caracteres) e a distância em nós. Em nó com várias entradas, mostra quais entradas estão ligadas. O seletor aceita filtro por texto [R1-12].
- **Observação (leitura direta)**: o nó de entrada padrão é o primeiro pai direto que tenha dados (fixados ou de execução); sem nenhum, o primeiro pai. Para subnó, a entrada é o nó raiz ao qual ele se liga [R1-12].
- **Observação (leitura direta)**: subnós têm dois modos de entrada. Mapeamento mostra a saída de um ancestral do nó raiz. Depuração mostra a entrada real. O padrão é depuração se o nó já rodou, senão mapeamento [R1-12].
- **Observação (leitura direta)**, estados vazios da entrada [R1-12]:
  - sem pai: ilustração de "ligue um nó" e link de ajuda;
  - pais sem execução: título de sem dados e ação de executar os nós anteriores até este;
  - executando anteriores: indicador de carregamento;
  - nó de espera aguardando: estado próprio;
  - pai desativado: texto com ação de reativar;
  - erro no nó anterior: estado próprio;
  - somente leitura: só o título, sem ação.
- **Observação (leitura direta)**: uma dica de arrastar campo aparece 1 s depois de focar um campo mapeável, até o usuário concluir a primeira vez (marca no armazenamento local). Não aparece em gatilho manual nem em agendamentos [R1-12].
- **Observação (leitura direta)**: a prévia de esquema (saída prevista sem executar) é usada só na entrada, só para pais diretos e só para nós de integração [R1-12].

### 1.5 Painel de saída: vistas, contagem, rodadas, ramos

- **Observação (REA ev_c5dcac78...)**: o arquivo de dados de execução reúne a contagem de itens, a barra de paginação, o botão de fixar e a vista de erro [E8][R1-10].
- **Observação (leitura direta)**: vistas na ordem esquema, tabela, JSON e binário (quando houver binário). Vista de HTML entra na frente para o nó de gerar HTML e vira a vista forçada. Vista renderizada de IA entra na frente quando há conteúdo de IA e é escolhida sozinha; na entrada ela não existe. Não há vista de Markdown própria [R1-12].
- **Observação (leitura direta)**: a vista escolhida é lembrada no armazenamento local, uma para entrada e outra para saída. Padrão: esquema na entrada, tabela na saída. Com binário, muda sozinha para binário; se o binário some, volta para tabela. Se a vista lembrada não existe para aquele nó, cai na primeira disponível [R1-12].
- **Observação (leitura direta)**: a contagem mostra N itens, mais o número de subexecuções quando houver. Com busca ativa, mostra X de Y itens [R1-12].
- **Observação (leitura direta)**: seletor de rodada aparece quando o nó rodou mais de uma vez, no formato rodada k de N com itens entre parênteses. A rodada da entrada fica ligada à da saída quando as duas têm o mesmo número de rodadas maior que 1; há botão para ligar e desligar o vínculo [R1-12].
- **Observação (leitura direta)**: abas de ramo aparecem quando o nó tem mais de uma saída, com nome do ramo e contagem. A aba inicial é a primeira com dados [R1-12].
- **Observação (leitura direta)**: informação da rodada (status, início, duração em ms, aviso de dados desatualizados) aparece só sem dados fixados e com mais de uma rodada [R1-12].

### 1.6 Paginação, busca, limites de exibição

- **Observação (leitura direta)**: tamanhos de página 1, 10, 25, 50, 100 e todos. Padrão 25. A barra só aparece quando há mais itens que a página; mostra até 5 botões de página; se a página atual passa do total, volta para a última [R1-12][R1-13].
- **Observação (leitura direta)**: busca com espera de 300 ms após digitar. Abre com "/" quando o painel está ativo ou Ctrl/Cmd + F. Esc fecha e devolve o foco. Sem resultado, estado vazio com ação de limpar. Durante a busca o realce de itens pareados é desligado [R1-12].
- **Observação (leitura direta)**: limites de exibição por tamanho do JSON da página atual: 1 MB nas vistas tabela e JSON, 4 MB na vista esquema, 512 KB no painel de logs. Acima disso, aviso com o tamanho em MB (uma casa) e duas ações: baixar o JSON ou exibir mesmo assim [R1-13].
- **Observação (leitura direta)**: a tabela mostra até 40 colunas; acima, aviso com atalho para a vista JSON. Colunas podem ser recolhidas e restauradas. Existe uma constante de 250 itens para exibir tudo automaticamente [R1-12][R1-13].
- **Observação (leitura direta)**: a vista JSON é uma árvore virtualizada (profundidade 10) com ações de copiar valor, caminho do item e caminho do campo [R1-12].
- **Observação (leitura direta)**: a vista binária mostra nome, local, extensão, tipo MIME e tamanho, com ver (só tipos visualizáveis) e baixar [R1-12].

### 1.7 Estados da saída

**Observação (leitura direta)** [R1-12]:
- nunca executou: convite para executar, ou para inserir dados de teste quando o nó aceita fixar dados; gatilho tem ícone diferente;
- executando: indicador de carregamento;
- executou sem itens: mensagem com atalho para a configuração de sempre gerar saída;
- erro: vista de erro dedicada; com metadados de IA pode abrir já no modo de logs;
- dados redigidos: estado próprio com ação de revelar quando permitido;
- agente com ferramentas que não usou nenhuma: aviso próprio;
- dados fixados: faixa informando, com ação de desafixar (oculta em somente leitura); a faixa some na edição e na prévia de produção.

### 1.8 Fixar e editar saída

- **Observação (leitura direta)**: só fixa nó com exatamente uma saída principal (saída de erro não conta). Ficam fora: nó de laço em lotes, nota adesiva, subnós. Botão desativado sem dados, com binário, ou em somente leitura (rota, ambiente protegido, fluxo arquivado, outra pessoa editando). Com várias rodadas, um aviso de 2 s diz qual rodada foi fixada [R1-12].
- **Observação (leitura direta)**: limites de fixação: soma dos dados fixados do fluxo até 12 MB (ajustável pela instância) e fluxo inteiro abaixo de 16 MB menos 2 KB. Estourou, erro com o tamanho e o limite em MB, e nada é salvo [R1-13].
- **Observação (leitura direta)**: editar abre um editor JSON preenchido, nesta ordem de preferência: dados fixados, saída atual, saída da última execução com sucesso (com aviso), dados fictícios. Salvar valida o JSON (erro mostra linha e posição, com dica específica para aspas simples), valida o tamanho e fixa. Cancelar descarta [R1-12].
- **Observação (leitura direta)**: a tecla P no canvas fixa ou desafixa a seleção [R1-12].

### 1.9 Realce de itens pareados

- **Observação (leitura direta)**: passar o mouse numa linha de entrada ou saída marca aquele item. O outro lado realça as linhas ligadas a ele pela ligação de itens. Sem foco, a primeira linha da entrada fica realçada quando o pai é direto. O item em foco também define qual item a prévia de expressões usa [R1-12].

### 1.10 Aba de configurações do nó

- **Observação (REA ev_98bf0cba...)**: configurações formam um módulo próprio, separado do painel [R1-1][R1-4].
- **Observação (leitura direta)**, abas do centro: ação (quando o nó tem), credencial (com alerta de problema), parâmetros e configurações, mais link de documentação [R1-12].
- **Observação (leitura direta)**, configurações e padrões [R1-12]:

| Configuração | Padrão | Limite |
| --- | --- | --- |
| Sempre gerar saída | desligado | |
| Executar uma vez | desligado | |
| Tentar de novo em falha | desligado | |
| Número de tentativas | 3 | 2 a 5, só com a anterior ligada |
| Espera entre tentativas | 1.000 ms | 0 a 5.000 ms, só com a anterior ligada |
| Em erro | parar o fluxo | parar; seguir pela saída normal; seguir por saída de erro |
| Notas | vazio | caixa de 5 linhas |
| Mostrar nota no canvas | desligado | |

- **Observação (leitura direta)**: as seis primeiras somem em nós de ferramenta e de modelo de IA. Valor antigo de "continuar em falha" é lido como seguir pela saída normal [R1-12].
- **Observação (leitura direta)**: rodapé mostra tipo e versão do nó com marca de mais recente, de versão mais nova disponível, ou de obsoleto. O botão de executar avisa quantas vezes o nó vai rodar quando há vários itens de entrada [R1-12].

### 1.11 Especificação para o VEXOR (painel do nó)

1. Modal de três colunas: Entrada | Parâmetros e Configurações | Saída. Gatilho sem entrada perde a coluna esquerda.
2. Larguras em porcentagem, por perfil de nó (sem entrada, normal, largo), mínimo 368 px no centro e 120 px nas laterais, gravadas ao soltar.
3. Fechar com Esc, clique fora e botão. Se a saída está em edição, perguntar se fixa antes. Bloquear Ctrl/Cmd + S do navegador.
4. Navegação sem fechar: atalhos para pai, filho e subnó (Ctrl/Cmd + Shift + Alt + setas) e ícones nas bordas. Ao trocar de nó, zerar rodada e nó de entrada.
5. Entrada: seletor de todos os ancestrais ordenados por distância, com filtro. Padrão: primeiro pai com dados.
6. Estados da entrada: sem pai, pai sem execução (com ação de executar anteriores), executando, pai desativado, erro anterior, somente leitura.
7. Saída: vistas esquema, tabela, JSON, binário; vista lembrada por lado (entrada esquema, saída tabela); troca automática para binário.
8. Contagem de itens sempre visível; com busca, X de Y.
9. Seletor de rodada quando houver mais de uma rodada; abas por ramo de saída com contagem.
10. Paginação: 1, 10, 25, 50, 100, todos; padrão 25.
11. Busca com espera de 300 ms; "/" e Ctrl/Cmd + F abrem; Esc fecha.
12. Proteção de exibição: 1 MB (tabela e JSON), 4 MB (esquema), 512 KB (logs), com baixar ou exibir mesmo assim.
13. Tabela até 40 colunas; acima, sugerir JSON.
14. Fixar: só nó com uma saída principal; limite 12 MB de dados fixados e 16 MB por fluxo; faixa de dados fixados com desafixar.
15. Editar saída: editor JSON com preenchimento em cascata, validação de sintaxe com linha e posição, salvar fixa.
16. Realce de itens pareados entre entrada e saída ao passar o mouse.
17. Configurações com os padrões e limites da tabela acima.

## 2 Canvas

### 2.1 Estrutura

- **Observação (REA ev_1ee4191a...)**: canvas, nó, ligação, barra de ferramentas do nó e da ligação, travessia por teclado e o mapeamento de dados para o canvas vivem num único arquivo grande do pacote (cerca de 224 KB). A análise foi truncada no teto de nós semânticos [R1-5].
- **Observação (REA ev_fee04000...)**: esse arquivo importa o módulo de atalhos de teclado, que é um arquivo separado e pequeno [R1-6].

### 2.2 Teclado

- **Observação (leitura direta)**: o módulo de atalhos escuta teclas no documento (ou na janela destacada de logs, quando existe). No Mac, Cmd conta como Ctrl. A tecla é resolvida pela tecla lógica, depois pelo mapa de layout do teclado, depois pelo código físico para teclas não letra ou letras não latinas com Ctrl. Atalho reconhecido bloqueia o comportamento padrão do navegador. Atalhos são ignorados com foco em campo de texto ou editor [R1-12].
- **Observação (leitura direta)**, atalhos que valem também em somente leitura [R1-12]:

| Tecla | Efeito |
| --- | --- |
| Ctrl/Cmd + Shift + O | Abrir o subfluxo do nó selecionado |
| Ctrl/Cmd + C | Copiar seleção |
| Enter | Abrir o nó selecionado |
| Ctrl/Cmd + A | Selecionar tudo |
| + ou = | Aproximar |
| - ou _ | Afastar |
| 0 | Zoom 100% |
| 1 | Enquadrar tudo |
| Setas cima e baixo | Ir ao irmão acima ou abaixo (mesmo pai ou mesmo filho, ordem por altura, com volta) |
| Setas esquerda e direita | Ir ao primeiro pai ou ao primeiro filho |
| Shift + setas esquerda e direita | Selecionar tudo a montante ou a jusante, mais o próprio nó |
| L | Abrir ou fechar o painel de logs |
| I e O | Mostrar ou esconder entrada e saída no painel de logs |

- **Observação (leitura direta)**, atalhos só em edição, além dos de [A2] [R1-12]:

| Tecla | Efeito |
| --- | --- |
| Delete ou Backspace | Excluir seleção |
| Ctrl/Cmd + D | Duplicar seleção |
| R | Substituir o nó selecionado |
| C | Abrir o chat de teste |
| Shift + F | Alternar painel de foco |
| Alt + U | Copiar URL de produção do webhook selecionado |
| Shift + Alt + U | Copiar URL de teste do webhook selecionado |
| Alt + I | Enviar a seleção ao assistente de IA |
| Espaço (toque curto) | Renomear o nó selecionado |
| Tab | Só mostra aviso de atalho antigo; abrir criação agora é N |

- **Observação (leitura direta)**: pan com espaço ou Ctrl/Cmd segurado (o arrasto esquerdo deixa de selecionar), botão do meio sempre faz pan, roda faz pan. Ctrl/Cmd + clique soma à seleção. A tecla de exclusão nativa da biblioteca de grafo está desligada (a exclusão passa pelo atalho do editor) [R1-12].

### 2.3 Viewport

- **Observação (leitura direta)**: zoom máximo 4, mínimo sem limite prático, padrão 1. Enquadrar usa margem de 20% e não passa do zoom 1. Grade de 16 px com encaixe ligado. Raio de captura de ligação 60 px [R1-12][R1-13].
- **Observação (leitura direta)**: o minimapa (200 x 120, canto inferior esquerdo) só aparece enquanto o canvas se move e some 1 s depois; fica enquanto o mouse está sobre ele [R1-12].
- **Observação (leitura direta)**: botões de controle: enquadrar, aproximar, afastar, organizar (só em edição) e restaurar zoom (só quando zoom diferente de 1). Abaixo de zoom 1, bordas ganham contraste gradual [R1-12].

### 2.4 Estados do nó

- **Observação (leitura direta)**: um único ícone de status por nó, por prioridade: integração da comunidade não instalada; desativado; erro de execução (lista de erros, repetidos agrupados com contagem); erro de validação de parâmetros; dados fixados; desatualizado (com motivo: parâmetro mudou ou algo antes mudou); sucesso. Sucesso e desatualizado mostram o número de rodadas quando maior que 1. O nó em si não mostra contagem de itens [R1-12].
- **Observação (leitura direta)**: borda colorida em sucesso, desatualizado, fixado e erro. Executando: anel animado girando em volta do nó (volta curta). Em espera: o mesmo anel mais lento. Desativado: cinza com rótulo e, quando o nó tem uma entrada e uma saída simples, uma linha riscando o nó de ponta a ponta [R1-12].
- **Observação (leitura direta)**: gatilho tem lado esquerdo arredondado, marca de gatilho e, em edição, um botão para executar o fluxo a partir dele (desativado durante execução). Ícones pequenos sinalizam configurações ligadas: sempre gerar saída, executar uma vez, tentar de novo, continuar em erro [R1-12].
- **Observação (leitura direta)**, regras de desatualizado: só nós que já rodaram. Compara o início da última execução com: hora da última mudança de parâmetro; comandos do histórico de desfazer depois da execução (ligação nova chegando, nó pai novo, pai reativado, pai removido); dados fixados de um pai alterados; dados fixados do próprio nó removidos. Mudança em subnó pai vira "algo antes mudou". Dentro de laço, o nó de entrada do laço também fica desatualizado [R1-12].

### 2.5 Ligações

- **Observação (leitura direta)**: rótulo de itens sobre a ligação. Origem com dados fixados: quantidade fixada. Senão, soma das rodadas daquela saída, com variante de total quando houve mais de uma rodada. Ligação principal só mostra se total maior que 0. Saída sem ligação mostra a contagem ao lado do conector [R1-12].
- **Observação (leitura direta)**: cor da ligação por prioridade: executando (origem rodando, total 0), fixado, erro, sucesso (total maior que 0 e última rodada não cancelada) [R1-12].
- **Observação (leitura direta)**: ligações de subnó são tracejadas e sem seta. Ligação que volta para trás (destino mais de 20 px à esquerda) é desenhada em degraus por baixo [R1-12].
- **Observação (leitura direta)**: ao passar o mouse, a ligação mostra botões de inserir e excluir no lugar do rótulo; a barra persiste 600 ms depois de sair. Não aparece em somente leitura [R1-12].
- **Observação (leitura direta)**, inserir entre nós: o novo nó vai à direita da origem, 208 px, mesma altura. Vizinhos só são empurrados se faltar espaço; empurra 208 px para a direita os nós na mesma faixa e seus descendentes; notas esticam ou se movem. Religa origem, novo nó, destino e remove a ligação antiga [R1-12][R1-13].
- **Observação (leitura direta)**, excluir com religação: ao excluir um nó no meio, liga os pais da primeira entrada aos filhos da primeira saída do mesmo tipo [R1-12].
- **Observação (leitura direta)**: conector de saída livre mostra um "+" para adicionar o próximo nó; some durante o arrasto de ligação. Conector com limite de ligações atingido não aceita mais [R1-12].

### 2.6 Organizar automaticamente

- **Observação (leitura direta)**: usa uma biblioteca pública de layout de grafo em camadas (dagre, licença MIT). Com dois ou mais nós selecionados, organiza só a seleção. Separa componentes conexos, organiza cada um da esquerda para a direita (8 grades entre camadas, 6 grades entre nós) e empilha os componentes (8 grades). Agente de IA e seus subnós formam bloco de cima para baixo. O resultado mantém o canto superior esquerdo original. Notas ficam fora do layout; nota que cobria nós é recentrada sobre eles [R1-12].

### 2.7 Notas

- **Observação (leitura direta)**: tamanho mínimo 150 x 80. Sete cores fixas mais cor livre. Editar com duplo clique ou Enter; em edição a nota fica por cima. Excluir igual a nó (barra ou Delete) [R1-12].

### 2.8 Botão de executar e parar

- **Observação (leitura direta)**: botão principal com três estados: parado, executando, aguardando evento. Com mais de um gatilho, vira botão dividido com escolha do gatilho (ordenados por posição). Botão de parar a execução e botão de parar de esperar webhook são distintos [R1-12].
- **Observação (leitura direta)**: só uma execução manual por vez; pedir outra com uma ativa é ignorado. Execução parcial manda o nó de destino, os nós de partida e os dados já existentes [R1-12].

### 2.9 Especificação para o VEXOR (canvas)

1. Grade de 16 px com encaixe; zoom até 4x; enquadrar com 20% de margem sem passar de 1x.
2. Teclado: tabela da seção 2.2, separando somente leitura de edição; ignorar atalhos em campos de texto; Cmd igual a Ctrl no Mac; bloquear o padrão do navegador.
3. Navegação por setas entre pai, filho e irmãos; Shift + seta seleciona a montante ou a jusante.
4. Um ícone de status por nó, por prioridade fixa; anel animado para executando e espera; borda por estado.
5. Desatualizado calculado por tempo: mudança de parâmetro, ligação ou dado fixado depois da última execução; propagar para a entrada de laço.
6. Rótulo de contagem de itens na ligação e ao lado da saída livre; cor da ligação por estado.
7. Inserir no meio da ligação: 208 px à direita, empurrar vizinhos só se faltar espaço, religar.
8. Excluir no meio religa pai e filho do mesmo tipo.
9. Organizar automaticamente com layout em camadas, seleção ou fluxo todo, notas acompanhando.
10. Minimapa só durante o movimento.
11. Botão de executar com estados e seleção de gatilho; botão de parar separado.

## 3 Execuções e logs

### 3.1 Estrutura

- **Observação (REA ev_9d3a99a6...)**: lista global, lista por fluxo e filtro com tempo estão em três arquivos; a análise achou uma relação de temporizador e 43 de promessas [R1-7].
- **Observação (REA ev_4179c667...)**, [R1-8][R1-9]: o arquivo do painel de logs grava 3 e lê 2 valores no armazenamento local, abre uma conexão WebSocket (atualização ao vivo) e faz requisições ao endereço de webhook do chat de teste.

### 3.2 Lista global

- **Observação (leitura direta)**, colunas: seleção, fluxo (abre a execução em nova aba), status, início, duração, id (com marca de repetição de outra execução), modo (manual ou chat), parar, menu [R1-12].
- **Observação (leitura direta)**, estados exibidos: sucesso; erro (linha inteira destacada); travada (aparece como erro); em espera (dica com até quando; espera sem prazo tem dica própria); nova (na fila, dica com limite de concorrência); em execução (indicador animado); desconhecida e cancelada (ícones neutros). Sem início: começa em breve [R1-12].
- **Observação (leitura direta)**: ordem por criação, mais nova primeiro. Em andamento ficam numa coleção à parte mostrada antes; com concorrência, executando antes de na fila [R1-12].
- **Observação (leitura direta)**: paginação por cursor, 10 por vez, carregando ao rolar até o fim. Com filtro executando não carrega mais [R1-12].
- **Observação (leitura direta)**: atualização automática ligada por padrão a cada 4 s, pausa com a aba oculta, desligável por caixa, não persiste. Duração em andamento é um cronômetro de 1 s [R1-12]. **Observação (REA ev_9d3a99a6...)** registra o temporizador [R1-7].
- **Observação (leitura direta)**: seleção só de execuções terminadas. Marcar o cabeçalho seleciona as visíveis e oferece selecionar todas as N (todas as páginas). Excluir em massa confirma com a quantidade; com todas marcadas, apaga por filtro e data, não por lista de ids [R1-12].
- **Observação (leitura direta)**: parar aparece em execução sem fim ou em espera. Parar todas aparece só se houver alguma nova, executando ou em espera, e abre confirmação [R1-12].
- **Observação (leitura direta)**: repetir só para erro ou travada sem repetição bem-sucedida, com duas opções (fluxo atual ou original). Repetir exige permissão de executar; excluir exige permissão de editar [R1-12].
- **Observação (leitura direta)**: com concorrência ativa (fora do modo fila), um cabeçalho mostra X de Y em execução [R1-12].

### 3.3 Filtros

- **Observação (leitura direta)**: fluxo; status (qualquer, erro, cancelada, nova, executando, sucesso, espera; erro inclui travada e executando inclui nova); período de início; etiquetas de anotação e voto (plano avançado); versão do fluxo (só na tela do fluxo); dado personalizado chave e valor com opção de correspondência exata (plano avançado). Datas e dado personalizado esperam 500 ms. Contador de filtros ativos e botão de limpar. Filtros não vão para a URL nem para o armazenamento [R1-12].

### 3.4 Execuções de um fluxo e detalhe

- **Observação (leitura direta)**: barra lateral com rolagem infinita (lotes de 20 com espera de 1 s), atualização automática, concorrência e filtros. Ao entrar sem execução escolhida, abre a mais recente. Execução fora da lista carregada aparece como cartão provisório no topo. Rodapé informa se o fluxo salva execuções de produção e de teste [R1-12].
- **Observação (leitura direta)**: lista vazia: fluxo sem gatilho oferece ir ao editor para adicionar o primeiro passo [R1-12].
- **Observação (leitura direta)**: detalhe: nova mostra parar; executando mostra indicador e parar; demais mostram início, voto, status, duração, id, link para a versão do fluxo que rodou, link para a original quando é repetição, etiquetas, depurar, repetir, dados personalizados, excluir e o canvas somente leitura com dados [R1-12].
- **Observação (leitura direta)**, depurar no editor: sucesso vira copiar para o editor; outros status viram depurar. Exige permissão de editar. Se algum nó executado já tem dado fixado, pede confirmação e remove esses fixados. Carrega a execução, fixa a primeira saída não vazia de cada nó sem pai (gatilhos e raízes) sem marcar o nó como alterado, avisa e lista nós da execução que não existem mais [R1-12].
- **Observação (leitura direta)**: excluir no detalhe navega para a próxima, senão a anterior, senão a página vazia [R1-12].
- **Observação (leitura direta)**: voto positivo e negativo; clicar no voto ativo remove. Links para execução pai e subexecuções abrem em nova aba [R1-12].
- **Observação (leitura direta)**: dados redigidos mostram estado vazio com revelar (quando permitido); revelar pede confirmação com aviso de auditoria e busca a execução de novo sem redação [R1-12].

### 3.5 Painel de logs

- **Observação (leitura direta)**: da esquerda para a direita: chat de teste (se houver gatilho de chat), árvore de visão geral e detalhes (só com seleção) [R1-12].
- **Observação (leitura direta)**, tamanhos lembrados no armazenamento local [R1-12], confirmados como gravação local por **Observação (REA ev_a5132875...)** [R1-9]:

| Parte | Padrão | Mínimo | Máximo |
| --- | --- | --- | --- |
| Altura do painel | 30% da janela | 160 px | 75%; recolhido 32 px |
| Chat | menor entre 800 px e 30% | 240 px | 80% |
| Árvore | menor entre 240 px e 20% | 80 px | 500 px |
| Entrada nos detalhes | 50% | 200 px | |

- **Observação (leitura direta)**: pode ser destacado em janela separada (80% da largura, 400 px de altura), que copia o tema e volta ao lugar quando fechada. Clicar no cabeçalho abre e recolhe. Opção de sincronizar seleção com o canvas [R1-12].
- **Observação (leitura direta)**: árvore com uma linha por rodada de nó, subnós de IA aninhados, ordem por início. Nós desativados ou sem dados ficam fora. Tudo começa expandido. Subfluxos carregam ao expandir. Lista virtual com linhas de 32 px [R1-12].
- **Observação (leitura direta)**: durante a execução nada é selecionado e a lista acompanha o fim. Ao terminar, seleciona o primeiro nó com erro, senão o agente de IA, senão o último [R1-12].
- **Observação (leitura direta)**, teclado com foco no painel: J ou seta para baixo (próximo), K ou seta para cima (anterior), Esc (limpar seleção), espaço (expandir ou recolher), Enter (abrir o painel do nó), Ctrl/Cmd + F (buscar) [R1-12].
- **Observação (leitura direta)**: cada linha mostra status, duração ao vivo, início e tokens; ações de abrir o painel do nó e executar até este nó. Resumo no topo com status, tempo e total de tokens. Detalhes somente leitura: entrada em esquema, saída em tabela, sem fixar [R1-12].
- **Observação (leitura direta)**: limpar execução só aparece em edição, sem execução ativa, com algum gatilho ativo e com dados [R1-12].

### 3.6 Especificação para o VEXOR (execuções e logs)

1. Lista global com as colunas da seção 3.2, em andamento no topo, paginação por cursor de 10, rolagem infinita.
2. Atualização automática a cada 4 s, pausa com a aba oculta, desligável.
3. Exibir todos os estados da API: sucesso, erro, travada (como erro), espera, nova (como na fila), executando, cancelada, desconhecida.
4. Seleção em massa com "todas as N" e exclusão por filtro.
5. Repetir só falhas, com fluxo atual ou original; parar individual e parar todas.
6. Filtros da seção 3.3 com espera de 500 ms em datas e dado personalizado.
7. Tela por fluxo: lateral com lotes de 20, abre a mais recente, detalhe com canvas somente leitura.
8. Depurar no editor: fixar a saída das raízes, confirmar antes de sobrescrever fixados, avisar nós sumidos.
9. Painel de logs inferior, redimensionável e lembrado, árvore por rodada, seleção automática do erro ao fim, teclado J e K.
10. Atualização ao vivo por canal push (WebSocket no n8n; no VEXOR pode ser SSE ou WebSocket).

## 4 Desconhecidos do 01 que foram resolvidos

| Desconhecido no 01 | Resposta | Evidência |
| --- | --- | --- |
| Limites de zoom (2.1) | Máximo 4x, padrão 1x, enquadrar até 1x com margem de 20% | R1-12 |
| Alinhamento em grade (2.1) | Grade de 16 px com encaixe ligado | R1-12, R1-13 |
| Rótulo de contagem de itens na ligação (2.1, 2.5) | Existe; soma das rodadas; variante de total; some no hover | R1-12 |
| Substituição direta de nó (2.1, 2.4) | Existe, tecla R com nó selecionado | R1-12 |
| Indicador de erro e espera sobre o nó (2.4) | Ícone de erro com lista agrupada; espera é anel animado lento | R1-12 |
| Contagem de itens no nó (2.4, 2.10) | O nó não mostra itens, só número de rodadas; itens ficam na ligação | R1-12 |
| Estilo da ligação de subnó (2.5) | Tracejada, sem seta | R1-12 |
| Excluir nota (2.6) | Igual a nó: barra ou Delete | R1-12 |
| Navegação entre nós sem fechar (2.8) | Ícones nas bordas e Ctrl/Cmd + Shift + Alt + setas | R1-12 |
| Seletor do nó de entrada (2.8) | Todos os ancestrais por distância, com filtro | R1-12 |
| Aba de binário (2.8) | Vista binária com metadados, ver e baixar | R1-12 |
| Contagem de itens e tempo no painel (2.8) | Contagem sempre; tempo só com várias rodadas e sem fixados | R1-12 |
| Paginação de itens (2.8) | 1, 10, 25, 50, 100, todos; padrão 25 | R1-12, R1-13 |
| Estados de carregamento do painel (2.8) | Indicador ao executar; executando anteriores; dados grandes com exibir mesmo assim | R1-12 |
| Tentativas e espera (2.9) | 3 tentativas (2 a 5), 1.000 ms (0 a 5.000) | R1-12 |
| Versão do nó na interface (2.9) | Rodapé com tipo, versão e marca de atualização | R1-12 |
| Barra de progresso da execução (2.10) | Não há barra; anel animado por nó e cronômetro no logs | R1-12 |
| Colunas da lista de execuções (3.2) | Nove colunas, ver 3.2 | R1-12 |
| Atualização automática (3.2) | 4 s, desligável, pausa com aba oculta | R1-12, R1-7 |
| Paginação, seleção e exclusão em massa (3.2) | Cursor de 10; selecionar todas as N; exclusão por filtro | R1-12 |
| Ordenação da lista (3.2) | Em andamento primeiro, depois criação decrescente | R1-12 |
| Estados cancelada, travada, nova, desconhecida (3.5) | Travada aparece como erro, nova como na fila, cancelada e desconhecida com ícones próprios | R1-12 |
| Persistência dos filtros | Não persistem | R1-12 |

## 5 Desconhecidos que continuam

- **Desconhecido**: comportamento em tempo real (animações, ordem de foco, latência). Nenhuma captura em execução foi feita; tudo aqui é estático.
- **Desconhecido**: regra exata de quais campos ignoram atalhos. Está num utilitário que não foi lido.
- **Desconhecido**: tamanho padrão de uma nota nova e cores exatas de cada estado (não buscados por regra clean-room e por não serem necessários).
- **Desconhecido**: como o painel de logs decide abrir ou recolher sozinho no início e no fim de uma execução. O estado do painel fica num arquivo não lido.
- **Desconhecido**: valor do intervalo de atualização em lote do painel de logs durante execuções longas.
- **Desconhecido**: posicionamento exato de nós colados e duplicados (a função de importação não foi lida).
- **Desconhecido**: colunas e filtros da lista de credenciais, fluxo de modelos, celular e barra de comandos (fora do escopo deste agente; seguem como no 01).
- **Desconhecido**: grupos de canvas no código (não lidos aqui; o 01 cobre pela documentação).

## Ledger R1

Evidências REA desta rodada exportadas em `D:\VEXOR\_ref\n8n\evidence\r1-editor-rea-bundle.json` (19 registros, fora do repositório). Parâmetros de toda análise: um a três arquivos, `detail summary`, heap 512 MB, teto de 20.000 nós semânticos, uma análise por vez.

| Id | Ferramenta | Alvo | evidence_id | O que mostrou |
| --- | --- | --- | --- | --- |
| R1-1 | analyze_javascript_application | painel do nó novo, painel de saída e nós flutuantes, configurações (3 arquivos) | ev_98bf0cba8f02201a21d4d688de3cb7d6f04fef73b76011571d8a9db9bccfaa23 (resumo ev_10ecf674c7aadc6de9a78998a61c81bf80d137ee967761a90e79023dfea3f1a3) | 3 arquivos lidos sem falha, 362 achados, cobertura parcial, 13 relações de evento, 7 de temporizador |
| R1-2 | trace_application_feature | semente de texto do evento de tecla na análise R1-1 | ev_f9cf65258925ac62c17a8a27cb24002d7facbe27e8bd7c07b51907af73e3dbef | Sem correspondência; o grafo não indexa literais soltos. Não prova ausência |
| R1-3 | inspect_analysis_view (javascript-facts) | arquivo do painel do nó novo | ev_437888af6817c131fdca54f9ca7b1aa0a933ced15757d7dc46b519e98736e72c | Leitura e gravação de armazenamento local no painel |
| R1-4 | inspect_analysis_view (javascript-facts) | módulos e armazenamento dos 3 arquivos | ev_48159e03ba8e90ac3a1ba3203bc5cf5f1a3d0950eeecc15af4d3a77be013295e | Configurações e painel de saída são módulos próprios (127 e 90 importações); painel novo com 68 importações |
| R1-5 | analyze_javascript_application | canvas e mapeamento, atalhos, botão de executar (3 arquivos) | ev_1ee4191ae41f434cef77bafdda3f27b1ef374efc8d5b80ef4c6a67ecdf9e9ee9 (resumo ev_b71c4517527efe947da69cafa3f11f6fc7f5e7ffa041f1ebe4dac65cf489a3cf) | 87.640 nós de AST visitados, 343 achados, cobertura semântica truncada no teto de 20.000 |
| R1-6 | trace_application_feature | módulo de atalhos, direção de entrada | ev_fee04000498b9cf3903a167a492618ede022b4079a5d44f2b9c11e8838a4d898 | O arquivo do canvas importa o módulo de atalhos |
| R1-7 | analyze_javascript_application | lista por fluxo, lista global, filtro e tempo (3 arquivos) | ev_9d3a99a644fd0b35dd861bbc9d16ea825dfb02132fcf1c2420131636a58eb46b (resumo ev_99636dca5f4495df434bb771b1c14c06a3fd84c8102c2e02e2b3f2d202229df2) | 245 achados; 1 relação de temporizador; 43 de promessa |
| R1-8 | analyze_javascript_application | painel de logs, depuração de execução, árvore de logs (3 arquivos) | ev_4179c6671d66b2db25274363542b4da9f38defb77e426f55a3d3218f19a58802 (resumo ev_0377529c54e8d944b45cae14528e925150be74d91d1198a22bfaf0defb43187e) | 348 achados; 24 relações de evento; 14 de requisição |
| R1-9 | inspect_analysis_view (javascript-facts) | armazenamento e rede no arquivo de logs | ev_a5132875e88e592369716ca317c00a8c12a8a3b5eece3e35770a773eabff2897 | 3 gravações e 2 leituras locais; WebSocket; requisições ao webhook do chat |
| R1-10 | analyze_javascript_application (anterior, E8) | arquivo de dados de execução | ev_c5dcac785c2d39c7c783ca6fd51c72d5df33463cc6b6e9dda625167652771153 | Contagem de itens, paginação, botão de fixar e vista de erro no mesmo arquivo |
| R1-11 | export_evidence_bundle | sessão REA desta rodada | não se aplica | `r1-editor-rea-bundle.json`, 19 registros |
| R1-12 | leitura direta, sem REA | conteúdo de origem dos `.map` das áreas painel, dados de execução, configurações, canvas, execuções e logs (144 arquivos extraídos para pasta temporária) | não se aplica | Comportamento descrito nas seções 1 a 3; nada copiado |
| R1-13 | leitura direta, sem REA | constantes do editor nos `.map` (limites, grade, página) | não se aplica | Grade 16 px; página 25; exibição 1 MB, 4 MB, 512 KB; fixados 12 MB; fluxo 16 MB; 250 itens; deslocamento de inserção 208 px |
