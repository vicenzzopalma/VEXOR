# Incidente WhatsApp — auditoria local sanitizada

Data: 26/10/2026. Escopo: leitura de fontes instaladas, metadados/logs locais e consultas PostgreSQL autorizadas em transações `READ ONLY`. Nenhum gateway, socket WhatsApp, QR, login, reconexão, teste de integração ou chamada externa foi iniciado nesta auditoria. Somente os dois artefatos deste relatório foram escritos; sessões, credenciais e versões foram preservadas.

## Conclusão e estado reportado

O relato inicial foi de bloqueio imediato depois de escanear o QR; a atualização transmitida pelo coordenador esclarece **conta EM ANÁLISE**. Não há evidência disponível que confirme banimento permanente ou identifique a causa da análise. Não é possível atribuir causalidade ao fingerprint, versão, persistência, reconexão ou envio de mensagens a partir dos dados coletados.

A quarentena persistente existe. O coordenador informou que parou o gateway. A fonte atual de `loadLocalWhatsAppConfiguration` verifica a quarentena antes de carregar a configuração e força os dois gates WhatsApp para false. Isso é proteção do caminho de inicialização do VEXOR; não é revogação de sessão no provedor nem bloqueio de uma execução manual independente do gateway. Não remover a quarentena nem iniciar o gateway para investigar.

Evidência estruturada: [whatsapp-incident-sanitized.json](validation/whatsapp-incident-sanitized.json). O artefato omite nomes/IDs de contas, instâncias, números, JIDs, endereços de banco, credenciais, conteúdo de mensagens, QR e códigos de pareamento.

## Evidência observada e cronologia possível

- Pacotes instalados: Evolution **2.3.7**, Baileys **7.0.0-rc.9**, lidos dos manifests locais sem executar os pacotes.
- `.local/whatsapp-service.log`: **zero bytes**; nenhum arquivo adicional de runtime foi encontrado no diretório convencional de logs do gateway. Não há eventos close/open/registered/status extraíveis nesses arquivos. Contagens zero representam ausência de evidência no material, não ausência de eventos reais. Logs de build e PostgreSQL não foram usados como cronologia de sessão WhatsApp.
- A quarentena estava presente na coleta. Seu horário de modificação é metadado de arquivo, não horário do scan nem da resposta do provedor.
- Snapshot comercial da conta investigada: `CONNECTING`, `enabled=true`, `lastError=null`, zero `Notification`, zero notificações de canal WhatsApp e zero `WhatsAppEvent` vinculados à conta. O campo enabled persistido não demonstra que o processo esteja ativo ou que os gates ambientais estejam liberados.
- Snapshot do gateway: instância `connecting`, motivo e horário de desconexão nulos, zero `Message` e um registro `Session` relacionado. Um registro de sessão pode existir desde a inicialização das credenciais; **não prova registered=true nem login concluído**. Conteúdo das credenciais não foi consultado. O inventário encontrou zero arquivos JSON sob o diretório privado de instâncias, sem publicar nomes ou conteúdo; isso também não prova corrupção ou inexistência de credenciais no banco.

Os horários abaixo foram obtidos como **texto armazenado em colunas sem fuso**. Não foram convertidos pelo driver para Date/UTC, pois isso acrescentaria uma interpretação de fuso não demonstrada. São horários de registro, não histórico completo de eventos:

| Registro | Horário armazenado | Interpretação limitada |
| --- | --- | --- |
| Instância gateway criada | 2026-10-26 15:52:00.124 | Criação persistida da instância |
| Instância gateway atualizada | 2026-10-26 16:00:33.745 | Última atualização; estado connecting |
| Conta VEXOR conferida | 2026-10-26 16:00:47.193 | checkedAt persistido |
| Conta VEXOR atualizada | 2026-10-26 16:00:47.195 | Última atualização; estado CONNECTING |

Não existe horário exato do scan, primeira restrição no telefone, primeiro close ou primeiro registered/open demonstrável nesta coleta. Os arquivos não fornecem a mensagem original de análise nem o motivo interno do provedor.

## Comportamento comprovado pela fonte, sem afirmar execução no incidente

### Reconexão e inicialização

Em `src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts:426`, `connectionUpdate` reconecta em close para qualquer código fora de `loggedOut`, `forbidden`, 402 e 406. A função chama `connectToWhatsapp` diretamente nesse ramo; não há backoff ou limite explícito nesse trecho. Bibliotecas e timers internos podem limitar a frequência, portanto a fonte sozinha não determina a quantidade de tentativas realizadas.

O enum instalado mapeia 401 a loggedOut, 403 a forbidden, 428 a connectionClosed, 408 a connectionLost, 440 a connectionReplaced, 500 a badSession e 515 a restartRequired. 405 não possui entrada específica nesse enum. **401, 405 ou 428 isolados não comprovam banimento**. Nenhum desses códigos foi observado no log vazio analisado. Um 428 ou 405 passaria pelo ramo upstream de reconexão caso fosse recebido nesse contexto; 401 está na lista de exclusão.

`src/api/services/monitor.service.ts:296` também reconecta automaticamente instâncias cujo estado armazenado seja open ou connecting no startup. Reiniciar o processo pode, portanto, iniciar contato sem clicar novamente na interface. A quarentena deve permanecer efetiva também contra reinstalação ou execução independente.

### Identidade do cliente e consulta de versão

O lançador VEXOR define `CONFIG_SESSION_PHONE_CLIENT=VEXOR` e `CONFIG_SESSION_PHONE_NAME=Chrome`. No fluxo de QR, a Evolution monta a descrição do browser com esse par e `os.release()`. O Baileys usa esses campos em dados do cliente/dispositivo; o rótulo Chrome não transforma o processo em um navegador Chrome oficial. Uma identidade incomum é hipótese a revisar, **não causa demonstrada de análise**.

Cada `createClient` chama `fetchLatestWaWebVersion`. A implementação instalada consulta o service worker público do WhatsApp Web para extrair a revisão. Se falhar, usa `fetchLatestBaileysVersion`, que tenta consultar o arquivo Defaults do repositório upstream e finalmente possui fallback embutido. Logo, fixar o pacote em rc.9 não fixa a revisão de protocolo anunciada em todas as tentativas. Não foi feita nenhuma consulta de versão durante a auditoria nem foi possível identificar a revisão efetivamente usada no incidente.

### Tráfego implícito de sessão, presença e sincronização

`fireInitQueries=true` está explícito na configuração do socket. `markOnlineOnConnect` e `syncFullHistory` vêm de configurações da instância; os defaults do schema são false, mas os valores reais dessa tabela não foram consultados. Defaults e ambiente pretendido não substituem observação do processo histórico.

O código instalado em `node_modules/baileys/lib/Socket/chats.js:884` executa consultas iniciais ao abrir conexão e chama `sendPresenceUpdate` tanto para available quanto para unavailable. Assim, alwaysOnline=false reduz o anúncio de disponibilidade, mas não significa ausência de presença/tráfego. O callback de sucesso em `Socket/socket.js:732` também pode carregar prekeys, anunciar sessão ativa e verificar o key bundle. A Evolution consulta a foto de perfil ao receber open. Sincronização limitada e eventos internos podem continuar existindo com syncFullHistory=false; flags de persistência desligadas não são flags de bloqueio de rede.

Há ainda comportamento condicional em `whatsapp.baileys.service.ts:1886`: rejeitar chamadas se rejectCall estiver configurado e enviar resposta automática se msgCall não estiver vazio. O default do schema para rejectCall é false e msgCall é opcional; **não há evidência de que esse ramo tenha executado ou estivesse habilitado**. Ele pertence ao gateway e não consulta o gate de envio do VEXOR.

### Persistência sem Redis e limites dos contadores

O lançador configura Redis=false, cache local=true e persistência de instância=true. `use-multi-file-auth-state-prisma.ts:81` armazena creds no PostgreSQL e, sem Redis, chaves Signal em arquivos privados sob `instances/<sessão>`. A integridade da sessão depende de ambos; não foram alterados nem apagados nesta auditoria. Não foi demonstrada falha de gravação ou corrupção.

O lançador também desliga persistência de novas mensagens, contatos, chats e histórico do gateway. Por isso, zero linhas em Message é evidência particularmente limitada: não comprova zero tráfego nem zero mensagem processada. Zero Notification mostra ausência de registros de despacho do VEXOR vinculados à conta na coleta; não cobre ações internas da Evolution, outros caminhos nem histórico não persistido.

### Gate de envio e interface

`packages/connectors/src/index.ts:242` bloqueia o transporte padrão de mensagens quando WHATSAPP_EXTERNAL_ENABLED não é true. O worker usa esse adapter padrão em `packages/workflow-runtime/src/index.ts:668`. Operações de sessão usam transporte autorizado separadamente por WHATSAPP_SESSION_ENABLED. O lançador pretendia sessões=true e envio=false antes da quarentena; atualmente o caminho de quarentena força ambos=false. Não foram lidos segredos nem inspecionado o ambiente de um processo ativo.

Essa separação evita despacho normal pelo worker, mas **não cria sandbox de rede para Evolution/Baileys**: o gateway mantém as rotinas próprias descritas acima. A opção sessionOnly configura o transporte do adapter; não é uma negação independente no método send. Os chamadores atuais inspecionados separam o worker padrão das ações de sessão, mas não se deve assumir que esse gate controla todas as capacidades de um processo independente.

Na interface, o modal executa refresh a cada cinco segundos. O adapter implementa refresh como consulta ao estado do gateway, enquanto connect pode criar a instância e abrir a sessão. Abrir novamente o QR sem um QR válido pode chamar connect. Não é possível reconstruir quantas ações de UI aconteceram a partir dos arquivos analisados.

## Hipóteses e limites

Compatibilidade de revisão, identificação do cliente, repetição automática de conexão, estado prévio da conta e análise de risco do provedor são hipóteses possíveis. Nenhuma foi estabelecida como causa. A auditoria não demonstra comportamento abusivo, envio em massa, recebimento de um código específico ou confirmação de conexão bem-sucedida. Tampouco demonstra que a ausência de envios pelo VEXOR torne o pareamento isento de risco ou de tráfego upstream.

Não executar novas tentativas para testar hipóteses na conta real. Mudanças de versão, fingerprint ou persistência agora confundiriam a evidência e poderiam repetir o contato sem esclarecer o incidente.

## Métodos a manter suspensos

1. Startup automático/manual da Evolution e qualquer launcher que contorne a quarentena; startup de instâncias persistidas open/connecting.
2. create-instance, connect, reconnect/restart, obtenção/renovação de QR e login por código; repetição de scan e pairing em outra versão/cliente.
3. Refresh de sessão e polling do modal durante a contenção; evitar chamadas ao gateway mesmo quando a intenção for apenas conferir estado.
4. Logout/disconnect/delete/archive com efeito sobre o gateway, limpeza de chaves e restauração/recriação de sessão: podem contatar o provedor ou destruir evidência. Preservar os dados atuais.
5. Worker de despacho WhatsApp, chamadas diretas de envio, rotinas automáticas do gateway e testes/smokes que abram sockets ou contatem WhatsApp.

Próxima decisão pertence ao coordenador com o estado EM ANÁLISE e a quarentena preservada. Qualquer investigação adicional deve priorizar evidência já existente, agregados locais e a notificação original do usuário, sem nova tentativa de conexão. Este relatório não autoriza reativação nem propõe contornar a análise do provedor.

## Verificação desta auditoria

Executadas somente leituras de arquivos e consultas locais PostgreSQL explicitamente autorizadas, em transações READ ONLY encerradas com ROLLBACK. O JSON foi gerado por extração com allowlist de campos, sem reproduzir linhas brutas. Não foram executados build, testes, browser, npm run dev, instalador, serviço ou chamadas HTTP. Apenas este Markdown e o JSON sanitizado foram criados.
