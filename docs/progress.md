
# Progresso

## Ambiente — 20/10/2026
- Workspace inicialmente continha somente três JPGs em TEMPLATES. Sem código ou AGENTS.md anterior.
- Node 20.18.0, npm 10.8.2, Python 3.12, Git e Microsoft Edge disponíveis.
- Docker, pnpm, PostgreSQL e Redis não encontrados no PATH.
- Referências abertas individualmente; catálogo e adaptações documentados.

## Fase 0
Arquitetura, design system, especificação, roadmap e critérios criados antes da implementação.

## Fase 1 — concluída no escopo da primeira entrega

### Funcionalidades disponíveis
- Monorepo npm: Next 16, React Flow 12, NestJS modular, Prisma 6 e PostgreSQL 18 local. Contratos e interpretador compartilhados em packages.
- Editor com oito tipos de bloco, busca e categorias, adição por clique/toque e drag/drop desktop, posicionamento, alças visíveis e arestas curvas, caminhos Sim/Não, criação/remoção/reconexão de conexões, prevenção de ciclos e saídas ocupadas.
- Inspector contextual com nome, descrição e campos específicos; erros de configuração; validação semântica antes de publicar/simular.
- Seleção múltipla, duplicação, excluir, atalhos, undo/redo, auto-layout, pan/zoom e minimapa. Painéis recolhíveis e gavetas mobile.
- Autosave PostgreSQL com revisão otimista, carregamento, indicador acessível de estado, erro recuperável e exportação JSON em conflito. Navegação interna aguarda o salvamento de alterações.
- Rascunho independente de snapshots publicados; publicação serializada e idempotente para o mesmo conteúdo. Trigger SQL impede atualização de versões. Histórico permite inspecionar configurações preservadas.
- Interpretador único calcula condições e caminhos no servidor. Apenas os efeitos são substituídos por adapters de simulação. Falhas interrompem o caminho; etapas não executadas aparecem como ignoradas. Logs persistem com nome/e-mail do lead protegidos. Animação reproduz o resultado calculado, sem inventar envios externos.
- Organizações, memberships e permissões owner/editor/viewer; organization_id em workflows, versões e simulações; FKs compostas. Sessão opaca HttpOnly de desenvolvimento, com hash no banco. Empresa resolvida pelo servidor, sem escolha arbitrária via payload/header.
- Modelo SDR utilizável, listagens reais de projetos e simulações, consulta de entradas/saídas. Nenhum número comercial fictício.

### Comandos realmente executados

| Comando | Resultado da rodada final |
| --- | --- |
| npm install | Instalação concluída; package-lock mantido; 0 vulnerabilidades reportadas após atualização das dependências |
| npm run build | Passou: pacotes, Prisma, compilação Nest e build Next com 8 rotas |
| npm run lint | Passou sem warnings/erros de lint |
| npm run typecheck | Passou após organização do módulo de API |
| npm test | 23 testes unitários passaram |
| npm run test:integration | 12 testes de integração passaram contra API e PostgreSQL reais |
| npm run test:e2e | 3 passaram, 1 ignorado explicitamente: arraste nativo desktop no projeto mobile |
| npm audit --omit=dev | 0 vulnerabilidades reportadas; não equivale a auditoria de segurança completa |
| node scripts/capture-editor.mjs | Editor/listagens renderizados; screenshots e verificação sem overflow de página em desktop/notebook |
| npm run dev | Ativo ao final da entrega; migração aplicada e posteriormente conferida sem pendências |

### Cobertura comprovada
- Unitários: configuração/saída dos oito blocos, regras numéricas/textuais, ambos os ramos, adapter injetado, interrupção por falha, logs redigidos, rejeição de ciclos/grafo incompleto e ausência de execução de código do cliente.
- Integração: persistência e recarga, conflito de revisão e gravações concorrentes, publicação concorrente sem duplicação, independência do snapshot, trigger SQL de imutabilidade, erro semântico, execução do caminho falso e persistência de logs.
- Permissões/isolamento: sessão obrigatória; empresa A não lista/lê/edita/publica/simula/consulta versões ou logs da B; spoof de organization_id recusado/ignorado; viewer não escreve/simula; editor não publica; origem de escrita recusada.
- E2E desktop/mobile: criar por template, editar condição, salvar/recarregar, adicionar bloco, desfazer/refazer, zoom/enquadramento, publicar, consultar snapshot e simular com inspeção da saída da condição.
- E2E desktop adicional: drag/drop, mover bloco, conectar, reconectar e confirmar nova origem no servidor, remover conexão, seleção múltipla por Shift, Ctrl D, Ctrl Z/Ctrl Shift Z e auto-layout persistido.
- O processo local foi reiniciado durante o trabalho sem apagar o banco; projetos e versões anteriores continuaram acessíveis.

### Validação visual observada
Capturas abertas e inspecionadas em `docs/validation/`: desktop 1440×1000, notebook 1024×768 e mobile com viewport do preset iPhone 13 (390×664, DPR 3). Comparação qualitativa com as três imagens originais: biblioteca/canvas/inspetor preservados, hierarquia simples, paleta índigo e linguagem comercial.

Corrigidos após inspeção: texto inicialmente pequeno/baixo contraste, descrições ultrapassando cards, círculos excessivos nas conexões, dimensões do minimapa, indicador cortado no mobile e ciclo de atualização da seleção do React Flow. Os painéis menores têm rolagem própria. Não houve teste de equivalência pixel a pixel.

### Referências e limites de acesso
`docs/design-references.md` contém o inventário. CRM Edge abriu no Edge (200) e seu FAQ foi acionado. Dribbble forneceu conteúdo via web, mas retornou 202 vazio no browser; os shots foram analisados pelas imagens locais. Canva público foi consultado via web, mas o browser recebeu 403; editor/interações do Canva não foram observados. Capturas/gravações adicionais desses estados são necessárias para validar detalhes bloqueados.

### Incidentes de ambiente resolvidos
- Windows Administrador: iniciar postgres.exe diretamente falhou; pg_ctl resolveu sem instalar serviço/conta global. Pipes herdados causavam espera no launcher; corrigido com stdio ignorado e confirmação de readiness da API.
- A primeira configuração CommonJS de Vitest não suportou a versão atual; migrou para configuração ESM e os testes passaram.
- O disco C: ficou sem espaço durante a instalação do formatador. A revisão automática bloqueou a exclusão recursiva de caches. Foi usada compactação NTFS apenas em `.next`, preservando os arquivos; o espaço voltou a ficar disponível e build/testes foram concluídos. Código, referências e banco preservados.
- Node 20.18 executou os checks, mas uma dependência transitiva de lint avisa que prefere 20.19+/22.13+. O README recomenda Node 22.13+.

## Itens incompletos e deliberadamente fora desta entrega
Sem autenticação de produção/cadastro, CPF/titularidade, e-mail verificado, CAPTCHA, trial, cobrança, planos/negociador, dashboard comercial completo, landing final ou compartilhamento. Nenhuma integração real, entrada de webhook autenticado, Redis/BullMQ, retry durável, outbox ou recuperação de worker foi implementada/testada. O worker contém apenas a descrição da fase 2.

Publicar preserva snapshot; não ativa automação. O simulador não envia e-mail/notificação, não altera SDR/etiquetas reais e não espera tempo real. A autenticação real do webhook não é testada na simulação. Nenhum deploy, contratação ou serviço pago foi realizado.

## Acesso
Aplicação: http://localhost:3000/editor/starter-sdr. Biblioteca: /templates. Projetos: /processos. Logs: /execucoes. Instruções reproduzíveis em README.md; executar `npm ci` e `npm run dev` em uma nova instalação. Os testes criam processos próprios no banco local, identificados por nomes de validação/integração.
