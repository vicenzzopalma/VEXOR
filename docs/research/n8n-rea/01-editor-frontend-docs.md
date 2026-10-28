# Paridade VEXOR x n8n, fase 1: reconhecimento do editor e da interface pela documentação pública

Agente A. Data de acesso de todas as fontes: 2026-10-28. Fonte única: o site de documentação pública (docs.n8n.io). Nenhum código, repositório, asset ou texto de interface foi copiado. Tudo aqui é descrição em palavras próprias, para uso em sala limpa.

## Como ler

Cada tópico separa três tipos de afirmação:

- **Observação**: está escrito na documentação. Cada observação cita a fonte entre colchetes, por exemplo [A2]. A lista completa está no "Ledger de fontes".
- **Inferência**: dedução minha a partir das observações. Sempre digo o motivo. Não é fato documentado.
- **Desconhecido**: a documentação não permite afirmar. Vai também para a seção final "Desconhecidos em aberto".

Convenções:

- Nomes de recursos e rótulos de botão estão parafraseados. Quando a documentação dá um atalho de teclado, o atalho é citado como está (teclas não são texto de interface).
- Nós são descritos por função (por exemplo, "nó de código", "nó de webhook"), nunca pelo nome comercial.
- Versões citadas vêm das notas de versão públicas. A documentação consultada descreve o produto na linha 2.x; a nota de versão mais recente vista é a 2.45, datada de 2026-10-20 [A114].
- Sem travessão no texto, sem métricas inventadas. Todo número vem de uma fonte citada.

## 0. Contexto do levantamento

**Observação**

- O site de documentação foi reorganizado em seções de alto nível: primeiros passos, construir (fluxos, execuções, dados, lógica, código, IA, atalhos), administrar (usuários e acesso, credenciais, controle de versão, observabilidade), implantar (hospedagem, configuração), conectar (API, servidor MCP) e changelog [A9]. As URLs antigas (por exemplo, a de atalhos e a de execuções) redirecionam para as novas [A2][A4].
- Existe um índice completo em texto (llms.txt) e cada página tem uma versão Markdown acessível acrescentando ".md" à URL [A1][A9].
- Os cursos antigos (que descreviam a interface tela a tela) saíram do site de documentação e redirecionam para um site de aprendizagem separado; por regra deste levantamento, não foram consultados [A117].

**Inferência**

- A documentação oficial é orientada a tarefas, não a telas. Por isso vários detalhes visuais (colunas de tabelas, paginação, ordenação, estados de carregamento) ficam sem registro e aparecem aqui como "Desconhecido". O motivo: nenhuma página consultada descreve esses pontos, e as páginas que o faziam (cursos) saíram do site.

## 1. Navegação geral

### 1.1 Barra lateral (menu principal)

**Observação**

- Há um botão universal de criação no canto superior esquerdo do menu lateral. Ao usá-lo, escolhe-se o tipo (fluxo ou credencial) e, quando a instância suporta projetos, o destino: espaço pessoal ou um projeto acessível. Na edição comunitária, tudo vai para o espaço pessoal [A10][A18].
- Esse mesmo menu de criação passou a oferecer variáveis e tabelas de dados, com submenus de escopo, e um item de nova conversa de IA quando a IA de instância está disponível [A114].
- Itens de navegação documentados: o espaço pessoal (onde ficam fluxos e tabelas de dados do usuário) [A22]; projetos [A8]; uma seção de favoritos que só aparece depois do primeiro favorito, agrupada por tipo na ordem projetos, pastas, fluxos e tabelas de dados, com um "x" ao lado de cada item para remover sem abrir [A24]; a lista de execuções [A20]; o painel de indicadores de uso [A65]; a central de conversa com modelos e agentes [A52]; o assistente conversacional de construção [A22][A49]; a caixa de revisões pendentes [A39]; botões de enviar e puxar do controle de versão, visíveis com o menu recolhido ou aberto, com uma cor personalizada do ambiente ao lado [A71][A72]; configurações; ajuda e documentação (listadas como navegação geral na barra de comandos) [A2].
- O menu lateral anima ao recolher e expandir, e a animação pausa durante redimensionamento manual [A114].
- Na nuvem, o menu de ajuda tem um item de contato com suporte [A114]. O dono da instância na nuvem acessa o console de administração a partir de um painel de administração dentro do editor [A101].
- Há uma variável de ambiente que oculta a página de uso e plano [A113].

**Inferência**

- A barra lateral é recolhível e redimensionável, porque a nota de versão fala em animação de recolher e em redimensionamento manual [A114].

**Desconhecido**

- Ordem exata dos itens no menu, ícones usados, comportamento com muitos projetos (rolagem, agrupamento).

### 1.2 Página inicial (visão geral) e suas abas

**Observação**

- A página de visão geral lista os fluxos do próprio usuário, os compartilhados com ele, os dos projetos de que participa e, para donos e administradores, todos os fluxos da instância. Abrir um projeto mostra só os fluxos daquele projeto [A41].
- Abas documentadas na visão geral e nas páginas de projeto: fluxos [A41]; credenciais [A66]; execuções (na visão geral, execuções de todos os fluxos acessíveis; no projeto, só as do projeto) [A14]; variáveis (na visão geral e em cada projeto; antes da versão 1.118 as variáveis globais ficavam no menu lateral) [A55]; tabelas de dados [A22][A25]; agentes (no projeto) [A80].
- No alto da visão geral há uma faixa de resumo de indicadores de uso com janela móvel de 7 dias comparada ao período anterior; cada indicador é clicável e abre o gráfico correspondente no painel completo [A65].
- Um botão de criação (botão dividido) fica no canto superior direito da visão geral e das páginas de projeto; dali se cria fluxo, credencial ou tabela de dados [A10][A18][A25].
- Tabelas de dados também podem ser criadas pelo menu suspenso do botão de criar fluxo no canvas [A78].

**Inferência**

- A visão geral funciona como "projeto virtual" do espaço pessoal mais tudo que o usuário enxerga, porque as abas são as mesmas das páginas de projeto e a documentação trata a criação a partir dela como criação no espaço pessoal [A10][A18].

**Desconhecido**

- Layout em cartões ou tabela, contagens por aba, presença de atalhos de "recentes" fora da barra de comandos.

### 1.3 Projetos

**Observação**

- Projetos agrupam fluxos, credenciais, variáveis, tabelas de dados e agentes, com papel por usuário; um usuário pode ter papéis diferentes em projetos diferentes [A8][A76].
- Criar: donos e administradores da instância usam um botão de adicionar projeto, preenchem as configurações e salvam [A8].
- Página de configurações do projeto: gerenciar membros (buscar por nome ou e-mail, escolher o papel, salvar; remover pelo menu de três pontos do membro), renomear, excluir [A8]. Ao excluir, escolhe-se entre transferir fluxos e credenciais para outro projeto ou excluir tudo após confirmação [A8]. A página também lista cofres de segredos compartilhados com o projeto [A69].
- Projetos têm nome, descrição e ícone [A42]; o seletor de ícone busca ícones e emojis por rótulo, tem cores e tons de pele e um botão de escolha aleatória [A114].
- Favoritar: estrela no cabeçalho de projetos de equipe ou item no menu de três pontos (projeto pessoal só pelo menu) [A24][A8].
- Mover um fluxo ou credencial para outro projeto ou usuário: item de mover no menu do recurso, escolher destino, avançar, confirmar. Mover remove todo compartilhamento existente; ao mover um fluxo é possível compartilhar junto as credenciais que se tem permissão de compartilhar, e o sistema lista as que não pôde mover [A8].
- Lista de membros sempre mostra donos e administradores da instância com acesso total [A114]. O seletor de papel separa papéis do sistema e personalizados e mostra um resumo das permissões ao passar o mouse [A77]. Usuários com convite pendente podem ser adicionados a projetos já com papel [A78].
- Menus suspensos de projeto fazem busca no servidor com atraso de digitação, evitando carregar tudo de uma vez [A114].
- Disponibilidade: projetos e papéis existem em todos os planos da nuvem e em edições auto-hospedadas registrada, business e enterprise; a quantidade de projetos e papéis varia por plano [A8][A57].

**Inferência**

- O cabeçalho do projeto reúne nome, ícone, estrela e menu de três pontos, pois a documentação cita estrela "no cabeçalho" e ações no menu de três pontos ao lado do nome [A24][A8].

**Desconhecido**

- Limites numéricos de projetos por plano; se a descrição do projeto aparece na lista.

### 1.4 Lista de fluxos: busca, filtros, ordenação, paginação

**Observação**

- Cartões de fluxo mostram um indicador de publicado [A11], emblema de status de revisão [A114], ícone compacto de chave quando o fluxo usa credencial de usuário final [A114] e dependências (credenciais, tabelas de dados e subfluxos relacionados) [A114].
- Menu do cartão: favoritar e desfavoritar [A24], despublicar quando publicado [A114], habilitar acesso MCP [A92], mover [A8]. Ações de duplicar, arquivar e excluir constam da lista de ações de fluxo da barra de comandos [A2].
- Filtros: botão de filtros com filtro por tags (uma ou mais) [A37] e opção de mostrar fluxos arquivados [A78].
- A busca cobre subpastas em todos os níveis [A78]; a versão 1.122 trouxe melhorias de busca de fluxos [A78]; as páginas de lista de fluxos e credenciais passaram a carregar de 30% a 80% mais rápido na 2.10 [A77].
- Um indicador inline de acesso MCP nos cartões apareceu em teste A/B na 2.22.5 [A114].

**Inferência**

- A lista usa cartões (e não tabela), porque todas as fontes falam em "cartão" de fluxo [A11][A114][A92].

**Desconhecido**

- Critérios de ordenação da lista na interface (data, nome), paginação ou rolagem infinita, filtro por status publicado na lista principal, filtro por dono. A ferramenta de migração tem filtros por estado, última execução, última atualização, contagem de execuções, status de publicação, dono e projeto, além de caixa de busca e menu de ordenação, mas isso é uma página própria em configurações, não a lista principal [A115].

### 1.5 Pastas

**Observação**

- Pastas aninhadas sem limite, dentro do espaço pessoal e de projetos; é possível criar fluxos diretamente dentro de uma pasta e buscar fluxos dentro de pastas; disponível para instâncias registradas [A78][A102].
- Arrastar e soltar fluxos e pastas em outras pastas ou sobre posições da trilha de navegação (breadcrumbs) para reorganizar [A78].
- No canvas há trilha de navegação que leva a qualquer pasta superior do fluxo [A78].
- Pastas podem ser favoritadas pelo menu de três pontos [A24].
- Menu de opções ao lado do nome do projeto ou da pasta permite habilitar ou desabilitar acesso MCP em lote para os fluxos já presentes ali [A92].
- Em ambientes somente leitura, mover pastas é bloqueado [A78]. Nos diálogos de enviar e puxar do controle de versão, os fluxos aparecem agrupados por pasta em árvore, com seleção por pasta [A77][A114].
- Pela API pública: nome de pasta de até 128 caracteres, pasta pai opcional, mover para a raiz, excluir com transferência do conteúdo para outra pasta ou, sem destino, fluxos vão para a raiz e são arquivados e subpastas são excluídas; listagem com ordenação por nome, criação ou atualização e contagem recursiva de subpastas e fluxos [A108].
- Papéis personalizados de projeto têm permissões específicas de pasta: ver, editar, criar, transferir, excluir [A109].

**Inferência**

- Excluir uma pasta na interface deve oferecer a mesma escolha da API (transferir conteúdo ou arquivar fluxos), porque a API documenta esse comportamento e a interface arquiva por padrão em vez de excluir [A108][A78].

**Desconhecido**

- Diálogo de criar e renomear pasta, limite de profundidade na interface, aparência das pastas na lista (cartões ou linhas).

### 1.6 Tags

**Observação**

- Tags são globais na instância e um fluxo pode ter várias [A37]. Não são afetadas por papéis de projeto [A26].
- Adicionar: no fluxo aberto, um controle de adicionar tag ao lado do nome; escolher existente ou digitar nova; clicar fora fecha o pequeno modal e a tag aparece junto ao nome [A37].
- Gerenciar tags (renomear, excluir ao passar o mouse): a partir do filtro de tags na lista ou do modal de adicionar tag; só donos de instância excluem tags [A37]. Membros podem ver, criar e usar tags, mas não excluir [A62].
- Papéis personalizados incluem permissão de ver tags por padrão [A114]. Uma variável de ambiente desativa tags por completo [A95].

**Desconhecido**

- Limites de quantidade e tamanho de tags, cores de tag.

### 1.7 Arquivar, restaurar e excluir

**Observação**

- A ação de remover foi substituída por arquivar: fluxos são arquivados por padrão. Arquivados ficam ocultos até se ativar a opção de mostrar arquivados no menu de filtros; desarquivar e excluir definitivamente ficam no menu de opções do fluxo arquivado. Arquivar exige as mesmas permissões de remover, desativa fluxos ativos, e fluxos arquivados não podem ser editados nem escolhidos como subfluxo [A78].
- Ao arquivar, o aviso de sucesso traz um link para a confirmação de exclusão definitiva, tanto na lista quanto no cabeçalho do editor [A114].
- Arquivar também existe na barra de comandos [A2] e na API como exclusão lógica idempotente [A107].
- Excluir um fluxo apaga seu histórico de execuções [A14].

### 1.8 Favoritos

**Observação**

- Favoritáveis: fluxos (menu de três pontos na lista ou no cabeçalho do fluxo aberto), pastas, tabelas de dados e projetos [A24]. Limite de 200 itens; favoritos são pessoais, somem quando o item é excluído e ficam ocultos quando se perde acesso; não há busca, ordenação ou página dedicada; disponível a partir da 2.18 [A24][A114].

### 1.9 Compartilhar (resumo; detalhes na seção 5.8)

**Observação**

- Botão de compartilhar no fluxo aberto; só vale para fluxos do espaço pessoal. Em fluxo de projeto, o diálogo mostra um aviso de que o projeto já compartilha com todos os membros [A41].

### 1.10 Barra de comandos

**Observação**

- Abre com Ctrl/Cmd + K ou pelo ícone de lupa no canvas. Os comandos se adaptam à tela atual e às permissões. Categorias: ações de fluxo (adicionar nós, salvar, testar, organizar, publicar e despublicar, duplicar, importar e exportar, arquivar, excluir); navegação por recursos (criar e abrir fluxos, credenciais, tabelas de dados e projetos, acessar recentes); ações de execução (depurar, copiar, repetir, parar, excluir); navegação geral (modelos, variáveis, indicadores, configurações, ajuda, documentação) [A2].
- Na 2.44 foi reconstruída com abas por tipo e busca paginada com atraso de digitação [A114]. Um resumo de busca da mesma página de notas indica que a aba de fluxos mostra hora da última edição e status publicado ou rascunho (2.42) e ordena por última atualização (2.44) [A114].
- Em modo só-canvas a barra de comandos fica desativada, inclusive o atalho [A58][A114].

**Desconhecido**

- Se há busca difusa; como os itens recentes são ordenados.

### 1.11 Estados na navegação (vazio, carregando, erro, sem permissão)

**Observação**

- Sem permissão: membros não veem fluxos e credenciais de outros nem criam projetos [A62]; visualizadores de projeto não executam manualmente [A26]; usuários sem direito de editar uma credencial veem o formulário com campos desativados, mas podem conectar OAuth [A114]; seções de chaves de API e papéis restritos aparecem desativadas com explicação em vez de ocultas [A114]; configurações não licenciadas aparecem acinzentadas com um emblema de atualização de plano [A93][A114]; conectar um cliente MCP sem o recurso habilitado mostra mensagem de permissão insuficiente [A92].
- Vazio: a seção de favoritos só existe após o primeiro favorito [A24]; o painel de criação de nós tem um estado de busca vazia (atualizado na 2.39) [A114]; abas sem problemas na ferramenta de migração aparecem vazias [A115]; a aba de avaliações mostra instruções de configuração enquanto não há avaliação [A89].
- Erro e conectividade: o salvamento automático pausa sem conexão e mostra um indicador de "offline"; falhas de salvamento repetem com espera exponencial a partir de 2 segundos, limitada a 32 [A114].

**Desconhecido**

- Indicadores de carregamento de listas, páginas de erro genéricas, estados de "sem resultados" da busca de fluxos.

### 1.12 Responsivo e celular

**Observação**

- O canvas aceita gesto de dois dedos em tela sensível ao toque para mover a vista [A2].
- O recurso de uso do navegador pelo assistente não está disponível em celulares e tablets (inclusive iPad em modo desktop) e as opções de conexão se adaptam a dispositivos móveis e navegadores não baseados em Chromium [A116][A114].
- Na central de conversa, as ações de mensagem aparecem ao passar o mouse ou focar, exceto em dispositivos de toque [A114].

**Desconhecido**

- Se o editor é oficialmente suportado em celular, pontos de quebra, navegador mínimo.

### 1.13 Padrão visual em palavras

**Observação**

- Há tema claro e escuro, escolhido nas configurações pessoais [A78]; cores personalizadas de notas têm bordas que se ajustam ao tema [A34]. A documentação cita componentes de um sistema de design reutilizado (por exemplo, variante de botão de sucesso em verde, editor de Markdown rico, campo numérico com incremento) [A114].
- Sinais visuais documentados: raio para gatilhos no painel de nós [A31]; escudo para nós comunitários verificados [A78]; cadeado para nós, ferramentas e provedores bloqueados por política [A74][A114]; vassoura para organizar o canvas [A78]; estrela para favoritos [A24]; chave para credenciais privadas [A114]; ícone de identidade para credenciais de usuário final [A114]; triturador de papel para dados redigidos [A94]; marcação verde com "N", laranja com "M" e vermelha com "D" no diff de fluxos [A73]; tique verde de sucesso e triângulo amarelo de nó desatualizado [A28]; emblemas (publicado, status de revisão, atualização de plano, novo) [A11][A114][A93]; avisos em forma de toast [A114]; menus de três pontos e botões divididos [A24][A25].

**Inferência**

- O estilo geral é de aplicativo web de produtividade: canvas central, painel lateral esquerdo recolhível, modais para configurações e credenciais, painéis acopláveis (logs, chat, assistente). Isso decorre do conjunto de elementos documentados acima.

## 2. Editor de fluxo

### 2.1 Canvas

**Observação**

- Mover a vista: Ctrl/Cmd + botão esquerdo arrastando, Ctrl/Cmd + botão do meio, espaço + arrastar, botão do meio, dois dedos no toque [A2].
- Zoom: teclas de mais ou igual (aproximar), menos ou sublinhado (afastar), 0 (restaurar), 1 (enquadrar o fluxo), Ctrl/Cmd + roda do mouse [A2].
- Mini-mapa: o canvas reescrito virou padrão na 1.70 com ganho de desempenho e um mini-mapa; na época havia opção de voltar ao canvas anterior pelo menu de três pontos e um botão de reportar defeito na parte inferior [A78].
- Organizar automaticamente: alinha nós, centraliza notas e desembaraça ligações; botão de vassoura no canto inferior esquerdo, atalho Shift + Alt + T, ou clique direito no canvas; com nós selecionados, organiza só a seleção e as notas atrás dela [A78]. Também está no menu de contexto do nó e na barra de comandos [A31][A2].
- Seleção múltipla: caixa de seleção arrastando ou Ctrl/Cmd + clique em cada nó [A33]; selecionar todos com Ctrl/Cmd + A; selecionar todos à esquerda ou à direita com Shift + seta [A2]; clicar e arrastar para selecionar vários antes de copiar [A40].
- Copiar, recortar, colar, desfazer e refazer por teclado [A2]; copiar e colar funciona por JSON, inclusive entre fluxos [A40]. Nós colados ou importados recebem credenciais correspondentes automaticamente, com aviso [A114].
- Inserção de nós reposiciona os vizinhos para reduzir sobreposição (2.8); notas adesivas esticam ou se movem junto e as linhas de ligação se mantêm verticais [A77][A114]. Expandir um grupo empurra nós vizinhos, que voltam ao recolher [A114].
- Botões de adicionar e excluir sobre as ligações mostram dicas ao passar o mouse [A114].
- Mensagens de erro repetidas no canvas colapsam em uma entrada com contagem [A114].
- Os botões de controle do canvas ficam agrupados em um contêiner, com espaçamento consistente nos grupos superior direito e inferior esquerdo [A114].
- O botão de executar na parte inferior mostra o ícone do gatilho selecionado; escolher um gatilho executa o fluxo (2.43) [A114].
- Trilha de navegação de pastas no canvas [A78]; avatares de outros usuários ativos no fluxo [A78].
- Clique direito no fundo com nós selecionados oferece converter em subfluxo (também Alt + X); regras: seleção contínua sem gatilhos, um único nó de entrada com uma ramificação, um único nó de saída com uma ramificação; expressões são reescritas e viram parâmetros do gatilho do subfluxo; subnós de IA anexados vão juntos [A30][A78][A114]. A opção some quando o nó de execução de subfluxo está excluído da instância [A114].
- Modo só-canvas (variável de ambiente, desde 2.15): esconde cabeçalho, menu lateral, barra de comandos e botão do assistente e os atalhos de salvar, criar, publicar e despublicar; mantém canvas editável, uma barra flutuante de abas (editor, execuções, avaliações), o painel de logs e o painel de criação de nós abrindo no topo [A58].
- Visualizações somente leitura (histórico, compartilhamento) mostram grupos expandidos por padrão [A33].

**Inferência**

- Existe uma barra de ferramentas flutuante acima da seleção, pois a documentação fala de um ícone de agrupar "na barra de ferramentas acima da seleção" e de um ícone de desagrupar acima do grupo [A33].

**Desconhecido**

- Alinhamento manual (grade, snap), limites de zoom, rótulos de contagem de itens sobre as ligações, substituição direta de um nó por outro.

### 2.2 Barra superior (cabeçalho do editor)

**Observação**

- Elementos citados: nome do fluxo (clicar para renomear; clicar no canvas confirma), trilha de pastas, controles de salvamento, tags [A22][A58][A37]; abas de editor e de execuções no menu superior [A15][A17], mais a aba de avaliações [A89][A58].
- Salvamento automático em 1 a 5 segundos, sem botão de salvar; cada mudança gera uma versão [A11]. Uma variável de ambiente desativa o automático, devolvendo o botão de salvar e Ctrl + S, com aviso em conflito remoto [A114]. O salvamento tem atraso de digitação e animação [A114].
- Botão de publicar com atalho Shift + P; ao publicar pode-se nomear a versão e descrever; o nome padrão é um identificador. Estados documentados do botão: inicial desativado sem mudanças publicáveis; pronto para publicar; publicado e atualizado; publicado com mudanças; publicado com mudanças inválidas (nenhum gatilho exige publicação); publicado com erro; publicando (persiste ao recarregar); publicado parcial (algum gatilho falhou; passar o mouse mostra qual; republicar tenta de novo); falha ao publicar [A11].
- Menu suspenso ao lado de publicar: despublicar (Ctrl/Cmd + U), nomear versão (Ctrl/Cmd + S), enviar para revisão, preferência de "revisão obrigatória" guardada no navegador por fluxo [A11][A39]. Despublicar também existe na lista e no histórico [A11].
- Status de publicado no canto superior direito com opção de despublicar [A22]. Publicação é assíncrona e só altera gatilhos que mudaram [A11]. Mudar só as configurações republica automaticamente [A11].
- Ícone de histórico de versões no cabeçalho [A11][A38]; botão de compartilhar [A41]; favoritar pelo cabeçalho [A24]; indicador de status de revisão com popover e ação sugerida [A114].
- Menu de três pontos do fluxo: baixar JSON, importar de URL, importar de arquivo [A40], configurações [A36], mover [A8], submenu de dependências [A114]; arquivar, duplicar e excluir constam como ações de fluxo [A2].
- Edição colaborativa: só uma pessoa edita por vez; os demais veem em modo somente leitura; o bloqueio é liberado por inatividade e outros podem assumir com as últimas mudanças [A11]. Desde a 2.10 o bloqueio é por aba do navegador, com indicador de somente leitura e opção de assumir [A114].
- Executar e publicar ficam desativados, com explicação, quando o fluxo usa credencial que o usuário não pode usar; a verificação de publicação nomeia a credencial bloqueadora [A27][A114]. Recusas de salvar, publicar ou executar listam cada violação de política e seu escopo [A114].
- Publicar com credenciais de gateway de IA mostra aviso nomeando os nós afetados [A114].

**Desconhecido**

- Ordem exata dos elementos no cabeçalho; existência de indicador de "salvo" com horário.

### 2.3 Painel de criação de nós

**Observação**

- Em fluxo vazio, há uma chamada para adicionar o primeiro passo que abre o painel já filtrado em gatilhos; em fluxo existente, o conector de adicionar nó abre o painel com todos os nós; há busca e navegação por categorias [A31][A22].
- Ao escolher um serviço, o painel lista suas operações: gatilhos (com ícone de raio nos resultados; o gatilho aparece no topo em uma seção de recomendados) e ações; escolher uma operação insere o nó com ela pré-selecionada [A31].
- Uma entrada "por evento em aplicativo" lista os serviços que têm gatilho [A31].
- Teclado: "n" abre o painel; Enter insere o nó selecionado ou expande e recolhe categoria; setas direita e esquerda navegam categorias; Esc fecha [A2].
- Seções especiais: nós cobertos por créditos de uso na nuvem aparecem em uma seção própria com o saldo no cabeçalho e uma etiqueta [A61]; nós comunitários verificados aparecem com escudo e podem ser instalados dali [A78]; servidores MCP aparecem em seção própria, com barra de busca quando há mais de 8 [A114]; é possível escolher um servidor MCP no painel e autenticar sem configurar manualmente [A77].
- Nós bloqueados por política ficam ocultos ao navegar e só aparecem no fim da busca, com cadeado, sem poder ser adicionados [A74]. Subcategorias vazias são ocultadas [A114].
- Um nó de ferramenta comunitária não instalado mostra uma prévia e pode ser instalado dali [A114].
- Em modo só-canvas o painel abre no topo da tela [A58].

**Inferência**

- O painel é lateral à direita no modo normal, porque a documentação diz que no modo só-canvas ele passa a abrir "no topo, em vez de abaixo do cabeçalho" [A58]; a posição exata é dedução.

**Desconhecido**

- Lista fixa de categorias, se há aba separada de gatilhos e ações, pré-visualização de nó ao passar o mouse.

### 2.4 Nós no canvas: controles, menu de contexto e estados

**Observação**

- Ao passar o mouse sobre um nó aparecem controles: executar o passo, desativar, excluir e o menu de contexto [A31].
- Menu de contexto do nó: abrir, executar passo, renomear, desativar, fixar dados, copiar, duplicar, organizar o fluxo, converter em subfluxo, selecionar tudo, limpar seleção, excluir [A31]. Em nó de subfluxo há a opção de abrir o subfluxo em nova aba (Ctrl/Cmd + Shift + O ou Ctrl/Cmd + duplo clique) [A2][A78].
- Teclado com nó selecionado: setas selecionam vizinhos; d desativa; Delete exclui; Enter abre; F2 renomeia; p fixa dados [A2]. Duplo clique abre os detalhes [A2].
- Nomes padrão de nós mudam conforme recurso e operação escolhidos; nomes personalizados são mantidos e as referências continuam válidas [A78].
- Estados: sucesso com tique verde; nó "desatualizado" (dirty) com borda de outra cor e triângulo amarelo, quando algo mudou desde a última execução (inserção ou exclusão de nó vizinho, mudança de parâmetro, nova ligação, desativação do anterior, desafixar ou editar dados fixados; em laços, o primeiro nó do laço também fica desatualizado; em subnós, os pais executados) [A28]; nó bloqueado por política com rótulo de restrito e parâmetros somente leitura [A74]; nó desativado (controle e atalho d) [A31][A2]; nota do nó pode aparecer como subtítulo no canvas [A31].
- Ferramentas de IA podem ser executadas isoladamente a partir do canvas ou do painel de detalhe [A78]. Um nó-placeholder do laço aparece com borda tracejada e sinal de mais; duplo clique abre o painel de criação [A114].

**Desconhecido**

- Indicadores de erro, de espera e de contagem de itens sobre o nó; cores de borda exatas; existência de ação de substituir nó mantendo ligações.

### 2.5 Ligações

**Observação**

- Criar: clicar no ponto cinza (ou no ícone de adicionar nó) à direita de um nó e arrastar até o retângulo cinza à esquerda do próximo [A32].
- Excluir: passar o mouse sobre a ligação e usar o ícone de excluir [A32]. Os botões de adicionar e excluir sobre a ligação têm dicas de ferramenta [A114].
- Clicar no sinal de mais entre nós abre o painel de criação com busca e categorias (nó inserido entre os dois) [A22].
- Ligações de subnós de IA: um nó raiz recebe subnós (modelo, memória, ferramentas); essas ligações não podem cruzar a fronteira de um grupo [A33][A76]. Em gatilho de chat, escolher carregar sessão anterior "a partir da memória" faz aparecer um conector de memória no nó [A104].
- Ligação entre agente e ferramenta aceita um passo de revisão humana, configurado no painel de ferramentas [A77].
- Ordem de execução entre ramificações: desde a 1.0 uma ramificação completa antes da próxima, de cima para baixo e, em empate, da esquerda para a direita; modo legado alterna nó a nó entre ramificações; configurável nas configurações do fluxo [A54][A36].

**Desconhecido**

- Rótulo de contagem de itens sobre a ligação, múltiplas saídas nomeadas, estilo da linha em ligações de subnó.

### 2.6 Notas adesivas

**Observação**

- Adicionar: buscar "nota" no painel de criação [A34] ou Shift + S [A2].
- Editar: duplo clique; conteúdo em Markdown (negrito, itálico, títulos, links, listas, imagens em largura total com sufixo na URL, vídeos incorporados por sintaxe própria); clicar fora ou Esc encerra a edição [A34].
- Cor: ícone de trocar cor ao passar o mouse, 7 cores predefinidas mais um botão de cor personalizada com seletor ou código hexadecimal; as últimas 8 cores personalizadas ficam guardadas; cor também no menu de opções; bordas ajustadas ao tema [A34][A114]. Cores selecionáveis existem desde a 1.17 [A78].
- Mover arrastando; colocar atrás de nós para agrupar visualmente; redimensionar pela borda [A34].
- Notas podem entrar em grupos de canvas [A33] e são organizadas junto pelo organizar automático [A78].

**Desconhecido**

- Excluir nota (atalho ou menu), ordem de camadas além de "atrás dos nós", limite de tamanho.

### 2.7 Grupos de canvas

**Observação**

- Disponíveis gradualmente desde 2.28 e para todos desde 2.31. O grupo é salvo com o fluxo; o estado recolhido e a visibilidade da descrição são preferências locais do navegador [A33].
- Criar: selecionar nós e usar o ícone de agrupar na barra acima da seleção, o menu de contexto ou Ctrl/Cmd + G; o nome padrão fica em edição imediata [A33].
- Nome: espaço renomeia; inline quando expandido, em diálogo quando recolhido; não pode ficar vazio [A33].
- Descrição opcional de até 145 caracteres; aparece sob o nome quando expandido, em ícone de informação quando recolhido; pode ser fixada visível (ícone de olho ou menu); menu de contexto do canvas alterna todas; some com zoom abaixo de cerca de dois terços; sobrevive a duplicar e colar; descrições importadas maiores são cortadas com aviso [A33].
- Recolher e expandir pelo cabeçalho do grupo; Alt + G e Shift + Alt + G atuam em todos ou só nos selecionados; menu do canvas mostra expandir ou recolher todos ou só selecionados [A33].
- Desagrupar: ícone acima do grupo, menu ou Ctrl/Cmd + Shift + G [A33].
- Menu de contexto do grupo: renomear e desagrupar no topo, depois as ações multi-nó renomeadas (copiar grupo, excluir grupo) e funcionando no grupo recolhido [A33].
- Regras: nenhum nó já em outro grupo, sem gatilhos, cadeia conectada única, ligações externas só no primeiro e último nó, agente de IA com seus subnós juntos, mínimo de dois nós, notas permitidas. Grupos inválidos ao salvar são desfeitos com aviso [A33]. Selecionar o título ou todos os membros seleciona o grupo inteiro [A114].

**Desconhecido**

- Cores de grupo, aninhamento de grupos, mover grupo inteiro arrastando.

### 2.8 Painel de detalhe do nó

**Observação**

- Layout: entrada à esquerda, parâmetros no meio, saída à direita; nome do nó no canto superior esquerdo (clicar para renomear); fechar no canto superior direito voltando ao canvas; botão de executar só este passo [A22].
- Vistas de dados: esquema, tabela ou JSON [A6]. Na tabela, campos aninhados aparecem em negrito [A46]. Pré-visualização de esquema mostra a saída esperada de um nó sem executar nem ter credencial, para mais de 100 nós, exibida na vista de esquema do nó seguinte, com campos arrastáveis [A78]. A vista de esquema ficou cerca de 90% mais rápida na 1.73 [A78].
- Arrastar um campo do painel de entrada para um parâmetro gera a expressão de referência automaticamente e muda o campo para modo expressão; uma prévia sob o campo mostra o resultado [A43][A46][A22]. Arrastar a partir do esquema para campos de código, SQL e HTML insere na posição do cursor [A78]. Parâmetros podem ser reordenados arrastando [A78].
- Busca visual na entrada e na saída: digitar um termo mostra só objetos ou linhas correspondentes, sem alterar os dados; o filtro reseta ao fechar o nó; na nuvem, disponível nos planos Pro e Enterprise; em auto-hospedado, em todas as edições [A85][A78].
- Fixar dados: após executar, ícone de fixar na saída; o botão fica desativado e uma faixa informa que os dados estão fixados; desafixar na faixa. Só nós com uma única saída principal (saídas de erro não contam) e sem dados binários. Fixação e edição valem só para desenvolvimento; execuções de produção ignoram [A20].
- Editar saída: na vista JSON, usar editar, alterar, salvar; o sistema salva e fixa [A20]. Copiar: passar o mouse sobre um parâmetro e escolher copiar caminho do item, caminho do parâmetro ou valor; também é possível abrir uma execução passada, dar duplo clique no nó e copiar o JSON [A20].
- Triângulo amarelo no painel de saída com dica explicando por que os dados estão desatualizados [A28]. Erros de ligação de itens aparecem na prévia da expressão [A87].
- Linha de credencial em uma única linha com status conectado ou não e confirmação ao desconectar [A114]; seletor de credencial agrupado em "disponíveis para você" e "disponíveis no projeto" (ou "para todos" no espaço pessoal) e, com compartilhamento granular, agrupado por origem [A27][A114]; faixa de conexão rápida quando o nó ainda não tem credencial [A114]; emblema de credencial privada e aviso de conexão [A114]; o seletor mostra de quem é a credencial e permite trocar por uma acessível [A114]; opção de usar créditos de uso no campo de credencial, com saldo visível e caminho de volta para credencial própria [A61].
- Nó restrito por política abre um painel próprio de nó restrito [A114]. Botão de parar execução dentro do painel (2.37) [A114]. Promoções de créditos de uso aparecem no painel (2.43) [A114]. Ofertas de conexão rápida podem exibir um aviso com link [A114].
- Dados binários na saída: a documentação de dados especiais só descreve nós de conversão e extração [A83].
- Tamanho total dos dados da execução aparece no cabeçalho de execuções, incluindo binários [A114].

**Inferência**

- O painel abre sobre o canvas como sobreposição modal, porque fechar "retorna ao canvas" e o modo só-canvas fala em "sobreposições" ocultadas [A22][A58].

**Desconhecido**

- Navegação para o nó anterior ou seguinte sem fechar o painel, aba de binário na saída (visualizar, baixar), seletor de qual nó anterior alimentar a entrada, indicador de quantidade de itens e de tempo no painel, estados de carregamento, paginação de itens na tabela.

### 2.9 Aba de configurações do nó

**Observação**

- Configurações documentadas: sempre gerar saída (retorna item vazio quando não há dados; cuidado com laços infinitos em nó condicional); executar uma vez (usa só o primeiro item); tentar de novo em falha (reexecuta até funcionar); em erro, três opções: parar o fluxo, continuar com os últimos dados válidos, continuar usando uma saída de erro; atributos personalizados de rastreamento (chave fixa, valor com expressão; só com rastreamento habilitado e licença enterprise auto-hospedada); notas; mostrar a nota como subtítulo no canvas [A31].

**Desconhecido**

- Tempo entre tentativas, número máximo de tentativas, versão do nó na interface, aba de documentação.

### 2.10 Execução manual e parcial

**Observação**

- Executar o fluxo inteiro: botão na parte inferior do canvas ou Ctrl/Cmd + Enter; útil ao construir ou quando não há gatilho [A10][A17][A2]. Execuções manuais aparecem na aba do editor; as de produção só na aba de execuções [A17].
- Execução parcial: abrir o nó e executar só o passo; o sistema executa esse nó mais os anteriores necessários para fornecer a entrada; o nó alvo roda de novo com a mesma entrada; nós podem ser desativados para evitar chamadas externas; precisa de um gatilho (o manual é o mais simples); muitos ramos podem estourar um limite de tamanho, e a documentação sugere um nó de limite para reduzir saída em testes [A17]. Um nó desatualizado é um ponto de partida possível de execução parcial; executar novamente limpa o estado [A28]. Desde a 1.81 a execução parcial se comporta como produção, inclusive em laços [A78].
- Gatilho de webhook em teste: o painel mostra as URLs de teste e de produção com um seletor; escutar evento de teste (ou executar o fluxo) registra o webhook de teste enquanto o fluxo não está ativo; a chamada à URL de teste faz os dados aparecerem no editor; chamadas à URL de produção não aparecem no editor, só na aba de execuções [A105].
- Gatilho de chat em teste: enquanto a opção de tornar o chat público está desligada, o chat fica disponível só na interface manual de chat; ao publicar, escolhe-se chat hospedado (com campos de mensagem inicial, placeholder, título, subtítulo e botão de nova conversa) ou embutido (mostra a URL do chat) e autenticação (nenhuma, básica, usuário do sistema com opção de exigir permissão de execução) [A104]. O chat de teste é um painel no canvas ao lado dos nós e dos logs, com streaming, navegação pelo histórico e ações de reenviar e copiar [A78][A114].
- Fixar dados substitui a execução do nó nas execuções manuais seguintes [A17][A20].
- Indicadores por nó: tique de sucesso; triângulo de desatualizado; totais de tempo e de tokens de IA no painel de logs [A28][A78]. Mensagens de erro repetidas no canvas colapsam com contagem [A114].
- Parar: ação de parar execuções na barra de comandos [A2]; botão de parar no painel do nó [A114]; opção de parar todas (na fila, em execução e em espera), com filtros opcionais [A114].
- O limite de tempo e a política de salvamento afetam o que aparece depois (seção 5.1) [A36].

**Desconhecido**

- Contagem de itens e tempo por nó diretamente no canvas; cor e forma do indicador de erro; barra de progresso da execução.

### 2.11 Painel de logs

**Observação**

- Painel na parte inferior do canvas, abre e recolhe ao clicar na barra; lista os nós executados em hierarquia na ordem de execução, inclusive subfluxos; status ao vivo, entradas e saídas, totais de tempo e de tokens; permite abrir o detalhe do nó, alternar exibição de dados, ver o histórico de execuções e destacar em janela separada [A78]. Permanece no modo só-canvas [A58]. No cabeçalho dos logs de IA aparece o modelo que realmente respondeu [A114]. No assistente, o painel abre ao iniciar a execução e recolhe em sucesso [A114].

### 2.12 Expressões (conceitos)

**Observação**

- Sintaxe: trecho JavaScript entre chaves duplas; acesso ao JSON do item atual por uma variável dedicada, com notação de ponto ou colchetes; referência a outros nós pelo nome; múltiplas instruções exigem função imediatamente invocada; expressões em campos de credencial resolvem por execução [A21].
- Entrar no modo expressão: alternar o campo (ao passar o mouse aparece a opção de expressão) ou arrastar um valor do painel de entrada; tecla "=" em campo vazio muda para expressão [A21][A18][A2]. O editor mostra prévia imediata do valor calculado [A47]; o modal de expressão tem vista de esquema desde a 1.55 [A78]; digitar o cifrão aciona autocompletar de métodos e variáveis no nó de código e no editor de expressões; nomes alternativos comuns sugerem os métodos equivalentes [A106][A114]; um auxiliar não documentado passou a mostrar erro de descontinuação no editor [A114].
- Famílias disponíveis: entrada do nó atual (item, todos, primeiro, último, índice do item, índice da execução, parâmetros do nó anterior, contexto de laço, binários); saída de outros nós pelo nome (todos, primeiro, último, item correspondente, parâmetros, contexto; argumentos opcionais de ramificação e de rodada); metadados de execução e de fluxo (id, modo, URLs de retomada, dados personalizados; id, nome e estado ativo do fluxo; versão do nó; parâmetro); dados de resposta e paginação só no nó de requisição HTTP; data e hora (agora, hoje e biblioteca de datas); variáveis personalizadas e segredos externos (segredos só em credenciais); dados personalizados de execução (ler, ler todos, definir, definir todos); auxiliares condicionais, máximo, mínimo, consulta JSON e preenchimento por IA; famílias de métodos para texto, número, lista, objeto, booleano, data, data-hora e arquivo binário [A45][A44][A55][A69][A53].
- Ligação de itens: cada item de saída guarda de qual item de entrada veio, o que torna a referência por nome confiável [A44]. Erros de ligação documentados: informação ausente no nó anterior; múltiplos itens correspondentes (agregações e mesclagens); nó em outra ramificação (resolve para nulo e o erro aparece na prévia) [A87].
- Problemas comuns: JSON inválido na saída; dados indisponíveis porque o nó referenciado não executou; erro de sintaxe (ponto sobrando) [A21].

### 2.13 Dados de teste: fixar, simular e reaproveitar

**Observação**

- Simular dados com nó de código ou nó de edição de campos; um nó de dados fictícios de clientes serve para explorar sem dados reais [A20].
- Reaproveitar dados de execuções passadas copiando o JSON e colando na saída editável do nó alvo [A20]. Depurar no editor e copiar ao editor fixam a execução no primeiro nó (seção 3.4) [A16].

## 3. Execuções

### 3.1 Conceito e modos

**Observação**

- Execução é uma rodada de um fluxo. Manual: iniciada pelo botão de executar; produção: automática após publicar uma versão. Só execuções de produção contam na cota de planos pagos (gatilhos agendados contam sempre; polling só quando há dados; webhook por requisição recebida; não contam manuais, chamadas de subfluxo, fluxo de erro, polling vazio e requisições rejeitadas) [A4].
- Dados de execução podem ser redigidos; metadados (status, tempo, nomes de nós) continuam visíveis [A4][A94]. Quem não pode usar uma credencial usada na execução não vê os dados dela, só status e tempo; vale também para subfluxos, API e MCP [A4][A27].

### 3.2 Lista global (visão geral) e lista do projeto

**Observação**

- Aba de execuções na visão geral mostra execuções de todos os fluxos acessíveis; no projeto, só do projeto; excluir um fluxo apaga suas execuções [A14].
- Filtros: fluxo (todos ou um), status (falha, em execução, sucesso, em espera), início da execução em um período, dados personalizados salvos (chave e valor; exige plano Pro ou Enterprise na nuvem, ou edição registrada ou enterprise auto-hospedada) [A14][A53]; filtro pela versão do fluxo que executou (2.14) [A114]; dados realçados por nós de chat permitem filtrar execuções (2.16) [A114].
- Repetir: menu de três pontos de uma execução com falha, escolher entre repetir com o fluxo salvo atual ou com o fluxo original; retoma do estado salvo (nós concluídos mantêm resultados; o nó com falha reprocessa todos os seus itens; subfluxo inteiro reroda); cada repetição cria nova execução; execuções com sucesso não podem ser repetidas (usar copiar ao editor); só execuções armazenadas podem ser repetidas [A14].
- Ícone nas listas para execuções que usaram credencial de usuário final [A114]. Cabeçalho de execuções mostra o tamanho total dos dados [A114].
- Ações de execução na barra de comandos: depurar, copiar, repetir, parar, excluir [A2]. Parar todas com filtros opcionais [A114].

**Desconhecido**

- Colunas da tabela, atualização automática, paginação, seleção em massa na lista, exclusão em massa, ordenação.

### 3.3 Lista por fluxo

**Observação**

- Aba de execuções no menu superior do fluxo aberto; cobre as execuções da versão atual; é separada do histórico de versões [A15].
- Cada execução pode ser pré-visualizada a partir da lista; se usou credencial de usuário final, só quem conectou aquela conta vê os dados daquele nó; os demais, inclusive administradores, veem redigido [A15].
- Filtros: status (os quatro acima), início, dados personalizados [A15]. Repetir pelo ícone de atualizar da execução, com as duas opções [A15].
- Execuções de produção de webhook são vistas aqui; a página de execução mostra a versão do histórico que rodou, com link [A105][A114].

### 3.4 Detalhe da execução e depuração

**Observação**

- Depurar: abrir a aba de execuções, escolher a execução; para falhas, botão de depurar no editor; para sucessos, botão de copiar ao editor; os dados são copiados como dados fixados no primeiro nó. Na nuvem, todos os planos; auto-hospedado exige edição registrada, business ou enterprise [A16][A102].
- Em execução passada, dar duplo clique em um nó mostra seus dados em JSON [A20].
- Dados redigidos: no visualizador de execução, as tabelas de dados dão lugar a um indicador de dados redigidos com ícone de triturador; nomes de nós, status, tempo e estrutura continuam visíveis; JSON vira objeto vazio e binários somem; erros reduzidos ao tipo e, em APIs, ao código HTTP. Quem tem a permissão de revelar vê um botão de revelar que abre confirmação (ação auditada) e mostra os dados só naquela sessão; revelar é sempre negado para execuções com credenciais dinâmicas [A94]. Painéis redigidos mostram um cadeado e a opção de revelar (2.14) [A114].
- Na avaliação, clicar em um caso de teste abre a execução correspondente em nova aba [A90].

**Inferência**

- O detalhe da execução reutiliza o canvas do editor em modo de leitura com dados por nó, porque a documentação fala em "visualizador de execução" com estrutura do fluxo, nós e painéis de dados [A94][A15].

### 3.5 Estados possíveis de execução

**Observação**

- Na interface, os filtros expõem quatro estados: falha, em execução, sucesso, em espera [A14][A15].
- Na API pública, o enum de status tem: cancelada, travada, erro, nova, em execução, sucesso, desconhecido, em espera; o endpoint de parar em massa aceita em fila, em execução e em espera [A112].
- A hora de parada é nula enquanto a execução está em execução [A112].

**Inferência**

- A lista provavelmente exibe também os estados cancelada e travada como variações de falha, porque a API os distingue e a interface oferece parar execuções; não há confirmação documental.

## 4. Credenciais

### 4.1 Lista

**Observação**

- Acesso pela aba de credenciais da visão geral ou de um projeto [A66]. Cartões de credencial com menu (mover [A8]; conectar, no caso de credencial de usuário final [A56]); a lista mostra o status de conexão por usuário com um botão de conectar (2.25.1) [A114].

**Desconhecido**

- Colunas, filtros, ordenação e busca da lista de credenciais.

### 4.2 Criar e editar (modal)

**Observação**

- Pontos de entrada: botão de criação do menu lateral; botão de criar da visão geral ou do projeto; dentro de um nó, pelo menu suspenso de credencial [A18].
- Passos do modal: escolher o aplicativo ou serviço; preencher os campos exigidos; em credenciais OAuth (apenas enterprise) escolher o tipo fixo (mesma conta para todos) ou de usuário final (conta de quem dispara); definir domínios permitidos para o nó de requisição HTTP (todos, lista separada por vírgulas, nenhum); opcionalmente usar expressão em um campo ao passar o mouse [A18].
- Nome padrão derivado do nome do nó mais um sufixo de conta; clicar no nome para renomear [A18].
- Ao salvar, o sistema testa a credencial [A18]; o resultado do teste aparece em faixas inline no modal de conexão (2.10) [A114]; o botão de salvar de credenciais OAuth fica sempre visível e mostra um aviso de sucesso a cada salvamento (2.28) [A114].
- Conexão rápida (OAuth pré-configurado) aparece por padrão ao criar credenciais, com opção de entrada manual (2.11); credenciais de autenticação personalizada simplificada ganham formulário guiado com rótulos e vista de edição do modelo (2.34); diálogos de consentimento podem exigir uma caixa de confirmação (2.12); JSON de autenticação personalizada fica visível ao editar e mascarado após salvar (2.13) [A114]. Na nuvem, um botão de conectar configura credenciais de serviços suportados por OAuth (2.11) [A77].
- Sobrescritas de credencial (auto-hospedado): campos sobrescritos ficam ocultos e o usuário vê só a opção de autenticação, como o botão de conectar [A68]. Uma variável de ambiente mantém o campo de escopo visível para tipos escolhidos [A114].
- Segredos externos: ao passar o mouse sobre um campo, ativar expressão e referenciar o cofre e o segredo; só em campos de credencial [A69].
- Credenciais de usuário final: tipo escolhido em um menu suspenso; faixas mostram estado privado ou conectado (2.33); o usuário conecta a própria conta pelo nó (mostra se está conectado e oferece conectar; depois mostra "conectado como" com o e-mail), pelo modal da credencial ou pela lista; uma conta por modelo por usuário; quem executa sem conexão é convidado a conectar; excluir o modelo apaga as conexões de todos, com aviso prévio [A56][A114].
- Opção de créditos de uso na nuvem no campo de credencial do nó, com saldo [A61]; oferta de créditos após falha no teste de credencial em nós suportados (2.42) [A114].
- Credenciais mencionadas em arquivos exportados: nomes e ids [A40].

**Desconhecido**

- Aba de detalhes (criação, última modificação), mensagens exatas de erro de teste, redirecionamento OAuth na interface além do botão de conectar.

### 4.3 Compartilhamento de credenciais

**Observação**

- Disponível em todos os planos da nuvem e em auto-hospedado business e enterprise [A66]. Quem compartilha: criador e dono; administradores de projeto para credenciais do projeto; donos e administradores da instância para todas [A66].
- Aba de compartilhamento no modal: menu de escolher projetos ou usuários, salvar; remover pelo ícone de lixeira. Quem recebe fica com o papel "pode usar" (executar e publicar, sem ver ou editar detalhes); "pode ver" só enxerga que existe e onde é usada [A66][A27]. A aba lista projetos compartilhados e projetos que usam a credencial sem compartilhamento (com rótulo de "pode ver" e um botão de compartilhar com o projeto todo) [A66]. A lista ordena pessoas antes de projetos (2.44); a linha de "usada em" explica quando o papel de instância já permite o uso no espaço pessoal (2.44) [A114].
- Compartilhar credencial de usuário final compartilha só o modelo; cada um conecta a própria conta [A56][A66].
- Compartilhar um fluxo dá aos editores o uso de todas as credenciais do fluxo; sem compartilhamento direto, o editor não edita os nós que as usam, mas vê e executa o fluxo [A41].
- Nos nós, colegas veem o nome e o dono da credencial; executar e publicar ficam desativados para quem não pode usá-la; podem trocar pela própria [A27]. Execuções manuais rodam como quem clicou; disparadas rodam como quem publicou por último; credenciais do projeto valem para todas as execuções do projeto [A27].

### 4.4 Uso dentro dos nós

**Observação**

- Seleção pelo menu suspenso de credencial do nó, com grupos "disponíveis para você" e "disponíveis no projeto" (ou "para todos" no espaço pessoal) [A27]; criação na hora pelo mesmo menu [A18]; linha de credencial compacta com status e confirmação de desconexão [A114]; faixa de conexão rápida em nó sem credencial [A114]; aviso quando uma credencial privada é usada com gatilho não manual (2.25.1) [A114]; faixa por usuário em credenciais OAuth compartilhadas (2.23) [A114].

## 5. Configurações do fluxo, histórico, importar e exportar, modelos, variáveis, papéis, configurações de conta e instância, assistentes de IA

### 5.1 Configurações do fluxo (modal)

**Observação**

- Abrir pelo menu de três pontos do fluxo, item de configurações; abre um modal [A36]. O id do fluxo aparece na URL e no título desse modal [A35].
- Configurações: ordem de execução (v1 recomendada, v0 legada); fluxo de erro (outro fluxo que começa com o gatilho de erro); quem pode chamar este fluxo (política de chamada; o padrão por variável de ambiente é "fluxos do mesmo dono", com opções qualquer, nenhum, lista e mesmo dono; a opção "qualquer fluxo" aparece marcada como descontinuada com aviso); fuso horário (padrão da instância ou, sem nada definido, Nova York); salvar execuções de produção com falha; salvar com sucesso; salvar execuções manuais; salvar progresso por nó (permite retomar após erro, com latência); tempo limite (ao ativar aparece o campo de horas, minutos e segundos; na nuvem cada plano tem um máximo; em auto-hospedado o máximo padrão é 3600 segundos e o tempo limite vem desativado); redigir dados de execuções de produção e de manuais (travados em "redigir" quando a instância impõe; a opção manual exige a de produção ativa; aparecem acinzentadas com emblema de atualização sem licença; travadas com cadeado e dica de permissão, com modal que lista quem pode editar); tempo estimado economizado (fixo em minutos por execução, com campo numérico com incremento, ou dinâmico via nós de tempo economizado); atributos de rastreamento; disponível em MCP (exige fluxo publicado com ao menos um nó de webhook ativo) [A36][A95][A98][A114][A92][A107].
- Padrões de salvamento por variável de ambiente: salvar tudo em erro e em sucesso, não salvar progresso, salvar manuais [A98].
- Mudar só as configurações republica automaticamente e não cria versão no histórico [A11][A38].
- O painel de dependências mostra relações de fluxo de erro nos dois sentidos (2.15) e o submenu de dependências fica no menu do fluxo (2.40) [A114].

### 5.2 Histórico e versões do fluxo

**Observação**

- Abrir pelo ícone de histórico no cabeçalho; mostra um menu de versões salvas e uma prévia do canvas da versão escolhida [A38].
- Versões são criadas ao salvar, ao restaurar (a versão atual é salva antes) e ao puxar do Git; mudanças de configurações não criam versão [A38].
- Ações no menu de opções da versão: restaurar, clonar para novo fluxo, abrir em nova aba (para comparar), baixar JSON, nomear a versão (nome e descrição; versões nomeadas nunca são podadas) [A38]. Também: despublicar, restaurar sem afetar produção, publicar outra versão [A11].
- Retenção: 24 horas para todos; 5 dias na nuvem Pro; histórico completo em Enterprise (nuvem e auto-hospedado); versões nomeadas em nuvem Pro e Enterprise e em auto-hospedado business e enterprise [A38]. Em auto-hospedado, uma variável define as horas de retenção, com padrão de manter tudo [A99]. A retenção é exibida em horas ou dias com plural correto (2.4) [A114].
- Diff visual entre versões com emblemas de contagem (2.13) [A77]; botão de comparar que abre diff em tela cheia (2.11) e seletores para comparar quaisquer duas versões (2.12) [A114]; aba de linha do tempo de publicação com quem publicou e despublicou e nomes de versão [A114]; prévias de histórico e de modelos renderizadas nativamente, sem iframe (2.28) [A114].
- Em revisão: a versão fixada na revisão exige nome, o que a protege da poda [A114][A39].

### 5.3 Revisões de fluxo (pré-lançamento, enterprise, desde 2.37)

**Observação**

- Ativado pela instância na seção de segurança e políticas das configurações [A39][A93].
- Enviar: menu de publicar, enviar para revisão, passo 1 nome da versão (obrigatório) e descrição, passo 2 título, revisor (obrigatório) e descrição; o revisor só precisa ler o fluxo. Mudanças posteriores: enviar alterações a partir do status no cabeçalho. Preferência de revisão obrigatória por fluxo, guardada no navegador [A39].
- Estados: aguardando revisão (publicação bloqueada no editor, na API e no MCP; despublicar continua permitido), alterações solicitadas, aprovada (publica a versão fixada em nome de quem pediu; se falhar, publicar manualmente), fechada sem aprovação (fluxo excluído, arquivado ou movido). Uma revisão por fluxo; não dá para cancelar; sem notificações por e-mail [A39].
- Detalhe: aba de atividade (descrição, feed, comentários não ancorados em nós) e aba de alterações (diff visual contra a versão publicada); decisões de aprovar ou pedir alterações só pelo revisor designado ou administradores [A39]. Na caixa de revisões, a lateral é redimensionável, os itens de fluxo são recolhíveis, o estado fica na URL e o campo de comentário cresce ao digitar [A114]. Cartões de fluxo mostram emblemas de status de revisão [A114].

### 5.4 Importar e exportar

**Observação**

- Fluxos são JSON. Copiar e colar nós com Ctrl/Cmd + C e V no editor; menu de três pontos: baixar como arquivo, importar de URL (por exemplo, JSON bruto hospedado), importar de arquivo [A40]. O arquivo inclui nomes e ids de credenciais e pode conter cabeçalhos de autenticação em nós de requisição importados de cURL [A40].
- Pacotes portáveis (pré-lançamento) agrupam fluxos, pastas, projetos (nome, descrição, ícone), referências de credencial, esquemas de tabelas, variáveis e tags; só pela API e pela linha de comando, não pelo editor; importação validada antes de gravar; reimportar atualiza em vez de duplicar [A42].
- Um modelo de exemplo é importado pelo item de importar de arquivo [A18].

**Desconhecido**

- Se dados fixados vão no arquivo baixado [A40].

### 5.5 Modelos (templates)

**Observação**

- Ícone de modelos no editor leva ao navegador de modelos no site; bibliotecas personalizadas podem ser buscadas e navegadas dentro do aplicativo (host configurável por variável; a API própria deve expor busca, coleções, categorias e dados do fluxo) [A48][A96]. Modelos podem ser desativados por variável [A96]. Após importar, é preciso preencher credenciais e ajustar configurações [A48]. Existe um hub de criadores para enviar modelos (1.18) e um modelo inicial de RAG no painel de nós (1.99) [A78]. Prévias de modelos renderizadas nativamente (2.28) [A114].

**Desconhecido**

- Fluxo de importação do modelo (nova aba, modal de credenciais), filtros da biblioteca dentro do aplicativo.

### 5.6 Variáveis

**Observação**

- Aba de variáveis na visão geral ou no projeto; só donos e administradores criam; adicionar variável com chave, valor e escopo (o escopo só aparece a partir da visão geral); editar ou excluir ao passar o mouse; chave até 50 caracteres com letras, dígitos e sublinhado; valor até 1000; escopo global ou de projeto (desde 1.118), e o de projeto sobrepõe o global; somente leitura dentro do fluxo; referência por prefixo de variáveis em expressões; sem valor vira indefinido; planos Pro e Enterprise na nuvem, business e enterprise auto-hospedado [A55]. Criação também pelo menu universal de adicionar com submenus de escopo (2.27); permissões de projeto para variáveis (2.5) [A114]. Stubs de variáveis são enviados automaticamente ao Git [A72].

### 5.7 Pastas e tags

- Ver 1.5 e 1.6.

### 5.8 Compartilhamento e papéis

**Observação**

- Compartilhar fluxo: botão de compartilhar, adicionar usuários, salvar; só em espaço pessoal (em projeto, o diálogo explica que o projeto já compartilha). Papéis: criador (ver, atualizar, executar, compartilhar, exportar, excluir) e editor (tudo menos compartilhar e excluir). Disponível em todos os planos da nuvem e em business e enterprise auto-hospedado [A41].
- Papéis de instância: dono (tudo, inclusive console da nuvem), administrador (tudo menos console; Pro e Enterprise na nuvem, enterprise auto-hospedado), membro (próprios fluxos, e-mail e senha; cria e usa tags sem excluir; não vê fluxos alheios, não cria projetos, não gerencia usuários), usuário de chat (só conversa e seus agentes de chat) [A62].
- Papéis de projeto: administrador (configurações, membros, tudo em fluxos, credenciais e execuções, criar credenciais de usuário final), editor (ver, criar, atualizar, excluir recursos; Pro na nuvem e enterprise auto-hospedado), visualizador (somente leitura, sem executar manualmente; Enterprise). Tabela de permissões por papel na documentação [A26].
- Papéis personalizados (enterprise): página de papéis nas configurações com abas de instância e de projeto; formulário com nome, descrição e caixas de permissão agrupadas por recurso (fluxos: ver, executar, editar, criar, publicar, transferir, excluir, gerir redação; credenciais; projeto; pastas; execução: revelar dados; cofres; segredos; tabelas de dados; variáveis; controle de versão: enviar); permissões pareadas automaticamente (ler implica listar, publicar implica despublicar); editar, duplicar e excluir pelo menu de três pontos; aba de atribuições com usuários e projetos (2.11); atribuição dentro das configurações do projeto; confirmação ao editar papel de instância com usuários atribuídos (2.33); aviso quando o papel só tem gerir papéis (2.37); executar como permissão separada que marca ver (2.11) [A109][A64][A114][A77].
- Políticas de segurança (configurações, seção de segurança e políticas): exigir 2FA (só login por senha; usuários são levados a configurar no próximo acesso), permitir compartilhar no espaço pessoal, permitir publicar no espaço pessoal (contadores de itens compartilhados ou publicados abaixo do interruptor), ativar revisões, impor redação de dados (escopo produção ou manual e produção). Podem ser geridas por variáveis, caso em que ficam somente leitura [A93].
- Usuários: página de usuários nas configurações, em tabela com busca por nome ou e-mail, projetos (clicar abre lista pesquisável de projetos e papéis), status de 2FA ordenável e última atividade (1.103, 2.33); convidar por e-mail (o convidado recebe link) ou por link gerado à prova de adulteração com botões de copiar; usuários pendentes com menu de reenviar convite; excluir usuário escolhendo transferir fluxos e credenciais a outro usuário ou apagar; gestão de papéis travada quando o SSO ou um mapeamento controla papéis, com faixas explicativas [A63][A88][A78][A114].
- Políticas de tipos de nó (sem página de configurações ainda; via API): permitir, negar ou delegar nós por instância e por projeto; efeitos na interface já descritos em 2.3 e 2.4 [A74].

### 5.9 Configurações de usuário

**Observação**

- Página pessoal: ativar 2FA (modal com QR, confirmação por código, códigos de recuperação) [A75]; tema escuro [A78]; página reconstruída com validação inline e explicações para campos travados (2.44) [A114]; papéis personalizados visíveis nas configurações pessoais (2.29) [A114].
- Perguntas de personalização na primeira entrada, desativáveis por variável [A96]; idioma padrão por variável, com retorno ao inglês nas cadeias não traduzidas [A97]; notificações de nova versão e atualizações de segurança (painel de novas versões) [A96]; dicas de integração ao criar o primeiro fluxo, desativáveis por variável [A95].
- Página de login prioriza SSO quando habilitado, recolhendo o formulário de senha (2.42) [A114]; senha com mínimo de oito caracteres, um número e uma maiúscula na criação do dono na nuvem [A88].

### 5.10 Configurações de organização e instância

**Observação**

- Chaves de API: página com abas "minhas" e "todas", tabela ordenável e paginada, busca por rótulo, colunas de dono e expiração; seletor de escopos (todos, só leitura, personalizado em árvore pesquisável); rotação mantendo nome, escopos e expiração; menu de três pontos por linha; modal somente leitura para chaves alheias; modal de chave criada com campo de uma linha e botão de copiar; API disponível na nuvem Starter, Pro e Enterprise e em todas as edições auto-hospedadas, não no teste gratuito; playground só auto-hospedado [A114][A82].
- Servidor MCP da instância: página única nas configurações com status, contagem de fluxos e agentes expostos, URLs de callback permitidas, prévia de até três clientes conectados, tabela completa com busca, filtros, ícones, escopos e revogação; diálogo de conectar cliente com abas OAuth (cliente agrupado por CLI, web e IDE; configuração em um clique ou URL do servidor) e chave de API (token pessoal gerado, mostrado redigido depois, com rotação); expor fluxo pelo modal de configurações do fluxo, pelo menu do cartão, pela página de fluxos habilitados ou em lote por projeto ou pasta; expor novos automaticamente (desligado por padrão); tela de consentimento com escopos (todos, só leitura, personalizado) e contagem de ferramentas por escopo; tabela de fluxos MCP paginada [A92][A114].
- Segredos externos (enterprise): adicionar cofre com nome único, provedor (seis provedores listados), conexão; compartilhamento global ou por projeto; reativar conexões desativadas; interruptor para dar permissões a papéis de projeto; cartões com emblemas de compartilhamento; modal de exclusão que exige digitar o nome [A69][A114].
- Ambientes e controle de versão: página com URL do repositório (SSH ou HTTPS), chave SSH (ED25519 padrão, RSA opcional) ou usuário e token, conectar, escolher ramo, instância protegida (impede editar recursos versionados), cor personalizada exibida no menu, salvar [A71]. Enviar abre modal de confirmar e enviar com seleção de fluxos e tabelas de dados (filtro por novo, modificado, excluído; busca por nome; árvore por pasta), credenciais, mensagem de commit; tags e stubs vão automaticamente; aviso de sucesso [A72][A114]. Puxar avisa sobre sobrescrever, pergunta sobre exclusões, pede valores faltantes, oferece publicação automática (desligada, só já publicados, todos) e mostra modal de resultados; tabelas marcadas como excluídas aparecem antes; puxar um fluxo publicado o despublica e republica com breve indisponibilidade [A72]. Diff de fluxo: dois canvases empilhados (o de cima é o que será atualizado), marcas de adicionado, modificado e excluído, JSON do nó ao clicar, botão de contagem de mudanças, setas de anterior e próximo, botão de voltar; linhas destacadas em nós de código e notas; sincronização de vistas opcional; disponível para donos, administradores e administradores de projeto, enterprise na nuvem e business ou enterprise auto-hospedado [A73][A78]. Modal de promoção permite escolher mudanças específicas do projeto [A114].
- Streaming de logs (enterprise): adicionar destino (syslog, webhook genérico, Sentry) em modal, escolher grupos de eventos (fluxo, execuções de nó, auditoria, worker, logs de IA, runner, fila), salvar; somente leitura quando gerido por variáveis [A70]. Eventos de auditoria incluem revelar dados e mudanças de imposição de redação [A94].
- Nós comunitários (auto-hospedado, dono ou administrador): página com botão de instalar, lista de pacotes com menu de desinstalar e botão de atualizar; diálogo com navegar no npm, campo de nome com versão ou tag, caixa de aceite de risco, instalar; lista de bloqueio [A103].
- Indicadores de uso: faixa na visão geral (todos os planos) e painel completo (Pro e Enterprise na nuvem, business e enterprise auto-hospedado) com gráficos e tabela por fluxo (execuções de produção, falhas, taxa de falha, tempo economizado, tempo médio); períodos por plano (7 e 14 dias; 24 horas a 30 dias; até 1 ano); intervalos personalizados (1.118); filtro por projeto (1.113); coleta desde 1.89; retenção padrão de 365 dias em auto-hospedado; módulo desativável [A65][A78].
- Outras páginas citadas: uso e plano (ocultável; renovação manual de licença com atualização da página quando a renovação automática está desligada) [A113]; uso de IA (opção de enviar valores reais, só donos e administradores; desligar limita o contexto e desativa o construtor de IA) [A50]; assistente (modelo, sandbox, conexões de busca, uso do navegador) [A114][A116]; agentes (interruptor de habilitar) [A80]; contexto e preferências (quem criou cada preferência) [A49][A114]; relatório de migração (barra de compatibilidade, abas de problemas de fluxo e de instância, tabela com nome, dono, nós afetados, estado, publicação, uso; filtros rápidos e painel; ações em massa de migrar, notificar donos, marcar como não corrigir, reabrir; exportar CSV) [A115]; SSO com mapeamento de grupos para papéis (2.19) e interruptor de logout do provedor (2.34) [A77][A114]; rastreamento OpenTelemetry com barra flutuante de salvar (2.33) [A114]; redação de dados na seção de segurança [A94].
- Console da nuvem (site separado): versão, janela de manutenção, fuso, retenção de execuções, plano, cobrança, uso, créditos, exportações; acessível pelo painel de administração do editor [A101].
- Tabelas de dados: aba no projeto; criar pelo botão dividido, do zero ou importando CSV (com descarte e renomeação de colunas e detecção de tipo em até 100 linhas); renomear, excluir, adicionar e reordenar colunas; adicionar, editar e excluir linhas; favoritar; baixar CSV pelo menu de três pontos; busca e ordenação por nome, data e tamanho com persistência por projeto; emblema do projeto nos cartões; aviso em 80% do limite e bloqueio ao atingir (padrão 200 MiB por instância); aviso para números acima do inteiro seguro; visíveis a todo o projeto [A25][A114][A22].
- Avaliações: aba de avaliações no editor; conjunto de teste em tabela de dados ou planilha; gatilho de avaliação com botão de avaliar tudo ao lado; definir saídas e definir métricas no nó de avaliação (métricas internas e personalizadas); botão de executar teste com controle deslizante de paralelismo (1 a 5 por plano, teto de 10); resumo por métrica, linhas por rodada, casos abrindo a execução em nova aba; cartões de resumo, emblemas, status ao vivo com repetir e cancelar (2.21) [A89][A90][A114][A78].
- Agentes: construtor com aba de agente (nome, ícone, modelo), instruções com barra de Markdown flutuante, ferramentas, capacidades (busca na web, subagentes), habilidades, conhecimento (upload), memória, canais e agendamentos, sessões; salvamento automático; pré-visualização (desativada com erros, rotulada como testar agente com ícone de frasco) e publicar com reverter e despublicar; chat acoplado com aprovar e rejeitar; orçamento e limites de gasto; lista de verificação de configuração; confirmação ao publicar listando ferramentas não publicadas [A80][A114].

### 5.11 Assistentes de IA e chat (registro de existência)

**Observação**

- Assistente conversacional de construção (pré-lançamento; nuvem Starter e Pro; auto-hospedado comunitária, registrada e business): painel de chat por projeto, cria, edita, testa e corrige fluxos e agentes, pede confirmação para ações de impacto e acesso a domínios, mostra cartão de credencial, respeita permissões, abas de prévia reordenáveis e fecháveis, painel de artefatos com progresso, blocos de raciocínio recolhíveis, mensagens com copiar e ouvir, créditos próprios na nuvem; preferências em configurações [A49][A114].
- Assistente de ajuda dentro do editor (legado, sem desenvolvimento ativo; só nuvem): depurar, explicar, ajudar em código e expressões, credenciais; vê a tela menos valores reais [A50]. Ajuda de IA no nó de código (só nuvem; substitui o código; aba oculta na 2.39) e no nó de requisição HTTP (1.40) [A60][A114][A78]. O depurador de erros por IA foi removido na 1.42 [A78].
- Construtor de fluxos por IA: painel no editor com prompt, feedback por fases, comando de limpar contexto, créditos por mensagem, banner de créditos no menu lateral com aviso em 10% [A51][A114].
- Central de conversa: item de chat na navegação; seletor de modelo, agentes pessoais e agentes de fluxo; prompts sugeridos; botões de aprovação; edição de anexos; usuário de chat como papel [A52][A114][A62].
- Chat de teste no canvas para gatilho de chat (ver 2.10) [A78][A114].

## 6. Tabela de atalhos de teclado do editor

Fonte principal: [A2]. Complementos: [A11] (publicar, despublicar, nomear versão), [A33] (grupos), [A78] (organizar, converter em subfluxo), [A114] (salvar manual). "Ctrl/Cmd" significa Ctrl no Windows e Linux e Cmd no macOS.

| Tecla | Efeito (em palavras próprias) | Fonte |
|---|---|---|
| Ctrl/Cmd + Alt + N | Criar fluxo novo | [A2] |
| Ctrl/Cmd + O | Abrir um fluxo | [A2] |
| Ctrl/Cmd + S | Salvar; com salvamento automático, abre o nomear versão no menu de publicar; com automático desligado, salva manualmente | [A2][A11][A114] |
| Ctrl/Cmd + Z | Desfazer | [A2] |
| Ctrl/Cmd + Shift + Z | Refazer | [A2] |
| Ctrl/Cmd + Enter | Executar o fluxo | [A2] |
| Shift + P | Publicar | [A11] |
| Ctrl/Cmd + U | Despublicar | [A11] |
| Ctrl/Cmd + K | Abrir a barra de comandos (desativado em modo só-canvas) | [A2][A58] |
| Ctrl/Cmd + arrastar com botão esquerdo | Mover a vista do canvas | [A2] |
| Ctrl/Cmd + arrastar com botão do meio | Mover a vista | [A2] |
| Espaço + arrastar | Mover a vista | [A2] |
| Botão do meio + arrastar | Mover a vista | [A2] |
| Dois dedos (toque) | Mover a vista | [A2] |
| + ou = | Aproximar | [A2] |
| - ou _ | Afastar | [A2] |
| 0 | Restaurar o zoom | [A2] |
| 1 | Enquadrar o fluxo inteiro | [A2] |
| Ctrl/Cmd + roda do mouse | Aproximar ou afastar | [A2] |
| Duplo clique no nó | Abrir detalhes do nó | [A2] |
| Ctrl/Cmd + duplo clique em nó de subfluxo | Abrir o subfluxo em nova aba | [A2] |
| Ctrl/Cmd + Shift + O (nó de subfluxo selecionado) | Abrir o subfluxo em nova aba | [A2] |
| Alt + G | Expandir todos os grupos, ou só os selecionados | [A2][A33] |
| Shift + Alt + G | Recolher todos os grupos, ou só os selecionados | [A2][A33] |
| Ctrl/Cmd + G | Agrupar nós selecionados | [A2][A33] |
| Ctrl/Cmd + Shift + G | Desagrupar | [A2][A33] |
| Espaço (grupo selecionado) | Renomear o grupo | [A2][A33] |
| Ctrl/Cmd + A | Selecionar todos os nós | [A2] |
| Ctrl/Cmd + C | Copiar seleção | [A2] |
| Ctrl/Cmd + X | Recortar seleção | [A2] |
| Ctrl/Cmd + V | Colar nós | [A2] |
| Shift + S | Adicionar nota adesiva | [A2] |
| Seta para baixo / para cima | Selecionar nó irmão abaixo ou acima | [A2] |
| Seta para a esquerda / direita | Selecionar nó à esquerda ou à direita | [A2] |
| Shift + seta para a esquerda / direita | Selecionar todos os nós à esquerda ou à direita | [A2] |
| D | Desativar nó selecionado | [A2] |
| Delete | Excluir seleção | [A2] |
| Enter (nó selecionado) | Abrir o nó | [A2] |
| F2 | Renomear o nó | [A2] |
| P | Fixar dados do nó | [A2] |
| Shift + Alt + T | Organizar automaticamente (tudo ou a seleção) | [A78] |
| Alt + X | Converter seleção em subfluxo | [A78] |
| N | Abrir o painel de criação de nós | [A2] |
| Enter (painel de nós) | Inserir o nó selecionado; em categoria, expandir, recolher ou abrir subcategoria | [A2] |
| Seta para a direita (painel de nós) | Expandir categoria ou abrir subcategoria | [A2] |
| Seta para a esquerda (painel de nós) | Recolher categoria ou fechar subcategoria | [A2] |
| Esc (painel de nós) | Fechar o painel | [A2] |
| = (campo de parâmetro vazio) | Mudar para modo expressão | [A2] |

Editor de código dentro do nó de código (resumo; a documentação lista dezenas de combinações de movimentação, seleção, linhas, comentários, autocompletar com Ctrl + Espaço, indentação, dobra de código, multicursor com Alt + clique, formatação) [A59]. Não copiada integralmente por ser um editor de texto padrão.

## 7. Funcionalidades de interface encontradas

Uma linha por funcionalidade, para a matriz de paridade da fase 2. Formato: id, funcionalidade, evidência.

Navegação e organização

- F-001 Menu lateral recolhível com botão universal de criação (fluxo, credencial, tabela, variável, chat) [A10][A18][A114]
- F-002 Página de visão geral com abas de fluxos, credenciais, execuções, variáveis, tabelas de dados [A41][A66][A14][A55][A25]
- F-003 Faixa de indicadores de uso (7 dias) no topo da visão geral, clicável [A65]
- F-004 Painel completo de indicadores com gráficos e tabela por fluxo [A65]
- F-005 Projetos de equipe com membros, papéis, ícone, nome, descrição [A8][A42][A114]
- F-006 Página de configurações do projeto (membros, renomear, excluir com transferência, cofres) [A8][A69]
- F-007 Mover fluxo ou credencial entre projetos com aviso sobre compartilhamentos [A8]
- F-008 Lista de fluxos em cartões com indicador de publicado, status de revisão, dependências [A11][A114]
- F-009 Filtro da lista por tags e por "mostrar arquivados" [A37][A78]
- F-010 Busca de fluxos cobrindo subpastas [A78]
- F-011 Pastas aninhadas com arrastar e soltar e trilha de navegação no canvas [A78]
- F-012 Tags globais, adicionar junto ao nome do fluxo, gerenciar (renomear, excluir) [A37]
- F-013 Arquivar em vez de excluir, mostrar arquivados, restaurar, excluir definitivamente [A78][A114]
- F-014 Favoritos (projetos, pastas, fluxos, tabelas) com seção no menu lateral, limite de 200 [A24]
- F-015 Barra de comandos com Ctrl/Cmd + K, ações contextuais e abas por tipo [A2][A114]
- F-016 Compartilhar fluxo do espaço pessoal com editores [A41]
- F-017 Menu de ajuda com documentação e, na nuvem, contato com suporte [A2][A114]
- F-018 Caixa de revisões pendentes no menu lateral [A39]
- F-019 Ferramenta de relatório de migração com tabela, filtros e ações em massa [A115]

Canvas e edição

- F-020 Pan por teclado, mouse e toque; zoom com teclas e roda; enquadrar; restaurar [A2]
- F-021 Mini-mapa do canvas [A78]
- F-022 Organizar automaticamente (botão, atalho, menu), inclusive só a seleção [A78]
- F-023 Seleção múltipla por caixa ou Ctrl + clique; selecionar todos; seleção direcional [A33][A2]
- F-024 Copiar, recortar, colar (inclusive entre fluxos via JSON), desfazer, refazer [A2][A40]
- F-025 Credenciais atribuídas automaticamente ao colar ou importar, com aviso [A114]
- F-026 Reposicionamento de vizinhos ao inserir nó; notas acompanham [A77][A114]
- F-027 Botões de adicionar e excluir sobre a ligação, com dicas [A114][A32]
- F-028 Inserir nó entre dois nós pelo sinal de mais [A22]
- F-029 Notas adesivas com Markdown, 7 cores mais personalizadas, redimensionar, atrás dos nós [A34]
- F-030 Grupos de canvas com nome, descrição, recolher, expandir, desagrupar, regras de validade [A33]
- F-031 Converter seleção em subfluxo pelo menu de contexto ou Alt + X [A30][A78]
- F-032 Abrir subfluxo em nova aba [A2][A78]
- F-033 Avatares de colaboradores no canvas e bloqueio de edição por aba com assumir [A78][A114][A11]
- F-034 Erros repetidos no canvas colapsados com contagem [A114]
- F-035 Modo só-canvas por configuração da instância [A58]
- F-036 Botão de executar com ícone do gatilho escolhido [A114]
- F-037 Barra de controles do canvas agrupada (zoom, organizar, enquadrar) [A114][A78]

Cabeçalho do editor

- F-038 Renomear fluxo no cabeçalho; trilha de pastas; tags [A22][A58][A37]
- F-039 Salvamento automático com indicador offline e repetição com espera; opção de salvar manual por configuração [A11][A114]
- F-040 Botão de publicar com nove estados documentados e atalho [A11]
- F-041 Menu de publicar: despublicar, nomear versão, enviar para revisão, revisão obrigatória [A11][A39]
- F-042 Publicação assíncrona e parcial com dica de qual gatilho falhou [A11]
- F-043 Abas de editor, execuções e avaliações [A15][A89][A58]
- F-044 Histórico de versões com prévia, restaurar, clonar, abrir em nova aba, baixar, nomear, diff e linha do tempo de publicação [A38][A114]
- F-045 Menu do fluxo: baixar, importar de URL e de arquivo, configurações, mover, dependências, duplicar, arquivar, excluir [A40][A36][A8][A114][A2]
- F-046 Indicador de status de revisão no cabeçalho [A114]
- F-047 Executar e publicar desativados com explicação quando falta credencial ou política bloqueia [A27][A114]

Painel de nós

- F-048 Painel de criação com busca, categorias, gatilhos (raio) e ações, seção de recomendados [A31]
- F-049 Navegação por teclado no painel [A2]
- F-050 Seções especiais: créditos de uso, nós comunitários verificados (escudo), servidores MCP [A61][A78][A114]
- F-051 Nós bloqueados por política ocultos ou com cadeado [A74]
- F-052 Instalar nó comunitário a partir do painel [A78]

Nós e ligações

- F-053 Controles ao passar o mouse: executar, desativar, excluir, menu [A31]
- F-054 Menu de contexto do nó com abrir, executar, renomear, desativar, fixar, copiar, duplicar, organizar, converter, selecionar, excluir [A31]
- F-055 Nome padrão do nó derivado da operação, preservando nomes personalizados [A78]
- F-056 Estado de nó desatualizado (borda e triângulo) com dica explicativa [A28]
- F-057 Nó restrito com rótulo e parâmetros somente leitura [A74]
- F-058 Nota do nó exibida como subtítulo [A31]
- F-059 Ligações de subnós de IA sob o nó raiz; passo de revisão humana na ligação agente-ferramenta [A76][A104][A77]
- F-060 Ordem de execução de ramificações configurável [A54][A36]

Painel de detalhe do nó

- F-061 Três colunas: entrada, parâmetros, saída; renomear; fechar; executar passo [A22]
- F-062 Vistas esquema, tabela e JSON [A6][A46]
- F-063 Pré-visualização de esquema sem executar [A78]
- F-064 Arrastar campo para parâmetro gerando expressão; inserção no cursor em campos de código [A43][A78]
- F-065 Reordenar parâmetros arrastando [A78]
- F-066 Busca visual na entrada e na saída [A85]
- F-067 Fixar e desafixar dados com faixa informativa; limites (uma saída, sem binário) [A20]
- F-068 Editar saída em JSON e salvar como dados fixados [A20]
- F-069 Copiar valor, caminho do item ou do parâmetro [A20]
- F-070 Linha de credencial com status, seletor agrupado, criar na hora, trocar por credencial própria, faixa de conexão rápida [A114][A27][A18]
- F-071 Botão de parar execução no painel [A114]
- F-072 Aba de configurações do nó: sempre gerar saída, executar uma vez, tentar de novo, em erro (3 modos), atributos de rastreamento, notas [A31]
- F-073 Painel de nó restrito [A114]

Execução manual e depuração

- F-074 Executar o fluxo inteiro; executar só um passo com os anteriores necessários [A17]
- F-075 Desativar nós para evitar chamadas externas durante testes [A17]
- F-076 Webhook: URL de teste e de produção, escutar evento de teste [A105]
- F-077 Chat de teste no canvas com streaming e histórico [A78][A114]
- F-078 Painel de logs inferior com hierarquia, tempos, tokens, pop-out [A78]
- F-079 Parar execução; parar todas com filtros [A2][A114]
- F-080 Simular dados com nós e reaproveitar JSON de execuções passadas [A20]

Expressões

- F-081 Modo expressão por alternância, por "=" ou por arrastar, com prévia imediata [A21][A2][A47]
- F-082 Autocompletar ao digitar o cifrão, com nomes alternativos [A106][A114]
- F-083 Modal de expressão com vista de esquema [A78]
- F-084 Famílias de variáveis e métodos (nó atual, outros nós, execução, fluxo, data e hora, variáveis, segredos, dados personalizados, auxiliares) [A45]
- F-085 Erros de ligação de itens mostrados na prévia [A87]

Execuções

- F-086 Lista global e por projeto na aba de execuções [A14]
- F-087 Lista por fluxo na aba do editor [A15]
- F-088 Filtros por fluxo, status (4), período, dados personalizados, versão [A14][A114]
- F-089 Repetir com fluxo atual ou original [A14][A15]
- F-090 Depurar no editor e copiar ao editor (fixa no primeiro nó) [A16]
- F-091 Pré-visualizar execução a partir da lista; página de execução com versão vinculada [A15][A114]
- F-092 Redação de dados com indicador e botão de revelar auditado [A94]
- F-093 Ícone de credencial de usuário final na lista; tamanho total de dados no cabeçalho [A114]
- F-094 Dados personalizados de execução (10 itens, chave 50, valor 255) [A53]
- F-095 Excluir execução; excluir fluxo apaga execuções [A2][A14]

Credenciais

- F-096 Criar pelo menu, pela visão geral, pelo projeto ou dentro do nó [A18]
- F-097 Modal com escolha de serviço, campos, tipo fixo ou de usuário final, domínios permitidos, expressões [A18]
- F-098 Teste ao salvar com retorno inline [A18][A114]
- F-099 Conexão rápida OAuth e botão de conectar; campos sobrescritos ocultos [A114][A68]
- F-100 Aba de compartilhamento com "pode usar" e "pode ver", projetos e usuários [A66][A27]
- F-101 Credenciais de usuário final com conexão por nó, modal ou lista [A56]
- F-102 Segredos externos referenciados em campos de credencial [A69]
- F-103 Créditos de uso no lugar da credencial (nuvem) [A61]

Configurações, versões, importação, modelos, variáveis

- F-104 Modal de configurações do fluxo com ordem de execução, fluxo de erro, política de chamada, fuso, salvamento, progresso, tempo limite, redação, tempo economizado, MCP [A36][A92]
- F-105 Importar e exportar JSON; copiar e colar nós [A40]
- F-106 Pacotes portáveis por API e linha de comando [A42]
- F-107 Modelos: biblioteca no site e bibliotecas personalizadas no aplicativo [A48]
- F-108 Variáveis globais e por projeto com aba própria [A55]
- F-109 Revisões de fluxo com envio, estados, atividade e diff [A39]
- F-110 Papéis de instância, de projeto e personalizados com página de papéis [A62][A26][A109]
- F-111 Políticas de segurança (2FA, compartilhar e publicar no espaço pessoal, revisões, redação) [A93]
- F-112 Usuários: tabela com busca, projetos, 2FA, última atividade, convites e exclusão com transferência [A63][A78][A114]
- F-113 Configurações pessoais: 2FA, tema escuro, validação inline [A75][A78][A114]
- F-114 Chaves de API com escopos, rotação, abas minhas e todas [A114]
- F-115 Servidor MCP da instância com clientes, consentimento e exposição por fluxo [A92]
- F-116 Ambientes Git: conectar, enviar, puxar, diff de fluxos, instância protegida [A71][A72][A73]
- F-117 Streaming de logs com destinos e eventos [A70]
- F-118 Nós comunitários: instalar, atualizar, desinstalar [A103]
- F-119 Tabelas de dados com edição em grade, CSV, busca e ordenação [A25][A114]
- F-120 Avaliações com conjunto de teste, métricas, rodadas e paralelismo [A89][A90]
- F-121 Construtor de agentes com pré-visualização, publicar, canais, sessões [A80]
- F-122 Assistente conversacional de construção, construtor de IA, assistente de ajuda e central de conversa [A49][A51][A50][A52]
- F-123 Idioma padrão com retorno ao inglês; personalização; avisos de versão [A97][A96]

## Ledger de fontes (A1..A117)

Todas acessadas em 2026-10-28. Quando a URL antiga redirecionou, registro a URL pedida e a canônica. Páginas lidas na versão Markdown (sufixo ".md").

- A1: https://docs.n8n.io/ . Página inicial da documentação; links de primeiros passos; aponta para o índice llms.txt.
- A2: https://docs.n8n.io/build/keyboard-shortcuts.md (também alcançada por https://docs.n8n.io/keyboard-shortcuts/). Lista completa de atalhos do editor e descrição da barra de comandos.
- A3: https://docs.n8n.io/build/understand-workflows.md (via https://docs.n8n.io/workflows/). Visão geral de fluxos e subpáginas.
- A4: https://docs.n8n.io/build/understand-workflows/understand-executions.md (via https://docs.n8n.io/workflows/executions/). Conceito de execução, modos, cota, duas listas, redação, dados ocultos por credencial.
- A5: https://docs.n8n.io/credentials/ . Índice da seção de credenciais; sem conteúdo de interface.
- A6: https://docs.n8n.io/build/work-with-data.md (via https://docs.n8n.io/data/). Visão geral de dados; vistas esquema, tabela e JSON no painel do nó; subpáginas.
- A7: https://docs.n8n.io/build/flow-logic.md (via https://docs.n8n.io/flow-logic/). Índice de lógica de fluxo.
- A8: https://docs.n8n.io/administer/manage-users-and-access/set-permissions-and-roles-rbac/organize-work-in-projects.md (via https://docs.n8n.io/user-management/rbac/projects/). Projetos: criar, membros, configurações, excluir, favoritar, mover recursos, credenciais pessoais.
- A9: https://docs.n8n.io/llms.txt . Índice completo da documentação (três trechos lidos).
- A10: https://docs.n8n.io/build/understand-workflows/create-and-run-workflows.md . Criar fluxo (botões de criação, destino), executar manualmente, publicar.
- A11: https://docs.n8n.io/build/understand-workflows/save-and-publish-workflows.md . Salvamento automático, estados do botão de publicar, despublicar, nomear versão, histórico, bloqueio de edição, indicador na lista.
- A12: https://docs.n8n.io/build/understand-workflows/workflow-components.md . Índice de componentes (nós, ligações, notas, grupos, id).
- A13: https://docs.n8n.io/build/manage-workflows.md . Índice de gestão de fluxos.
- A14: https://docs.n8n.io/build/understand-workflows/understand-executions/view-all-executions.md . Lista global e de projeto, filtros, repetir, limitações.
- A15: https://docs.n8n.io/build/understand-workflows/understand-executions/view-executions-for-a-single-workflow.md . Lista por fluxo, prévia, redação por credencial de usuário final, filtros, repetir.
- A16: https://docs.n8n.io/build/understand-workflows/understand-executions/debug-executions.md . Depurar no editor e copiar ao editor; disponibilidade.
- A17: https://docs.n8n.io/build/understand-workflows/understand-executions/types-of-executions.md . Execuções manuais, parciais e de produção; botões e limites.
- A18: https://docs.n8n.io/build/understand-workflows/create-and-edit-credentials.md . Pontos de entrada, modal, tipo, domínios, expressões, nome, teste, créditos de uso.
- A19: https://docs.n8n.io/build/work-with-data/reference-data.md . Referenciar dados por expressão ou arrastar.
- A20: https://docs.n8n.io/build/work-with-data/pin-and-mock-data.md . Fixar, editar saída, copiar valores, simular dados, reaproveitar execuções.
- A21: https://docs.n8n.io/build/work-with-data/transform-data/expressions-for-data-transformation.md . Sintaxe de expressões, modo expressão, problemas comuns.
- A22: https://docs.n8n.io/build-your-first-workflow.md . Tutorial: espaço pessoal, criar fluxo, renomear, painel de nós, painel de detalhe em três colunas, executar passo, tabelas de dados, publicar, assistente.
- A23: https://docs.n8n.io/build/ways-of-building-workflows.md . Formas de construir (assistente, MCP, modelos, ajuda de IA, central de conversa).
- A24: https://docs.n8n.io/build/manage-workflows/favorite-items.md . Favoritos: onde, seção no menu, limites.
- A25: https://docs.n8n.io/build/work-with-data/data-tables.md . Tabelas de dados: aba, criar, editar, CSV, limites.
- A26: https://docs.n8n.io/administer/manage-users-and-access/set-permissions-and-roles-rbac/see-available-roles.md . Papéis de projeto e tabela de permissões.
- A27: https://docs.n8n.io/administer/manage-credentials/use-personal-credentials-in-projects.md . Credenciais pessoais em projetos, seletor agrupado, níveis de acesso, botões desativados, usuário que executa, dados ocultos.
- A28: https://docs.n8n.io/build/understand-workflows/understand-executions/understand-dirty-nodes.md . Nós desatualizados: causas, indicação visual, efeito em execuções parciais.
- A29: https://docs.n8n.io/build/flow-logic/handle-errors-gracefully.md . Fluxo de erro nas configurações; dados do gatilho de erro.
- A30: https://docs.n8n.io/build/flow-logic/convert-to-sub-workflows.md . Converter seleção em subfluxo: menu, regras, limitações.
- A31: https://docs.n8n.io/build/understand-workflows/workflow-components/work-with-nodes.md . Adicionar nós, gatilhos e ações, controles ao passar o mouse, menu de contexto, aba de configurações do nó.
- A32: https://docs.n8n.io/build/understand-workflows/workflow-components/connect-nodes-together.md . Criar e excluir ligações.
- A33: https://docs.n8n.io/build/understand-workflows/workflow-components/canvas-groups.md . Grupos de canvas completos.
- A34: https://docs.n8n.io/build/understand-workflows/workflow-components/add-notes-and-documentation.md . Notas adesivas: adicionar, editar, Markdown, cores, mover, redimensionar.
- A35: https://docs.n8n.io/build/understand-workflows/workflow-components/find-your-workflow-id.md . Id do fluxo na URL e no título das configurações.
- A36: https://docs.n8n.io/build/manage-workflows/configure-workflow-settings.md . Todas as configurações do fluxo.
- A37: https://docs.n8n.io/build/manage-workflows/tag-workflows.md . Tags: adicionar, filtrar, gerenciar.
- A38: https://docs.n8n.io/build/manage-workflows/view-change-history.md . Histórico: abrir, quando cria versão, ações, retenção.
- A39: https://docs.n8n.io/build/manage-workflows/workflow-reviews.md . Revisões: envio, estados, detalhe, permissões, limitações.
- A40: https://docs.n8n.io/build/manage-workflows/export-and-import.md . Copiar e colar, baixar, importar de URL e arquivo, conteúdo exportado, linha de comando.
- A41: https://docs.n8n.io/build/manage-workflows/share-with-others.md . Compartilhar fluxo, papéis criador e editor, credenciais, conteúdo da lista.
- A42: https://docs.n8n.io/build/manage-workflows/n8n-packages.md . Pacotes portáveis: sem interface no editor, conteúdo, conflitos.
- A43: https://docs.n8n.io/build/work-with-data/reference-data/use-the-ui-mapper.md . Mapeamento por arrastar e por expressão.
- A44: https://docs.n8n.io/build/work-with-data/reference-data/reference-previous-nodes.md . Métodos de entrada atual e de nós anteriores; ligação de itens.
- A45: https://docs.n8n.io/build/work-with-data/transform-data/expression-reference.md . Famílias de variáveis e métodos; subpáginas.
- A46: https://docs.n8n.io/build/work-with-data/understand-n8ns-data-structure.md . Estrutura de itens; exibição em tabela; expressão gerada ao arrastar.
- A47: https://docs.n8n.io/build/work-with-data/expressions-versus-data-nodes.md . Expressões versus nós; prévia imediata.
- A48: https://docs.n8n.io/build/ways-of-building-workflows/use-templates.md . Modelos: ícone, biblioteca, bibliotecas personalizadas e sua API.
- A49: https://docs.n8n.io/build/ways-of-building-workflows/n8n-assistant.md . Assistente conversacional: painel, capacidades, aprovações, preferências, créditos.
- A50: https://docs.n8n.io/build/ways-of-building-workflows/use-the-ai-assistant.md . Assistente de ajuda legado; configuração de uso de IA.
- A51: https://docs.n8n.io/build/ways-of-building-workflows/ai-workflow-builder.md . Construtor de fluxos por IA: painel, uso, créditos.
- A52: https://docs.n8n.io/build/ways-of-building-workflows/chat-hub.md . Central de conversa: item de navegação, seletor de modelo, agentes.
- A53: https://docs.n8n.io/build/understand-workflows/understand-executions/customize-executions-data.md . Dados personalizados de execução: definir, ler, limites, filtro.
- A54: https://docs.n8n.io/build/flow-logic/understand-execution-order.md . Ordem de execução legada e atual.
- A55: https://docs.n8n.io/build/code-in-n8n/define-custom-variables.md . Variáveis: aba, criar, escopos, regras, uso.
- A56: https://docs.n8n.io/administer/manage-credentials/end-user-credentials.md . Credenciais de usuário final: criar, conectar, exibição no nó, privacidade, exclusão.
- A57: https://docs.n8n.io/administer/manage-users-and-access/set-permissions-and-roles-rbac.md . Papéis de instância e de projeto; disponibilidade.
- A58: https://docs.n8n.io/deploy/host-n8n/configure-n8n/deploy-n8n-in-canvas-only-mode.md . Modo só-canvas: o que esconde e o que mantém.
- A59: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/keyboard-shortcuts.md . Atalhos do editor de código do nó de código.
- A60: https://docs.n8n.io/build/code-in-n8n/get-coding-help-from-ai.md . Ajuda de IA no nó de código.
- A61: https://docs.n8n.io/build/understand-workflows/use-gateway-credits.md . Créditos de uso no campo de credencial e no painel de nós.
- A62: https://docs.n8n.io/administer/manage-users-and-access/understand-instance-roles.md . Papéis de instância.
- A63: https://docs.n8n.io/administer/manage-users-and-access/add-and-remove-users.md . Página de usuários: menus, excluir com transferência, reenviar convite.
- A64: https://docs.n8n.io/administer/manage-users-and-access/set-permissions-and-roles-rbac/create-custom-roles.md . Papéis personalizados: tipos e disponibilidade.
- A65: https://docs.n8n.io/administer/observe-and-log/track-usage-with-insights.md . Indicadores de uso: faixa, painel, métricas, períodos, tempo economizado.
- A66: https://docs.n8n.io/administer/manage-credentials/share-credentials-securely.md . Compartilhar credenciais: aba, papéis, remover.
- A67: https://docs.n8n.io/administer/manage-credentials.md . Índice de gestão de credenciais.
- A68: https://docs.n8n.io/administer/manage-credentials/credential-overwrites.md . Sobrescritas: configuração e campos ocultos.
- A69: https://docs.n8n.io/administer/manage-credentials/use-external-secret-stores.md . Segredos externos: página, provedores, uso em campos, projeto.
- A70: https://docs.n8n.io/administer/observe-and-log/stream-logs-to-external-systems.md . Streaming de logs: página, destinos, eventos.
- A71: https://docs.n8n.io/administer/use-source-control-and-environments/set-up-source-control.md . Configurar Git: campos, conectar, ramo, instância protegida, cor.
- A72: https://docs.n8n.io/administer/use-source-control-and-environments/push-and-pull-changes.md . Enviar e puxar: botões, modais, conflitos, publicação automática.
- A73: https://docs.n8n.io/administer/use-source-control-and-environments/compare-versions.md . Diff de fluxos: layout, marcas, navegação, disponibilidade.
- A74: https://docs.n8n.io/administer/manage-users-and-access/control-node-availability.md . Políticas de nós: efeitos no painel, canvas, detalhe e publicação.
- A75: https://docs.n8n.io/administer/manage-users-and-access/verify-user-identity/require-two-factor-auth.md . 2FA nas configurações pessoais.
- A76: https://docs.n8n.io/key-concept-glossary.md (mesmo conteúdo em https://docs.n8n.io/glossary.md). Glossário: canvas, editor, nó, gatilho, subnó, raiz, cluster, expressão, execução, fixação, projeto, credencial, modelo, avaliação, tabela, agente.
- A77: https://docs.n8n.io/changelog/release-notes-2.x.md . Notas 2.0 a 2.29: publicar e rascunho, canvas, papéis, diff, segredos, MCP no painel, botão de conectar, listas mais rápidas.
- A78: https://docs.n8n.io/changelog/release-notes-1.x.md (três trechos). Notas 1.x: novo canvas e mini-mapa, organizar, pastas, arquivar, logs, avaliações, pré-visualização de esquema, reordenar parâmetros, modo escuro, histórico, avatares, busca em dados, cores de notas, nomes padrão, usuários, MCP, variáveis, tabelas.
- A79: https://docs.n8n.io/build/integrate-ai/test-and-improve-ai-workflows.md . Índice de avaliações.
- A80: https://docs.n8n.io/build/build-and-manage-agents.md . Construtor de agentes: layout, abas, pré-visualização, publicar, chat.
- A81: https://docs.n8n.io/build/ways-of-building-workflows/connect-to-n8n-mcp-server.md . Servidor MCP como forma de construir (sem interface).
- A82: https://docs.n8n.io/connect/n8n-api.md . API pública: disponibilidade, playground.
- A83: https://docs.n8n.io/build/work-with-data/handle-special-data-types/work-with-files-and-images.md . Binários: só nós; nada de interface.
- A84: https://docs.n8n.io/build/integrate-ai/understand-ai-components.md . Índice de componentes de IA.
- A85: https://docs.n8n.io/build/work-with-data/filter-out-unwanted-data.md . Busca visual nos painéis de entrada e saída; filtragem por nós.
- A86: https://docs.n8n.io/build/understand-workflows/understand-executions/stream-real-time-responses.md . Modo de resposta em streaming.
- A87: https://docs.n8n.io/build/work-with-data/reference-data/link-data-items/item-linking-errors.md . Erros de ligação de itens e onde aparecem.
- A88: https://docs.n8n.io/administer/manage-users-and-access/set-up-for-cloud.md . Conta do dono, convites por e-mail, regras de senha.
- A89: https://docs.n8n.io/build/integrate-ai/test-and-improve-ai-workflows/run-quick-evaluations.md . Avaliações rápidas: aba, conjunto, gatilho, execução.
- A90: https://docs.n8n.io/build/integrate-ai/test-and-improve-ai-workflows/use-metrics-to-measure-quality.md . Métricas, executar teste, paralelismo, resultados.
- A91: https://docs.n8n.io/build/integrate-ai/test-and-improve-ai-workflows/fix-common-issues.md . Problemas comuns de avaliação.
- A92: https://docs.n8n.io/connect/connect-to-n8n-mcp-server.md . Página de MCP da instância, expor fluxos, conectar cliente, clientes, estados.
- A93: https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/manage-security-policies.md . Políticas de segurança e seus interruptores.
- A94: https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/redact-execution-data.md . Redação: por fluxo, por instância, aparência, revelar, auditoria.
- A95: https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/workflows.md . Variáveis: nome padrão, dicas, tags, política de chamada.
- A96: https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/deployment.md . Variáveis: modelos, personalização, avisos de versão, telemetria, só-canvas, interface desligada.
- A97: https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/timezone-and-localization.md . Fuso e idioma padrão.
- A98: https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/executions.md . Padrões de salvamento, tempo limite, poda, concorrência.
- A99: https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/workflow-history.md . Retenção do histórico.
- A100: https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/nodes.md . Nós excluídos, incluídos, pacotes comunitários.
- A101: https://docs.n8n.io/deploy/use-n8n-cloud/use-the-cloud-console.md . Console da nuvem e acesso pelo editor.
- A102: https://docs.n8n.io/deploy/host-n8n/community-edition-features.md . Comparação de edições (pastas, depurar no editor, dados personalizados, projetos, compartilhamento).
- A103: https://docs.n8n.io/integrations/community-nodes/installation/gui-install.md . Instalar nós comunitários pela interface.
- A104: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger.md . Gatilho de chat: público, hospedado ou embutido, autenticação, conector de memória.
- A105: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook.md . Webhook: URLs de teste e produção, escutar evento de teste.
- A106: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code.md . Nó de código: modos, linguagens, autocompletar.
- A107: https://docs.n8n.io/connect/n8n-api/workflow.md . API de fluxos: publicado, arquivado, pasta, chaves de configurações, política de chamada, redação, MCP.
- A108: https://docs.n8n.io/connect/n8n-api/folders.md . API de pastas: criar, aninhar, mover, excluir com transferência.
- A109: https://docs.n8n.io/administer/manage-users-and-access/set-permissions-and-roles-rbac/create-custom-roles/create-custom-project-roles.md . Página de papéis, formulário, grupos de permissão, atribuição, editar, duplicar, excluir.
- A110: https://docs.n8n.io/administer/use-source-control-and-environments/use-git-in-n8n.md . Comportamento de enviar e puxar (sem interface).
- A111: https://docs.n8n.io/administer/use-source-control-and-environments/work-with-environments.md . Conceito de ambiente (sem interface).
- A112: https://docs.n8n.io/connect/n8n-api/executions.md . API de execuções: enum de status, filtros, campos, parar.
- A113: https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/license.md . Ocultar página de uso; renovação manual.
- A114: https://docs.n8n.io/changelog/release-notes.md (três trechos, 2.1 a 2.45). Notas recentes: barra de comandos, grupos, revisões, favoritos, MCP, chaves de API, credenciais, redação, painel de nós, tabelas, agentes, assistente, logs, canvas.
- A115: https://docs.n8n.io/changelog/v30-migration-tool.md . Relatório de migração: layout, tabela, filtros, ações em massa.
- A116: https://docs.n8n.io/build/ways-of-building-workflows/n8n-assistant/browser-use.md . Uso do navegador pelo assistente; requisitos; indisponível em celulares e tablets.
- A117: https://docs.n8n.io/courses/level-one/chapter-1/ e https://docs.n8n.io/courses/level-one/chapter-5/chapter-5.8/ . Redirecionam (308) para um site de aprendizagem externo; não consultados por regra do levantamento.

## Desconhecidos em aberto

Pontos que a documentação pública não permite afirmar. Candidatos a verificação por outro meio na fase 2 (sem usar código-fonte).

1. Lista de fluxos: critérios de ordenação, paginação ou rolagem, filtro por status publicado e por dono na lista principal, estado de "sem resultados".
2. Lista de execuções: colunas, atualização automática, paginação, seleção e exclusão em massa, ordenação, exibição dos estados cancelada, travada, nova e desconhecido.
3. Painel de detalhe do nó: navegação entre nós sem fechar, seletor de qual nó anterior alimenta a entrada, aba de binário (ver, baixar), contagem de itens e tempo no painel, paginação de itens, estados de carregamento.
4. Configurações do nó: tempo entre tentativas, número máximo de tentativas, versão do nó na interface.
5. Canvas: rótulos de contagem de itens sobre ligações, indicador de erro e de espera sobre o nó, substituição direta de nó, alinhamento em grade, limites de zoom, cores exatas de borda.
6. Notas adesivas: forma de excluir, camadas, limites de tamanho. Grupos: cores, aninhamento, mover grupo inteiro.
7. Painel de criação de nós: lista fixa de categorias, abas, pré-visualização ao passar o mouse, posição exata no modo normal.
8. Credenciais: colunas e filtros da lista, aba de detalhes, mensagens de erro de teste, etapas visuais do redirecionamento OAuth.
9. Modelos: fluxo de importação (nova aba, modal de credenciais) e filtros dentro do aplicativo.
10. Importação e exportação: se dados fixados vão no JSON baixado.
11. Celular e responsividade: suporte oficial, pontos de quebra, navegadores mínimos.
12. Estados genéricos de carregamento e de erro das páginas; páginas de login além da prioridade de SSO.
13. Barra de comandos: busca difusa, ordenação de recentes (há indícios de ordenação por última atualização em resumo de busca, sem leitura direta do trecho).
14. Tags: limites de quantidade e tamanho. Pastas: diálogo de criar e renomear, profundidade na interface.
15. Projetos: limites numéricos por plano, exibição da descrição na lista.
16. Cursos antigos que descreviam a interface tela a tela estão fora do site de documentação e não foram consultados.
