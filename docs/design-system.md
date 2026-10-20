
# Design system EIMAX

## Direção visual
Área de trabalho clara e silenciosa, inspirada na composição do editor logflow e na biblioteca Opero. A automação ocupa o centro; a ferramenta deixa explícito o contexto de rascunho e simulação. Não usar template administrativo genérico.

## Tokens centralizados
Implementação em `apps/web/app/globals.css` com Tailwind CSS 4.

| Token | Valor | Uso |
| --- | --- | --- |
| primary | #7352d6 | Ações, seleção, conexões |
| primary-dark | #5e3dbb | Hover |
| primary-soft | #f1edfc | Seleção e superfícies de ajuda |
| ink | #252334 | Texto principal |
| muted | #878491 | Metadados |
| border | #eae8ef | Separadores |
| canvas | #f8f9fc | Superfície do fluxo |
| success / warning / danger | #2a9a79 / #c58a2c / #d45d74 | Estado, com texto ou ícone |

Inter local (fontsource), tamanhos 11–14 px na ferramenta, títulos 18–28 px; escala de espaçamento 4/8/12/16/24/32. Radius 8–14 px. Sombras de baixa opacidade. Transições de 180 ms, respeitando prefers-reduced-motion.

## Estrutura e proporções
Desktop: trilho de navegação 68 px, barra global 64 px, barra do processo 83 px, biblioteca 246 px, inspetor 302 px; canvas flexível com área útil mínima. Em notebooks, a biblioteca vira gaveta e o inspetor pode ser recolhido. Mobile: painéis em gavetas com botão de fechar, barra em duas linhas e canvas com pan touch e controles de zoom. Barra inferior 32 px.

## Componentes necessários
Button/IconButton acessíveis; tooltip por title + nome acessível; entradas e selects rotulados; toast com aria-live; dialog com foco e Escape; sidebar; cartão de bloco arrastável; workflow node com handles; aresta condicional; inspector; indicador de salvamento; histórico de versões; console de simulação; estados vazio/carregando/erro.

## Interações
Hover discreto; foco visível roxo; loading desabilita ações concorrentes; erros textuais. Mudanças de configuração permanecem editáveis mesmo inválidas, mas servidor impede publicação. Salvar rascunho aceita campos incompletos e preserva o trabalho. Simulação explicita ausência de envios e espera real. Funcionalidades futuras ficam desabilitadas com explicação.
