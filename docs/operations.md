# Operação local e integrações

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

## Semântica da outbox

`PENDING` sem ID aguarda envio. `PROCESSING` está reservado. `PENDING` com ID foi aceito pelo provedor e aguarda recibo, sem novo envio. `SENT`, `DELIVERED` e `READ` dependem da confirmação correspondente. Falhas têm `errorCode`. Avisos internos usam `AVAILABLE`. Recibos são persistidos, deduplicados por conexão/evento/tipo e reconciliados para tratar corrida com a resposta HTTP.

Uma interrupção entre aceitação do provedor e gravação do ID é um resultado incerto. Reservas antigas passam a `FAILED` com necessidade de reconciliação; não há retry automático desses envios. Exactly-once externo não é prometido sem suporte do provedor. Reenviar o mesmo webhook não recria a execução nem suas notificações.

## Verificação

O build deve rodar com API/worker parados no Windows: o processo Prisma ativo bloqueia a substituição de sua DLL (`EPERM`). Depois, inicie API/PostgreSQL locais. Para a suíte de integração, use `RUN_WORKER=false`, pois ela inicia dois processos reais e controla reservas. Configure uma chave de criptografia de teste no ambiente **antes** de iniciar a API para os contratos de credenciais/webhooks. Não são necessárias credenciais reais nem gateway.

Execute `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration` e `npm run test:e2e`. As suites usam fixtures identificadas no nome; recibos sintéticos não são prova de entrega externa. PostgreSQL precisa permitir criar/remover triggers e sequences temporários dos testes de interrupção e erro transitório. O teste encerra um processo real durante o runner e verifica recuperação, histórico de tentativas e efeitos únicos.

Ainda não há garantia de produção/SaaS público: a API permanece deliberadamente local, esperas duráveis e autenticação pública exigem trabalho adicional, e a homologação de provedores permanece pendente.
