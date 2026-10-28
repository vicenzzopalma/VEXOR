# Artefatos publicados do n8n: o que os pacotes mostram

Fonte: pacotes públicos do npm baixados em 28/10/2026 para `D:\VEXOR\_ref\n8n` (fora do repositório). Nada daqui foi copiado para o VEXOR: só nomes de conceitos, contagens e formatos de contrato, descritos nas nossas palavras. Ids entre colchetes apontam para `00-ledger-evidencias.md`.

## Como ler

- **Observação (REA)**: saiu de uma evidência do REA, com id `ev_...`.
- **Observação (leitura direta)**: saiu de grep, listagem ou script nosso sobre o artefato, sem REA. Vale como fato do artefato, mas sem a cadeia de evidência do REA.
- **Inferência**: dedução nossa.
- **Desconhecido**: não dá para afirmar com o que foi lido.

## 1. Pacotes e proveniência

**Observação (leitura direta)** [E1]: sete pacotes baixados com `npm pack`, SHA-256 em `evidence/tarballs.sha256`.

| Pacote | Versão | Papel |
| --- | --- | --- |
| n8n | 2.45.5 | servidor (API interna, API pública, execução, fila, webhooks) |
| n8n-editor-ui | 2.16.2 | editor web compilado, com mapas de origem |
| n8n-workflow | 2.16.0 | modelo de fluxo, expressões, estados de execução, diff |
| n8n-core | 2.16.1 | motor de execução de nós |
| n8n-nodes-base | 2.15.1 | catálogo de nós e credenciais |
| @n8n/n8n-nodes-langchain | 2.45.4 | nós de IA |
| @n8n/design-system | 2.44.5 | componentes visuais |

**Observação (leitura direta)** [E1]: todos declaram licença "SEE LICENSE IN LICENSE.md" (Sustainable Use License). Confirma a regra clean-room.

## 2. REA no modelo de fluxo (n8n-workflow)

**Observação (REA)** [E2]: `analyze_javascript_application` sobre o pacote inteiro, 841 arquivos relevantes, 420 arquivos JavaScript analisados sem falha de parse, 4.940 achados. Cobertura semântica parcial (teto de 20.000 nós por arquivo e 100.000 no total). Evidência completa `ev_cf30899f...`, resumo `ev_fe1eea28...`, página de módulo `ev_4d0f892e...`.

**Observação (leitura direta)** [E3]: o pacote separa em módulos próprios: estados de execução, expressões e sandbox de expressões, agendamento (conversão para expressão cron), validação de fluxo, diff entre duas versões de fluxo (comparação de nós, mudança só de posição x mudança real, mudança de credencial), soma de verificação do fluxo, ordem de execução por grafo, dados de execução por nó e proxy de dados para expressões.

**Inferência**: o diff de versões é uma capacidade de primeira classe (há regras para ignorar mudanças só de posição). Para o VEXOR, histórico de versões com diff visual deve tratar "moveu nó" separado de "mudou parâmetro".

**Desconhecido**: lista exata dos estados de execução. A leitura direta não achou os literais no arquivo compilado (provavelmente vêm de outro módulo). A documentação (agente B) cobre isso.

## 3. API interna do servidor (o que o editor usa)

**Observação (leitura direta)** [E4]: 125 controladores e 667 rotas extraídos dos decoradores compilados para `evidence/n8n-rest-interno.csv` (prefixo, método, caminho, escopo de permissão, licença exigida).

Recursos que importam para a paridade:

| Recurso | O que existe (resumo) |
| --- | --- |
| Fluxos | listar, criar, ler, atualizar, excluir, arquivar, ativar, desativar, sub-fluxos chamáveis, trava de edição colaborativa |
| Execuções | listar, ler, atualizar (anotação), repetir, parar, parar várias, excluir em lote, versões usadas por fluxo |
| Credenciais | listar, criar, ler, atualizar, excluir, testar, sondar, compartilhar, transferir, desconectar token OAuth, nome único sugerido, credenciais disponíveis para um fluxo |
| Projetos | listar, criar, ler, atualizar, excluir, membros e papéis, contagens, meus projetos, projeto pessoal |
| Pastas | dentro do projeto, CRUD e movimentação |
| Histórico do fluxo | versões e restauração |
| Variáveis, tags, chaves de API, usuários, papéis, MFA, SSO, LDAP, controle de versão por git, segredos externos, fluxo de revisão de mudanças, tabelas de dados, estatísticas por fluxo |  |

**Observação (leitura direta)** [E4]: cada rota sensível declara um escopo do tipo "recurso:ação" no nível do projeto (ex.: ler, atualizar, publicar, despublicar, excluir, mover). Publicar e despublicar fluxo são permissões separadas de editar.

**Inferência**: o modelo de permissão é por projeto com ações granulares. O VEXOR hoje tem papéis por organização (titular, editor). Vale evoluir para escopos por ação (editar x publicar x executar) antes de abrir para equipes.

## 4. API pública (OpenAPI)

**Observação (leitura direta)** [E5]: o pacote traz a especificação OpenAPI 3.0 da API pública, versão 1.1.1, servida em `/api/v1`, cópia em `evidence/n8n-public-api-openapi.yml`. Recursos: fluxos (inclui arquivar, desarquivar, transferir, publicar, despublicar, ativar, desativar, histórico, versões, tags), execuções (listar, ler, tags, parar, parar várias, repetir), credenciais (CRUD, transferir, testar, esquema por tipo), projetos e membros, pastas, tags, usuários e papéis, variáveis, auditoria, controle de versão, tabelas de dados, importação e exportação de pacotes, testes de avaliação, log streaming.

**Inferência**: a API pública é o mesmo domínio da interna com um contrato estável e versionado. O VEXOR pode oferecer `/api/v1` com chave de API por organização depois que fluxos, execuções e credenciais estiverem estáveis.

## 5. Catálogo de nós e credenciais

**Observação (leitura direta)** [E6]: `n8n-nodes-base` declara 438 nós e 392 tipos de credencial; 531 arquivos de nó, 110 deles gatilhos.

**Observação (leitura direta)** [E6]: há nós núcleo de lógica e dados (condição, roteamento por regras, juntar, filtrar, dividir em lotes, esperar, definir campos, transformar, código, data e hora, requisição HTTP, responder a webhook, executar outro fluxo, gatilho de erro, gatilho manual, agendamento, webhook, formulário, nota adesiva, parar com erro) e integrações de apps (inclui WhatsApp, e-mail, planilhas, bancos SQL, CRMs, Telegram, Twilio).

**Inferência**: a paridade útil para cobrança não é o número de integrações. É o núcleo genérico (HTTP, código, transformação, roteamento, laço, sub-fluxo, agendamento, resposta a webhook) que deixa o cliente montar o que falta sozinho.

## 6. Mapa de áreas do editor

**Observação (leitura direta)** [E7]: os mapas de origem do editor declaram 1.876 arquivos fora de dependências. Só os caminhos foram lidos, não o conteúdo. Áreas e tamanho relativo (arquivos):

| Área | Arquivos | Leitura |
| --- | --- | --- |
| Canvas | 59 | editor visual |
| Painel do nó: parâmetros | 54 | formulário de parâmetros |
| Painel do nó: dados de execução | 30 | Entrada e Saída (tabela, JSON, esquema) |
| Painel do nó: painel e configurações | 21 | estrutura do painel e aba de configurações |
| Criação de nós | 30 | busca e categorias |
| Editores compartilhados | 56 | código, expressões, SQL |
| Execuções e logs | 51 | lista, detalhe, painel de logs |
| Histórico e diff de fluxo | 30 | versões e comparação |
| Modelos | 38 | galeria |
| Projetos e colaboração | 32 | projetos, membros, edição simultânea |
| Credenciais | 24 | lista, modal, conexão rápida |
| Barra de comandos | 14 | paleta de comandos por teclado |
| Tags, pastas, tabelas de dados | 65 |  |
| IA (assistente, chat, avaliações, instância) | 221 | maior área isolada |
| Configurações (usuários, SSO, chaves, ambientes, nós da comunidade) | 75 |  |

**Inferência**: o painel do nó (cerca de 105 arquivos somados) é a peça mais pesada depois da IA. Também existe uma paleta de comandos e um painel de logs separado do painel do nó. Os dois são lacunas claras no VEXOR.

## 7. O que não foi feito

- **Captura em execução** (`capture_browser_scenario` com o n8n rodando): não feita. A máquina tem cerca de 2 GB livres com a produção local no ar. Comportamento fino (animações, ordem exata de foco, atalhos não documentados) fica **Desconhecido** e é coberto só pela documentação.
- **REA no editor e no servidor**: o editor recebeu análise estática limitada ao arquivo de dados de execução [E8]; o servidor e os demais arquivos do editor não foram analisados pelo REA. A captura em execução segue pendente. O limite semântico da análise impede concluir que todo o comportamento do arquivo foi reconstruído.
