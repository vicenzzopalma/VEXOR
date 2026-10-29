# Matriz de paridade VEXOR x n8n (fase 2, versão 2)

Versão 2, de 29/10/2026. Substitui a tabela resumida do commit `0a2c204`. Base: arquivos 01 (editor pela documentação), 02 (backend pela documentação, seções 0 a 12), 03 (inventário do VEXOR) e 04 (artefatos com REA). Também considera o que já entrou depois do inventário: o detalhe do bloco no editor (commits `0a2c204` e `46b2843`) e os filtros e a paginação de execuções (`779e064`). Refinada com 06 (editor com REA e leitura dos mapas de origem) e 07 (backend com REA e leitura do servidor compilado). Valores numéricos citados nesses arquivos (larguras, limites, intervalos) são referência de comportamento: o VEXOR escolhe os próprios valores.

## Legenda

- **VEXOR**: Tem, Parcial ou Falta (fonte: `03-inventario-vexor.md`).
- **Prioridade**: P0 é o que o usuário pediu primeiro (editor no padrão do SAIR, painel do nó, execuções). P1 é necessário para usar no dia a dia. P2 é ganho grande, mas pode esperar. P3 é fora do foco agora (IA, enterprise, nuvem).
- **Esforço**: P (até 1 dia), M (2 a 4 dias), G (1 semana ou mais).
- **Evidência**: ids F-xxx do 01, E-x do 04 e seções do 03.

## 1. Editor: canvas e nós

| Funcionalidade | VEXOR | Prioridade | Esforço | Evidência |
| --- | --- | --- | --- | --- |
| Nó quadrado com ícone e nome embaixo, alças esquerda/direita, layout da esquerda para a direita | Parcial (visual do SAIR aplicado ao editor comum em `0a2c204`; falta conferir a direção do layout) | P0 | P | F-053, 03 seção 3 |
| Ligações com contagem de itens após execução | Parcial (só no SAIR) | P0 | P | 03 seção 3, 06 |
| Estados visuais do nó: sucesso, erro, executando, desativado, fixado, desatualizado | Falta | P0 | M | F-056, F-034 |
| Inserir nó sobre a ligação (botão no meio) e excluir ligação no passar do mouse | Falta | P0 | M | F-027, F-028 |
| Controles do nó no passar do mouse: executar, desativar, excluir, menu | Falta | P0 | P | F-053 |
| Menu de contexto do nó (abrir, executar, renomear, desativar, fixar, copiar, duplicar, excluir) | Falta | P1 | M | F-054 |
| Desativar nó (passa os itens adiante sem executar) | Falta | P1 | M | F-075 |
| Pan, zoom, enquadrar, mini-mapa, seleção múltipla, desfazer/refazer | Tem | ok | | F-020..F-023, 03 seção 14 |
| Organizar automaticamente (só a seleção também) | Parcial (dagre, de cima para baixo) | P0 | P | F-022 |
| Copiar e colar nós como JSON, inclusive entre fluxos | Falta | P1 | M | F-024 |
| Notas adesivas com Markdown e cores | Falta | P1 | M | F-029 |
| Grupos de canvas | Falta | P3 | G | F-030 |
| Converter seleção em sub-fluxo | Falta | P3 | G | F-031 |
| Barra de comandos (Ctrl/Cmd + K) | Falta | P2 | M | F-015 |
| Painel de criação de nós com busca, gatilhos x ações, recomendados, teclado | Parcial (biblioteca lateral com busca e filtro) | P1 | M | F-048, F-049 |

## 2. Painel de detalhe do nó

| Funcionalidade | VEXOR | Prioridade | Esforço | Evidência |
| --- | --- | --- | --- | --- |
| Três colunas Entrada, Parâmetros, Saída ao abrir o nó | Tem, versão inicial (`0a2c204`): dados da simulação da sessão ou de uma execução real escolhida | P0 refinar | M | F-061, 03 lacuna 1 |
| Vistas tabela, JSON e esquema na entrada e na saída | Falta | P0 | M | F-062 |
| Esquema prévio sem executar | Falta | P2 | M | F-063 |
| Arrastar campo da entrada para um parâmetro gerando variável | Falta (há pílulas de variável) | P1 | M | F-064 |
| Executar só este nó (com os anteriores necessários) | Falta | P0 | G | F-074, F-017 |
| Fixar dados de saída e editar saída em JSON | Falta | P1 | M | F-067, F-068 |
| Seletor de nó de entrada e navegação entre nós sem fechar | Falta | P1 | P | 01 desconhecidos, 06 |
| Busca nos dados de entrada e saída | Falta | P2 | P | F-066 |
| Aba de configurações do nó: em erro (parar, continuar, saída de erro), tentar de novo com limite e espera, executar uma vez, sempre gerar saída, notas | Falta | P1 | M | F-072, 06 seção 1, 07 (erros) |
| Nó desatualizado calculado pela hora da última execução contra mudanças de parâmetro, ligação ou dados fixados | Falta | P1 | M | F-056, 06 seção 2 |
| Proteção de exibição para saídas grandes (aviso com baixar ou exibir) e paginação dos itens | Falta | P1 | P | 06 seção 1 |
| Copiar valor ou caminho do campo | Falta | P2 | P | F-069 |

## 3. Cabeçalho do editor, versões, importação

| Funcionalidade | VEXOR | Prioridade | Esforço | Evidência |
| --- | --- | --- | --- | --- |
| Abas Editor e Execuções no fluxo comum | Falta (só no SAIR) | P0 | M | F-043 |
| Interruptor ativo/inativo por fluxo (publicar e despublicar), erro de ativação salvo no fluxo, caminho de webhook único | Falta (só publicar versão) | P0 | M | F-040, F-041, E4, 07 (ativação) |
| Salvamento automático com indicador | Tem | ok | | F-039, 03 seção 14 |
| Histórico de versões com prévia, restaurar, nomear e diff (posição x parâmetro) | Parcial (versões imutáveis, sem diff nem restauração) | P1 | G | F-044, E3 |
| Importar e exportar JSON do fluxo (arquivo e colar) | Falta (só exportar rascunho em conflito) | P1 | M | F-045, F-105 |
| Configurações do fluxo: fluxo de erro, fuso, tempo limite, o que salvar de execuções | Falta | P1 | M | F-104 |
| Tags de fluxo e filtro por tag | Falta | P2 | P | F-012, F-009 |
| Pastas dentro do projeto | Falta | P2 | M | F-011, E4 |
| Favoritos | Falta | P3 | P | F-014 |

## 4. Execuções

| Funcionalidade | VEXOR | Prioridade | Esforço | Evidência |
| --- | --- | --- | --- | --- |
| Lista global, por projeto e por fluxo | Tem | ok | | F-086, F-087 |
| Execuções em andamento no topo e atualização automática com pausa em aba oculta | Falta | P1 | P | 06 seção 3 |
| Estados terminais separados: cancelada e quebrada, além de erro e sucesso | Falta | P1 | M | 07 (estados) |
| Troca de estado condicional (só se o estado atual for o esperado) em parar, retomar e finalizar | Parcial (token de posse na fila) | P1 | M | 07 (ciclo de vida) |
| Recuperação após reinício: marcar execução órfã como quebrada e visível | Parcial (lease de 60 s re-enfileira) | P1 | M | 07 (recuperação) |
| Tempo limite por fluxo com teto da instância | Falta | P2 | M | 07 (tempo limite) |
| Despublicar sozinho após várias quebras seguidas e avisar o responsável | Falta | P3 | M | 07 (recuperação) |
| Filtros por estado, período, fluxo e paginação | Tem (`779e064`), mas a API ativa na porta 4000 ainda não foi reiniciada com a consulta nova | P0 ativar | P | F-088, 03 lacuna 8 |
| Detalhe da execução sobre o canvas com dados por nó | Parcial (diálogo com log por etapa) | P0 | G | F-091, 03 seção 4 |
| Parar execução em andamento e parar várias | Falta | P1 | M | F-079, E4 |
| Repetir a partir do nó que falhou, com fluxo atual ou original, ligando a nova execução à original | Falta | P1 | G | F-089, E4, 07 (repetir) |
| Depurar no editor (copiar dados ao editor fixados) | Falta | P2 | M | F-090 |
| Painel de logs na base do canvas (árvore por rodada, seleciona o nó com erro, J/K e Enter) | Falta | P1 | M | F-078, 06 seção 3 |
| Dados personalizados de execução e filtro por eles | Falta | P3 | M | F-094 |
| Redação de dados sensíveis com revelação auditada | Parcial (entrada e saída já redigidas) | P2 | M | F-092, 03 seção 14 |
| Retenção e limpeza automática de execuções | Desconhecido no VEXOR | P2 | M | 02 seção 2.6 |

## 5. Gatilhos e nós genéricos

| Funcionalidade | VEXOR | Prioridade | Esforço | Evidência |
| --- | --- | --- | --- | --- |
| Gatilho manual (executar pela interface com dados reais) | Falta (só simulação) | P0 | M | F-036, F-074 |
| Agendamento (intervalo e cron, fuso) | Falta | P1 | M | E6, 02 seção 5.1 |
| Webhook com métodos, URL de teste e de produção, modos de resposta | Parcial (só POST, URL única) | P1 | M | F-076, 02 seção 5.2 |
| Responder ao webhook com dados do fluxo | Falta | P2 | M | E6 |
| Requisição HTTP genérica com credencial | Falta | P1 | G | E6, 04 seção 5 |
| Condição (tem), roteamento por regras com várias saídas | Parcial | P1 | M | E6 |
| Juntar caminhos, filtrar, dividir em lotes (laço) | Falta | P2 | G | E6 |
| Definir campos e transformar dados | Falta | P1 | M | E6 |
| Código (JavaScript isolado) | Falta | P2 | G | E6 |
| Esperar (tempo, data) | Tem (espera durável) | ok | | 03 seção 4 |
| Esperar retomada por webhook ou formulário | Falta | P2 | M | 02 seção 4.4 |
| Executar outro fluxo (sub-fluxo) e fluxo de erro (só publicado, nunca em teste manual) | Falta (planejado) | P2 | G | 03 lacuna 9, 07 (erros) |
| Limite de execuções simultâneas por organização (fila FIFO; teste, repetição e espera não contam) | Falta | P2 | M | 07 (concorrência) |
| Expressões com acesso a qualquer nó anterior e funções de data, texto e lista | Parcial (allowlist lead e steps) | P1 | G | F-081..F-084 |

## 6. Credenciais e integrações

| Funcionalidade | VEXOR | Prioridade | Esforço | Evidência |
| --- | --- | --- | --- | --- |
| Credenciais cifradas, nunca devolvidas | Tem (AES-256-GCM, mais forte que a referência) | ok | | 03 seção 6, 07 (credenciais) |
| Segredo mascarado ao editar; reenviar a máscara significa manter o valor | A verificar no VEXOR | P1 | P | 07 (credenciais) |
| Teste ao salvar com retorno na hora | Parcial (por conector) | P1 | P | F-098 |
| Criar credencial de dentro do nó | Falta | P1 | M | F-096, F-070 |
| Credenciais por projeto e compartilhamento (pode usar x pode ver) | Falta (só por organização) | P2 | M | F-100, E4 |
| OAuth2 completo: estado de uso único com validade curta, URL de retorno, renovação serializada por credencial | Falta (Google sem callback) | P1 | M | F-099, 03 lacuna 10, 07 (OAuth) |
| Credenciais genéricas (básica, cabeçalho, query, OAuth genérico) para HTTP | Falta | P1 | M | 02 seção 6 |

## 7. Organização, acesso e API

| Funcionalidade | VEXOR | Prioridade | Esforço | Evidência |
| --- | --- | --- | --- | --- |
| Projetos com abas Fluxos, Execuções, Credenciais | Tem | ok | | F-002, 03 seção 14 |
| Mover fluxo entre projetos, arquivar e restaurar | Tem | ok | | F-007, F-013 |
| Papéis por projeto com escopos de ação (ler, atualizar, executar, publicar, mover); executar e publicar exigem acesso às credenciais usadas | Falta (papéis por organização; 404 fora do alcance já é o padrão) | P2 | G | F-110, E4, 07 (permissões) |
| Login de produção, convites, gestão de usuários | Falta | P1 | G | F-112, 03 lacuna 7 |
| Variáveis globais e por projeto | Falta | P2 | M | F-108 |
| Chaves de API com escopos e API pública versionada | Falta | P2 | G | F-114, E5 |
| Controle de versão por git, SSO, LDAP, log streaming | Falta | P3 | G | F-116, F-117 |
| Tabelas de dados | Falta | P3 | G | F-119 |
| IA (assistente, agentes, avaliações, chat) | Falta | P3 | G | F-120..F-122 |

## 8. Dívidas do VEXOR que travam a paridade

| Item | Prioridade | Esforço |
| --- | --- | --- |
| Renomear classes CSS com prefixo de marca de terceiros para um prefixo próprio | P0 | P |
| Extrair o nó, a ligação e o painel do SAIR para componentes do editor comum (sem criar pastas novas) | P0 | M |
| `npm run dev` sem subir o gateway a tempo | P1 | M |
| Build bloqueado pela DLL do Prisma com serviços ativos | P1 | P |
| Documentos com acentos corrompidos | P2 | P |

## 9. Ordem proposta para a fase 3

1. **Fatia 1, base visual**: renomear o prefixo de marca, layout da esquerda para a direita, estados visuais do nó, contagem de itens nas ligações e botão de inserir na ligação.
2. **Fatia 2, painel do nó (refinar o que já existe)**: vistas tabela, JSON e esquema; seletor de nó de entrada; navegação entre nós; aba de configurações do nó.
3. **Fatia 3, execução pela interface**: gatilho manual com dados reais, executar só este nó, contagem nas ligações, abas Editor e Execuções, interruptor ativo com erro de ativação visível.
4. **Fatia 4, execuções**: reiniciar a API para ativar os filtros já feitos, estados cancelada e quebrada, parar, repetir a partir do nó com falha, painel de logs, atualização automática.
5. **Fatia 5, nós genéricos**: HTTP com credencial genérica, definir campos, roteamento, agendamento, webhook com métodos e resposta.
6. **Fatia 6, edição avançada**: copiar e colar JSON, importar e exportar, notas, configurações do nó (erro, tentar de novo), fixar dados.
7. Depois: versões com diff, credenciais por projeto, papéis por escopo, API pública, variáveis.

Cada fatia: um agente por área sem arquivos em comum, testes no banco `eimax_test`, prints desktop e celular, revisão independente antes do commit.
