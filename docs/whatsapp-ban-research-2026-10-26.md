# Incidente WhatsApp: conta em análise após pareamento

Pesquisa realizada em 26/10/2026. Estado informado pelo usuário: **conta em análise**. Isso não confirma banimento permanente, nem permite prever o resultado da análise. O número não deve ser usado em novas tentativas durante a investigação.

## Contenção realizada

Gateway Evolution interrompido; dados e sessões preservados. `.local/whatsapp-service-quarantined.json` impede reinício automático e força sessões/envio desabilitados. O instalador também recusa reativação antes de buscar código, instalar dependências ou acessar banco. Dois testes offline verificam essas barreiras. O VEXOR permanece disponível sem gateway; a porta local 8088 não está escutando.

Nenhum novo QR, socket, logout, reconexão, troca de versão ou tentativa com outro número foi executado após o relato. A auditoria do segundo Codex é offline, com saída sanitizada e sem números, JIDs, QR ou segredos.

## Correção da avaliação anterior

Evolution foi obtida do repositório oficial do **projeto Evolution**, mas o método escolhido era `WHATSAPP-BAILEYS`, não a integração oficial do WhatsApp/Meta. Essa distinção deveria ter sido explicitada antes do pareamento da conta real. O [próprio Baileys declara não ser autorizado nem afiliado ao WhatsApp](https://github.com/WhiskeySockets/Baileys#disclaimer).

`WHATSAPP_EXTERNAL_ENABLED=false` bloqueia o despacho de mensagens pelos adapters do VEXOR; não transforma o handshake, sincronização ou presença do cliente Baileys em operações sem comunicação com o WhatsApp. QR real comprova uma resposta de pareamento, não homologação do método, segurança da conta ou ausência de risco de restrição.

## O que dizem as fontes oficiais

O [WhatsApp, em Sobre dispositivos conectados](https://faq.whatsapp.com/378279804439436/?cms_platform=android&locale=pt_BR), alerta que vincular a conta a apps/sites não oficiais pode causar banimento temporário ou permanente. A [página sobre apps não oficiais](https://faq.whatsapp.com/1217634902127718/?locale=pt_BR) também menciona restrições ao vínculo de aparelhos. Isso sustenta o risco do método, mas não revela o sinal que motivou a análise desta conta.

Para banimento contestável, a [Central de Ajuda orienta Pedir análise no próprio app](https://faq.whatsapp.com/465883178708358/?helpref=hc_fnav&locale=pt_BR). Como o usuário já informa estar em análise, deve acompanhar a decisão ali. O WhatsApp informa que a maioria das análises termina em até 24 horas; não é garantia individual. Serviços terceiros não podem desfazer a decisão. A [orientação sobre bloqueio temporário](https://faq.whatsapp.com/1848531392146538/?locale=pt_BR) recomenda interromper o uso não oficial; um contador temporário e uma conta em análise são estados diferentes.

## Histórico pesquisado: relatos, não causas comprovadas

| Data do relato | Fonte e comportamento | Limite de interpretação |
| --- | --- | --- |
| 05/10/2025 | [Baileys #1869](https://github.com/WhiskeySockets/Baileys/issues/1869): usuários relatam bloqueios em versões 7 RC e 6.7, incluindo sessões antigas. | Discussão comunitária, sem taxa de incidência, controle experimental ou versão comprovadamente imune. |
| 09/12/2025 | [Evolution #2298](https://github.com/evolution-foundation/evolution-api/issues/2298): restrição após um ou dois dias e impossibilidade de parear por 24 h; encaminhado ao [agrupador de problemas de QR #2437](https://github.com/evolution-foundation/evolution-api/issues/2437). | Parecido no tipo de restrição, diferente da temporalidade imediata informada neste incidente. Não é prova de que aguardar 24 h restaura esta conta. |
| 20/04/2026 | [Baileys #2488](https://github.com/WhiskeySockets/Baileys/issues/2488): relato de falha de vínculo com rc.9; posteriormente o autor corrigiu sua análise porque o exemplo não tratava o reinício esperado 515. | Demonstra que falha de vínculo ou código de desconexão, isoladamente, não comprova banimento. A conclusão atualizada deve prevalecer sobre o título inicial. |
| 04/07/2026 | [Baileys #2691](https://github.com/WhiskeySockets/Baileys/issues/2691): falha de novo pareamento continuou após corrigir consulta de versão; autor suspeita de restrição de registro. | Hipótese do autor; não estabelece motivo de banimento, tempo de recuperação ou solução garantida. |
| 07/09/2026 | [Baileys #2805](https://github.com/WhiskeySockets/Baileys/issues/2805): relato de restrição no momento de escanear QR, citando rc.9 e conta Business verificada em nuvem. | É relato de usuário, não confirmação da Meta nem prova de irreversibilidade. Não sabemos se a conta deste incidente tem selo; ambiente local também difere do descrito. |

As explicações sobre impressão TLS, perfil de navegador ou mecanismo interno de detecção nesses relatos não foram confirmadas pela Meta. Não foram tratadas como diagnóstico. Também não foi encontrada base confiável para prometer proteção trocando versão, nome do navegador ou endereço de rede.

## Revisão das versões escolhidas

A instalação fixou Evolution 2.3.7 e a dependência que esse código declara, Baileys 7.0.0-rc.9. Na consulta atual, a [página de releases do Baileys](https://github.com/WhiskeySockets/Baileys/releases) já lista rc10 a rc14, com rc14 marcada como latest. A [Evolution oferece 2.4.0-rc2](https://github.com/evolution-foundation/evolution-api/releases) como pré-release de uma branch diferente de main, com indicação de uso para validação. Portanto compilar main e obter QR não era uma análise suficiente de compatibilidade operacional. Isso é uma lacuna da escolha/homologação anterior, não uma demonstração de que uma versão causou ou outra corrigiria a restrição. Nenhuma atualização foi aplicada ao ambiente ou experimentada no número afetado.

## Revisão do método e encaminhamento

1. Manter o gateway em quarentena e preservar evidências. Não repetir pareamento nem apagar sessão para tentar destravar a análise. A ausência de envio comercial não elimina o risco documentado de cliente não oficial.
2. Acompanhar o processo oficial de análise no celular. Não há correção de código local que remova uma restrição da plataforma; resultado e prazo individuais dependem do WhatsApp.
3. Para o SaaS, priorizar avaliação da [WhatsApp Business Platform](https://business.whatsapp.com/products/business-platform), com canal oficial, onboarding empresarial, permissões, webhook e isolamento organizacional. O adapter Meta já existente no VEXOR não equivale a onboarding produtivo concluído. Custos, conta empresarial, elegibilidade e migração precisam de avaliação antes de ativar; nenhum serviço pago foi contratado.
4. Mesmo a plataforma oficial exige cumprimento das [políticas de mensagens](https://business.whatsapp.com/policy/preview?lang=pt_BR); não existe garantia de imunidade a restrições. Não migrar nem registrar o número em análise durante este diagnóstico.
5. Se houver uma revisão futura do runtime não oficial, separar reinício protocolar esperado, expiração, revogação e erro terminal, impor limite/backoff de tentativas e melhorar logs sanitizados. Isso melhora operação e diagnóstico; **não constitui solução antiban** nem autoriza novos testes na conta afetada.

Evidências locais e limites adicionais: [whatsapp-incident-forensics.md](whatsapp-incident-forensics.md). A mensagem exata do celular, o resultado da análise e a justificativa interna do WhatsApp ainda não estão disponíveis; a causa específica permanece indeterminada.
