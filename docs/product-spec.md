
# Especificação do produto

EIMAX permite que empresários criem processos comerciais sem código, usando oito blocos: lead recebido, condição, e-mail, SDR, espera, etiqueta, notificação e webhook autenticado.

## Primeira entrega implementada
Editor com modelo SDR, biblioteca pesquisável e categorizada, drag/drop e adição por clique, zoom/pan/minimap, criação/remoção/reconexão de arestas condicionais, seleção múltipla, excluir, duplicar, undo/redo, auto-layout, inspector, autosave no PostgreSQL, simulação e snapshots publicados. Listagens auxiliares de processos, modelos e simulações dão acesso ao trabalho persistido. Sem métricas inventadas.

Organizações e memberships são resolvidas no servidor por sessões locais opacas; owner publica, editor edita/simula e viewer consulta. Isolamento por organização é aplicado e testado nesta fase. Isso não é cadastro/login de produção. No mobile, a biblioteca e as propriedades abrem em gavetas; arraste nativo de biblioteca é validado no desktop, com adição por toque no mobile.

Publicar nesta fase significa congelar uma versão consultável; não ativa envio externo. O botão informa essa distinção. Compartilhamento está indisponível até haver permissões. Webhook tem configuração validada, mas recepção autenticada real depende da fase 2.

## Jornada alvo do MVP
Cadastro → CPF/e-mail/CAPTCHA → empresa/segmento → trial servidor por sete dias → template SDR → personalização → condição → simulação → publicação → evento real → logs → self-service ou implantação assistida.

## Comercial
Self-service mensal e implantação assistida coexistem; requests, assinaturas e histórico serão persistidos. Trial com início/fim e limite de execuções configurável; expiração suspende novas ações e preserva projetos por prazo divulgado. Gateways via adapter, sem armazenar cartão completo.

## Regras do editor
Um único gatilho por fluxo, sem ciclos, sem nós isolados, todos os nós alcançáveis, uma saída por ação e duas saídas identificadas verdadeiro/falso na condição. Trigger não recebe conexões. Limite inicial de 100 nós. Configuração de condição usa campos permitidos de lead e comparação tipada. Sem expressões JavaScript.
