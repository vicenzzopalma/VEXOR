# Instalação real do serviço WhatsApp local

## Causa e correção

A tela de indisponibilidade era consequência de uma entrega incompleta: o VEXOR possuía adapter Evolution, mas o gateway não estava instalado/configurado. Habilitar somente uma flag não geraria QR. A instalação foi conduzida localmente, sem exigir que o usuário procurasse infraestrutura externa.

- Evolution API oficial 2.3.7 obtida de `https://github.com/evolution-foundation/evolution-api`, fixada no commit `fa09d37892cdbb1d65a250155d293d92230c5b30`.
- Dependências instaladas e build oficial (`tsc --noEmit && tsup`) aprovado. Banco separado `vexor_evolution`, com 57 migrações próprias e papel dedicado sem superusuário/BYPASSRLS. Banco comercial e suas 15 migrações preservados.
- Setup reproduzível por `npm run whatsapp:setup`; configuração privada gerada automaticamente sob `.local/`, ignorada pelo Git. A chave de criptografia já existente do VEXOR não foi alterada.
- `npm run dev` carrega essa configuração, supervisiona o processo e verifica prontidão autenticada antes de iniciar a API. Telemetria e integrações opcionais desabilitadas; envio externo do VEXOR permanece false, sessões/QR habilitados.
- Dois ajustes reproduzíveis na fonte fixada da instalação: listener em `127.0.0.1` e permissão para requisições servidor-servidor sem Origin, mantendo as origens de navegador restritas. O primeiro smoke de prontidão revelou a incompatibilidade CORS; após ajuste e rebuild, GET autenticado de instâncias retornou sucesso e zero instâncias iniciais.

## Fronteiras de segurança e persistência

HTTP é aceito apenas para o endereço numérico e porta exatos definidos no ambiente com opt-in `EVOLUTION_LOCAL_GATEWAY_ENABLED=true`. A exceção de origem é exclusiva de Evolution. DNS/TLS/allowlist públicos permanecem protegidos; localhost, outros IPs/portas e redirects são rejeitados. Chaves administrativas não são expostas no frontend.

Redis não é necessário para essa instalação de um processo. Credenciais de sessão usam PostgreSQL; a Evolution também mantém chaves Signal em `.local/evolution-api/instances` quando Redis está desabilitado. Preservar a pasta privada e o banco em conjunto; não alegar que todas as chaves do gateway residem exclusivamente no banco. Não copiar QR, logs privados ou segredos para evidências públicas/versionadas.

## Divisão de trabalho e verificação

Segundo terminal Codex existente investigou a viabilidade e implementou `packages/connectors/src/index.ts` e `tests/unit/local-evolution-transport.test.ts`. Coordenador instalou gateway, configurou banco, escreveu setup/supervisão e validou o ambiente.

- 21 testes focais de transporte aprovados, incluindo HTTP real em loopback, flag on/off, portas, origens indevidas, redirects, teto de resposta e sessão permitida sem habilitar envio.
- `npm run build`, `npm run typecheck`, `npm run lint` e `npm test`: aprovados; 102 unitários.
- `npm run test:integration`: 94 aprovados com `WHATSAPP_LOCAL_AUTOSTART=false`, sessões externas desabilitadas e worker automático desligado.
- `npm run test:e2e -- --output=.local/whatsapp-e2e`: 40 aprovados, um arraste desktop ignorado no celular e uma falha de espera de salvamento no arraste desktop, executado durante compilação do gateway. Reexecução focal do arraste aprovada em 12,8 s, sem alterar o teste. Os 41 casos foram aprovados em execuções complementares.
- Corrigido o acesso ao QR durante CONNECTING/RECONNECTING: Evolution pode informar connecting enquanto mantém um QR disponível. A ação Ver QR Code continua acessível após reload; dois E2E de contrato adicionais/reexecutados passaram em desktop/celular, lint aprovado após a correção.
- Ativação real validada: gateway autenticado em `127.0.0.1:8088`, resposta real de conexão da conta `x` com estado WAITING_FOR_QR e imagem PNG fornecida pela Evolution. Uma janela visível do Edge foi aberta com Playwright; imagem real carregada e visível verificada por `naturalWidth > 0`, sem salvar nem registrar o conteúdo do QR. Nenhuma mensagem foi enviada e nenhum telefone é considerado conectado sem leitura e confirmação real da sessão.

## Operação

`WHATSAPP_LOCAL_AUTOSTART=false` permite repetir suites de contrato sem acessar o gateway real. Integração e E2E rodam serialmente no banco de desenvolvimento atual. Remover esse override e reiniciar `npm run dev` para ativar o serviço local. Esta instalação local não representa deploy público nem operação distribuída homologada.
