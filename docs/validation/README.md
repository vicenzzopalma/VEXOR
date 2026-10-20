
# Evidências visuais

Capturas produzidas e abertas durante a validação da primeira entrega:

- `editor-desktop.png`: modelo SDR inicial, biblioteca, canvas e propriedades.
- `editor-desktop-properties.png` e `editor-mobile-properties.png`: condição personalizada na jornada E2E.
- `editor-desktop-simulation.png` e `editor-mobile-simulation.png`: caminho calculado, nós ignorados e inspeção do resultado da condição.
- `editor-notebook.png`: largura 1024 e biblioteca em gaveta.
- `templates-desktop.png`, `processos-desktop.png`, `execucoes-desktop.png`: listagens reais.
- `references/`: tentativas de inspeção dos URLs e metadata de status; 202/403 documentam limitações, não interfaces verificadas.

Comparação qualitativa com `TEMPLATES/`: a estrutura biblioteca/canvas/inspetor do logflow e a organização leve do Opero orientaram o editor. Foram adaptados cor, nomes e controles para o EIMAX. As referências não mostram estados mobile ou contas comerciais; esses estados foram desenhados e testados no aplicativo, não apresentados como cópias verificadas.

Após revisar capturas, corrigimos tamanho/contraste de texto, overflow nas descrições dos blocos, alças de reconexão excessivas, minimapa sem dimensões corretas e barra mobile cortada. A captura das listagens agora aguarda o carregamento para não provocar uma corrida de hidratação ao ocultar o cursor em inputs durante o screenshot.

Não há comparação automatizada pixel a pixel entre marcas/layouts diferentes. Playwright testa os controles reais e verifica ausência de overflow de página. A jornada mobile usa viewport 390×664 com DPR 3; a imagem exportada mede 1170×1992.
