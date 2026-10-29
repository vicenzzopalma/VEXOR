# Operação local e integrações

## Pareamento gerenciado de celulares

### Instalação local incluída no ambiente de desenvolvimento

**Estado em 26/10/2026: suspensa por incidente de conta em análise após pareamento.** A quarentena privada impede autostart e o instalador recusa reativar. Preservar sessões/evidências e não gerar novos QRs ou reconectar a conta afetada durante a análise. A descrição de instalação abaixo é histórica/operacional, não uma orientação para retomar. [Pesquisa e revisão do método](whatsapp-ban-research-2026-10-26.md).

Execute `npm run whatsapp:setup` uma vez e depois `npm run dev`. O setup obtém a Evolution API oficial 2.3.7, fixa o commit `fa09d37892cdbb1d65a250155d293d92230c5b30`, instala dependências, gera segredos privados em `.local/whatsapp-service.env` e provisiona banco/papel próprios `vexor_evolution` no PostgreSQL local. O papel não possui superusuário, criação de bancos/papéis ou BYPASSRLS. Os dados comerciais do VEXOR permanecem no banco existente. Não instalar esse runtime sobre outro checkout ou banco produtivo.

O início normal supervisiona o gateway junto com API/web/worker. O gateway escuta somente em `127.0.0.1:8088`; um ajuste reproduzível na fonte fixa o bind e permite requisições entre servidores sem cabeçalho Origin, preservando a restrição das origens do navegador. Telemetria, integrações opcionais e despacho externo do VEXOR ficam desativados. A chave de criptografia já existente do VEXOR é preservada. O usuário continua cadastrando apenas o nome do celular e solicitando o QR.

O transporte só aceita HTTP local quando `EVOLUTION_LOCAL_GATEWAY_ENABLED=true` e o destino coincide com o endereço numérico e a porta explicitamente configurados em `EVOLUTION_GATEWAY_URL`. A exceção de origem é exclusiva do provider Evolution. Não aceita localhost, outros IPs privados ou redirecionamentos. Gateways públicos continuam sujeitos a HTTPS, allowlist e validação/pinning DNS.

Sem Redis, a Evolution usa cache local: credenciais de sessão ficam no PostgreSQL próprio e chaves Signal também usam a pasta privada `.local/evolution-api/instances`. Preserve ambos e o ambiente privado ao reiniciar; não inclua esses arquivos, logs ou imagens QR em commits. Essa instalação de um processo local não equivale a uma implantação distribuída de produção.

Para executar as suites de contrato sem acessar o gateway real, inicie o ambiente com `WHATSAPP_LOCAL_AUTOSTART=false`, `WHATSAPP_SESSION_ENABLED=false`, `WHATSAPP_EXTERNAL_ENABLED=false` e `RUN_WORKER=false`; rode integração e navegador serialmente. Ao voltar ao uso normal, remova o override `WHATSAPP_LOCAL_AUTOSTART=false` e reinicie `npm run dev`.

O gateway Evolution é configuração da instalação, feita uma única vez pelo operador do servidor. Cada empresa cadastra apenas o nome do celular e solicita o QR; os usuários não recebem nem preenchem URL, instância, chave da API ou segredo de webhook.

Configuração central em ambiente (não commitar valores reais):

- `EVOLUTION_GATEWAY_URL`: origem HTTPS do gateway, sem caminhos, query ou credenciais na URL. Essa origem exata é autorizada pelo servidor; as proteções de transporte/DNS continuam valendo.
- `EVOLUTION_API_KEY`: chave de administração do gateway.
- `EVOLUTION_WEBHOOK_SECRET`: semente secreta com pelo menos 24 caracteres. Cada conta recebe segredo derivado próprio.
- `CONNECTOR_ENCRYPTION_KEY`: chave hexadecimal estável de 32 bytes para as credenciais persistidas.
- `WHATSAPP_SESSION_ENABLED=true`: permite status, criação de instância, QR e encerramento de sessão. Não habilita envio de mensagens. `WHATSAPP_EXTERNAL_ENABLED` continua false até autorização separada para entregas externas.

`POST /integrations/whatsapp/managed` aceita somente `name`; organização vem da sessão. O identificador da instância é derivado pelo servidor da organização e do ID da conexão. Ao conectar, o backend materializa as credenciais cifradas e cria a instância se o gateway responder que ela não existe. Instância já criada é reutilizada; conflito de criação é conciliado por nova consulta de status. O endpoint legado não permite trocar os parâmetros de uma conta gerenciada, evitando reatribuição para instância de outra organização. Contas manuais existentes são preservadas; alterações normais de nome não mudam credenciais ou sessão.

Sem infraestrutura central habilitada, o usuário vê “Serviço de conexão WhatsApp indisponível”. O botão de QR não abre mais o formulário técnico e nenhum QR ilustrativo é gerado. Essa mensagem representa infraestrutura pendente, não pareamento concluído. A instalação atual ainda não possui um gateway autorizado/configurado; nenhum telefone real foi pareado nesta alteração. A recepção externa também exige a configuração operacional do webhook autenticado no gateway; esta mudança não afirma homologação de mensagens ou recibos.

## Execução

`npm run dev` mantém PostgreSQL local, API, Next.js e worker. A API devolve o identificador e o estado `QUEUED`; consulte `GET /executions/:id` para a conclusão e as etapas. Somente snapshots publicados podem executar. Republicações não alteram jobs já recebidos. Eventos repetidos usam a chave única `(organizationId, workflowId, eventKey)`.

O worker também pode ser compilado e iniciado pelo workspace `@eimax/worker`, com `DATABASE_URL` no ambiente. SIGINT/SIGTERM aguardam a operação corrente e desconectam o Prisma. Em encerramento forçado, o PostgreSQL desfaz a transação e o lease permite recuperação. Lease padrão: 30 segundos. Processamento local: transação de até 20 segundos. Até três reservas, com backoff de transações transitórias. O resultado comercial de uma ação externa é consultado na notificação; a conclusão do workflow pode significar que a mensagem foi colocada na outbox.

O bloco SDR exige seleção explícita de membership elegível da organização. A string legada de equipe continua compatível com o rascunho e com a simulação, mas não escolhe automaticamente um usuário em produção. O inspetor permite selecionar o responsável por nome. A gestão de leads permite reatribuição, status, etiquetas e consentimento do canal.

## Webhooks de workflow

`POST /webhooks/:workflowId` usa o gatilho do snapshot publicado. `credentialRef` é apenas um identificador. Configure `WEBHOOK_CREDENTIALS_JSON` no ambiente como um mapa de `organizationId:credentialRef` para segredo. O header `x-eimax-webhook-secret` deve conter o segredo correspondente. Use `x-eimax-event-key` para o identificador estável do evento, até 200 caracteres. Sem ele, a API calcula o hash do corpo.

No ambiente local, `loadDevelopmentSessions()` gera um segredo privado em `.local/development-sessions.json` e fornece a referência `org-local:ingress`. Esse arquivo não deve ser commitado ou usado em produção. A referência jamais é aceita como segredo. Configuração inválida ou ausente falha fechada.

## WhatsApp — configuração necessária

Não existe gateway/conta autorizada nesta rodada. Não houve pareamento nem envio externo. As conexões podem ser cadastradas sem credenciais e permanecem desconectadas.

Para uma futura infraestrutura autorizada:

- `CONNECTOR_ENCRYPTION_KEY`: chave hexadecimal de 32 bytes, estável e mantida no ambiente. Não há fallback para conectores. A troca da chave exige estratégia de rotação das credenciais cifradas.
- `WHATSAPP_EXTERNAL_ENABLED`: permanece ausente/false neste ambiente. `true` habilita operações de rede e só deve ser usado com infraestrutura e autorização para isso.
- `WHATSAPP_GATEWAY_ORIGINS`: origens HTTPS exatas autorizadas para Evolution. URLs com credenciais, redirecionamentos e destinos DNS privados não são aceitos. O transporte suporta IPv4 público; IPv6 e gateway privado não estão habilitados.
- Meta: número, versão Graph habilitada no aplicativo, token, App Secret e verify token. WABA é necessário para consultar templates aprovados. A versão não é presumida pelo código.
- Evolution: instância já provisionada, origem e API key. Configure o webhook com header `x-whatsapp-secret`, exclusivo da conexão, com pelo menos 24 caracteres. A versão do gateway deve ser validada na homologação.

Credenciais ficam cifradas no banco e não são devolvidas pela API. O caminho de webhook é `/webhooks/whatsapp/:connectionId`. Meta valida HMAC SHA-256 sobre os bytes originais, além do handshake. Evolution valida o segredo e a instância. QR é aceito apenas da resposta do gateway, não é persistido e é ocultado na interface após 30 segundos; a conta só fica conectada por confirmação do provedor.

O destinatário precisa de telefone e consentimento explícito. Texto livre pela Meta exige mensagem recebida nas últimas 24 horas; fora dessa janela, somente template confirmado como aprovado. Nesta fatia são suportados templates sem parâmetros, mídia ou botões. O catálogo de templates é consultado ao atualizar/conectar a conta. Não existe Embedded Signup/OAuth empresarial completo nesta entrega.

O gatilho de mensagem recebida gera jobs e reutiliza um lead por contato/conexão/workflow. A nova conversa nativa está no catálogo, mas a publicação fica bloqueada, pois nenhum adaptador atual confirma esse evento. Contatos recebidos sem dados comerciais exibem identificação genérica e não recebem consentimento automaticamente. Não há atribuição ao primeiro membro da organização.

## Descadastro central (SAIR) para o Esfera

Configure uma vez por instalação, em ambiente, o mapa organização → empresa do Esfera:

```
ESFERA_OPTOUT_LINKS_JSON={"<organizationId>":{"baseUrl":"http://127.0.0.1:8080","companyId":1,"token":"<token de empresa>"}}
```

- `baseUrl`: `https://` para qualquer host, ou `http://127.0.0.1:<porta>` quando o Esfera roda na mesma máquina (servidor de check-in do Esfera, porta padrão 8080). Sem credenciais na URL, sem redirecionamentos.
- `companyId`: `CompanyId` da empresa no Esfera. O token precisa pertencer a essa empresa (ou ser o token master); o Esfera recusa com 403 qualquer combinação diferente.
- `token`: gerado no Esfera pelo master (`generate_company_token`), guardado só aqui. Nunca aparece em logs, respostas da API ou no corpo enviado.

Sem mapeamento, os pedidos ficam `PENDING` com `ESFERA_LINK_NOT_CONFIGURED` e são entregues assim que a variável for definida e o worker reiniciado. O worker precisa estar ligado (`RUN_WORKER` diferente de `false`) para entregar. Pedidos ambíguos aguardam em `REVIEW` e aparecem em `GET /opt-outs?status=REVIEW`. Texto neutro para as mensagens enviadas: "Para deixar de receber mensagens por este canal, responda SAIR." O SAIR nunca deve ser associado a reconhecimento de dívida ou renúncia a contestação/recurso. A homologação com WhatsApp real continua suspensa pela quarentena: os testes usam o provedor MOCK e um servidor HTTP local no lugar do Esfera.

## Semântica da outbox

`PENDING` sem ID aguarda envio. `PROCESSING` está reservado. `PENDING` com ID foi aceito pelo provedor e aguarda recibo, sem novo envio. `SENT`, `DELIVERED` e `READ` dependem da confirmação correspondente. Falhas têm `errorCode`. Avisos internos usam `AVAILABLE`. Recibos são persistidos, deduplicados por conexão/evento/tipo e reconciliados para tratar corrida com a resposta HTTP.

Uma interrupção entre aceitação do provedor e gravação do ID é um resultado incerto. Reservas antigas passam a `FAILED` com necessidade de reconciliação; não há retry automático desses envios. Exactly-once externo não é prometido sem suporte do provedor. Reenviar o mesmo webhook não recria a execução nem suas notificações.

## Verificação

Integração e E2E devem rodar em sequência no ambiente atual: ambos usam o banco local e seus helpers podem consumir as mesmas filas. Outputs Playwright paralelos também precisam de diretórios separados. O isolamento em bancos efêmeros próprios ainda está pendente; o uso de fixtures não substitui esse isolamento.

O build deve rodar com API/worker parados no Windows: o processo Prisma ativo bloqueia a substituição de sua DLL (`EPERM`). Depois, inicie API/PostgreSQL locais. Para a suíte de integração, use `RUN_WORKER=false`, pois ela inicia dois processos reais e controla reservas. Configure uma chave de criptografia de teste no ambiente **antes** de iniciar a API para os contratos de credenciais/webhooks. Não são necessárias credenciais reais nem gateway.

Execute `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration` e `npm run test:e2e`. As suites usam fixtures identificadas no nome; recibos sintéticos não são prova de entrega externa. PostgreSQL precisa permitir criar/remover triggers e sequences temporários dos testes de interrupção e erro transitório. O teste encerra um processo real durante o runner e verifica recuperação, histórico de tentativas e efeitos únicos.

Ainda não há garantia de produção/SaaS público: a API permanece deliberadamente local, esperas duráveis e autenticação pública exigem trabalho adicional, e a homologação de provedores permanece pendente.

## Concorrência de leads e evolução SaaS

A partir da migração `202610260015_lead_revision`, o PostgreSQL incrementa `Lead.revision` a cada atualização, inclusive worker e SQL direto. Leia a revisão em `GET /leads/:id` e envie `expectedRevision` no PATCH; o campo é obrigatório. Duas edições com a mesma revisão não podem se confirmar: a segunda recebe 409 e deve recarregar os dados antes de reaplicar sua intenção. Não repetir automaticamente com uma revisão nova. A organização continua sendo resolvida pela sessão, nunca pelo corpo da requisição.

O ambiente local usa papel com superusuário/BYPASSRLS e não comprova isolamento por políticas PostgreSQL, escala, pool ou recuperação de backup. Auditoria e critérios faseados: [database-saas-audit.md](database-saas-audit.md). Antes de produção, separar papéis de migração/runtime e bloquear sessões de desenvolvimento fora do ambiente local.

## Provisionamento de TI na VPS

Instância isolada do VEXOR na VPS Hostinger (`187.77.243.224`, Ubuntu 24.04), que já hospeda outras aplicações (PM2 `veritas-*`, `agenda-realess`, `crm-celulares`, `esfera-hub`, nginx). Nada disso é tocado: a instância usa usuário, pasta, unit systemd e portas próprias, e não usa PM2 nem nginx.

- Usuário de sistema `vexor` (sem shell, home `/opt/vexor`). Código em `/opt/vexor/app`; banco embedded-postgres em `/opt/vexor/app/.local/postgres` (o Postgres recusa rodar como root, por isso o usuário dedicado).
- Unit `/etc/systemd/system/vexor.service`: `User=vexor`, `ExecStart=/usr/bin/node scripts/dev.mjs`, `Restart=on-failure`, `MemoryMax=3G`, `CPUQuota=150%`, `Nice=5`, `ProtectSystem=full`, `ProtectHome=true`, `ReadWritePaths=/opt/vexor`.
- Portas, todas só em `127.0.0.1`: web **3100**, API **4100**, PostgreSQL **55442**. A API é deliberadamente local (`DEVELOPMENT_WORKSPACE=true`, sem autenticação pública), então **não** expor por nginx.
- Acesso pelo túnel SSH: `ssh -i ~/.ssh/veritas_vps -L 3100:127.0.0.1:3100 root@187.77.243.224` e abrir <http://localhost:3100/provisionamento>. `WEB_ORIGIN=http://localhost:3100` precisa coincidir com a origem usada no navegador.
- `.env` em `/opt/vexor/app/.env` (modo 600, dono `vexor`; nunca commitar). Além de `DATABASE_URL`, `POSTGRES_PORT`, `API_PORT`, `API_ORIGIN`, `WEB_PORT`, `WEB_ORIGIN` e `DEVELOPMENT_WORKSPACE`, a instância desliga WhatsApp, e-mail externo e confirmação de descadastro, e define (somente nomes; valores ficam no servidor):
  - `TI_PROVISIONING_ENABLED` (`true` para o worker executar solicitações aprovadas)
  - `TI_CPANEL_ADV_HOST`, `TI_CPANEL_ADV_USER`, `TI_CPANEL_ADV_PASS` (`realess.adv.br`)
  - `TI_CPANEL_COM_HOST`, `TI_CPANEL_COM_USER`, `TI_CPANEL_COM_PASS` (`realess.com.br`)
  - `TI_TARIFANDO_BASE_URL`, `TI_TARIFANDO_USUARIO`, `TI_TARIFANDO_TOKEN`
  - opcional `TI_EMAIL_PASSWORD_TEMPLATE` (ex.: com `{Setor3}`); sem ela a senha de e-mail nova é aleatória
- Logs e estado: `journalctl -u vexor -f`, `systemctl status vexor`, `curl -s http://127.0.0.1:4100/health`.

### Atualizar

1. No worktree: `git ls-files -co --exclude-standard > files.txt` e `tar -czf vexor.tgz -T files.txt` (só arquivos versionados e novos; sem `node_modules`, `.env`, `.local`, `.next`).
2. Copiar para `/opt/vexor/`, `systemctl stop vexor`, extrair em `/opt/vexor/app` e `chown -R vexor:vexor /opt/vexor`.
3. Dependências como `vexor`: `sudo -u vexor -H env HOME=/opt/vexor npx -y npm@11.13.0 ci --no-audit --no-fund`. O npm 10 da VPS rejeita o `package-lock.json` gerado com npm 11 (esbuild "missing from lock file"); o npm 11 é usado só nessa instalação, sem trocar o npm global.
4. `systemctl start vexor`. O `dev.mjs` gera o Prisma Client, compila os pacotes e aplica as migrações pendentes antes de subir API, worker e web.

### Remover sem afetar o resto

`systemctl disable --now vexor`, `rm /etc/systemd/system/vexor.service`, `systemctl daemon-reload`, `userdel vexor` e `rm -rf /opt/vexor`. Isso apaga também o banco e as senhas geradas guardadas nele; exporte o que precisar antes.
