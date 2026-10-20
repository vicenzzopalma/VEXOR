
# Referências de design — inventário e análise

Inspeção em 20/10/2026. Foram examinados os URLs da conversa, os documentos locais e as três imagens de TEMPLATES. Não se copiaram códigos, marcas, textos comerciais nem ilustrações dos produtos.

## Fontes de interface

### https://dribbble.com/shots/21100197-Workflow-builder-Support-journey-builder-Low-code-automation
Página e descrição acessíveis pela ferramenta web; navegador Microsoft Edge automatizado retornou HTTP 202, corpo vazio. O shot correspondente em TEMPLATES foi aberto: barra roxa, trilho de ícones, biblioteca com busca/categorias, canvas amplo, blocos com cor semântica e inspetor fixo. Aproveitar essa distribuição espacial, seleção destacada e edição contextual. O shot não é uma aplicação executável: drag/drop, zoom, transições e menus contextuais não puderam ser testados. Não são tratados como observações de comportamento real.

### https://crmedge.net/
HTTP 200 no navegador; screenshot da landing e interação com botão do FAQ registradas. Menu superior simples, CTA visível e imagem do dashboard; a imagem local mostra sidebar lavanda, filtros, métricas pastel, gráficos e tabela. Aproveitar hierarquia clara, bordas discretas e estados semânticos suaves. O dashboard é uma imagem promocional, não um painel interativo acessível; não foram testados seus filtros ou automações. Não reutilizar suas métricas.

### https://dribbble.com/shots/27127142-AI-Automation-Workflow-Dashboard-Templates-Page
Página/descrição acessíveis via web; Edge retornou HTTP 202 vazio. Imagem local inspecionada: sidebar branca, breadcrumb, filtros compactos, grande busca e miniaturas de grafos nos modelos. Aproveitar busca direta, previews de processos e navegação discreta. Não houve acesso a uma aplicação Opero funcional; animações/filtros do conceito não foram presumidos.

### https://www.canva.com/ e https://www.canva.com/online-whiteboard/
Conteúdo público acessível pela ferramenta web, incluindo organização por ferramentas e modelos. Edge automatizado recebeu HTTP 403 com página de bloqueio; não foi possível abrir o editor nem testar suas interações. A simplicidade pedida pelo usuário orienta nossa proposta: arrastar ou clicar para adicionar, propriedades em linguagem comercial, undo/redo visível, salvamento automático e ajuda curta. São decisões do EIMAX, não alegações de comportamentos observados em uma sessão do Canva.

Para verificar estados específicos inacessíveis no Canva/Dribbble, são necessárias capturas adicionais ou uma gravação fornecida pelo usuário. As três capturas existentes bastam para continuar o refinamento estrutural desta entrega, sem inventar detalhes bloqueados.

## URLs técnicos presentes no projeto/conversa
- https://docs.temporal.io/ — acessado; documentação arquitetural, não referência visual do produto. Temporal não será integrado nesta fase.
- https://support.n8n.io/ — acessado; help center, não demonstração de editor. Não há integração com n8n.
- https://reactflow.dev/examples/edges/reconnect-edge — acessado para contrato de reconexão do React Flow.
- https://nextjs.org/docs/app/getting-started/installation — documentação da estrutura Next.
- https://www.prisma.io/docs/orm/v6/prisma-schema/overview/generators — documentação de persistência.
- Os URLs google.com/s2/favicons da conversa são ícones de links, sem referência de UI independente.
- Parâmetros utm_source foram removidos somente para consulta; os destinos são os mesmos.

## Evidências e critérios de comparação
`docs/validation/references/inspection.json` registra os resultados do browser e URLs; screenshots no mesmo diretório. As telas locais serão comparadas por composição, área do canvas, respiro, alinhamento, hierarquia e acessibilidade. Sem alegar equivalência pixel a pixel entre produtos distintos. O teste dos controles reais será feito no EIMAX.
