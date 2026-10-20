import { describe, expect, it } from 'vitest';
import { createSdrTemplate, sampleLead, validateWorkflow } from '@eimax/workflow-schema';
import { resolveTemplate, interpretWorkflow } from '@eimax/workflow-engine';

describe('Variáveis seguras e compatíveis', () => {
  it('preserva texto literal e caracteres especiais sem executar código', () => {
    expect(resolveTemplate('Mensagem antiga', sampleLead).text).toBe('Mensagem antiga');
    const name = '<script>alert(1)</script> ${process.exit()} & ç';
    expect(resolveTemplate('Olá {{lead.name}}', { ...sampleLead, name }).text).toBe(`Olá ${name}`);
  });
  it('trata nulos, ausentes, tipos inválidos e protege propriedades confidenciais', () => {
    expect(resolveTemplate('{{lead.name}}/{{lead.phone}}', { name: null }).text).toBe('/');
    expect(resolveTemplate('{{lead.name}}', { name: {} }).issues).toEqual(['INVALID_TYPE']);
    expect(resolveTemplate('{{lead.password}} {{lead.__proto__}}', { password: 'secret' }).text).toBe(' ');
  });
  it('aceita saída anterior e rejeita etapa inexistente ou futura na validação', () => {
    expect(
      resolveTemplate('{{steps.assign.assignedTo}}', sampleLead, { assign: { assignedTo: 'Ana' } }).text,
    ).toBe('Ana');
    const flow = createSdrTemplate();
    flow.nodes.find((n) => n.id === 'notify')!.config.message = '{{steps.assign.assignedTo}}';
    expect(validateWorkflow(flow)).toEqual([]);
    flow.nodes.find((n) => n.id === 'notify')!.config.message = '{{steps.unknown.assignedTo}}';
    expect(validateWorkflow(flow).some((i) => i.message.includes('variável indisponível'))).toBe(true);
    flow.nodes.find((n) => n.id === 'assign')!.config.team = '{{steps.notify.notificationId}}';
    expect(validateWorkflow(flow).some((i) => i.nodeId === 'assign')).toBe(true);
  });
  it('resolve dados em execução e não vaza o conteúdo interpolado no histórico', async () => {
    const flow = createSdrTemplate();
    flow.nodes.find((n) => n.id === 'notify')!.config.message =
      'Olá {{lead.name}}, seu SDR é {{steps.assign.assignedTo}}';
    let received = '';
    const steps = await interpretWorkflow(flow, sampleLead, {
      execute: async (node) => {
        if (node.id === 'notify') received = String(node.config.message);
        return { output: { assignedTo: 'Ana' }, message: 'ok' };
      },
    });
    expect(received).toBe(`Olá ${sampleLead.name}, seu SDR é Ana`);
    expect(JSON.stringify(steps)).not.toContain(sampleLead.name);
  });
});
