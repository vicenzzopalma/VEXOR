import { describe, expect, it } from 'vitest';
import { createSdrTemplate, sampleLead, validateWorkflow, type Workflow } from '@eimax/workflow-schema';
import {
  ancestorsOf,
  partialIssues,
  reachableFromTrigger,
  simulateUntil,
  simulateWorkflow,
} from '@eimax/workflow-engine';

// Modelo: gatilho → condição (orçamento ≥ 1000) → Sim: atribuir → etiqueta → gestor; Não: e-mail.
describe('Testar até este bloco (simulação parcial)', () => {
  it('percorre só os ancestrais e para no bloco escolhido', async () => {
    const flow = createSdrTemplate();
    const { steps, reachedTarget } = await simulateUntil(flow, sampleLead, 'tag');
    expect(reachedTarget).toBe(true);
    const ran = steps.filter((s) => s.status !== 'skipped').map((s) => s.nodeId);
    expect(ran).toEqual(['trigger', 'qualify', 'assign', 'tag']);
    const notify = steps.find((s) => s.nodeId === 'notify')!;
    expect(notify.status).toBe('skipped');
    expect(notify.message).toBe('Fora do trecho testado até o bloco escolhido.');
    // A simulação completa continua percorrendo tudo.
    const full = await simulateWorkflow(flow, sampleLead);
    expect(full.find((s) => s.nodeId === 'notify')!.status).toBe('success');
  });

  it('informa quando o lead segue outro ramo e não chega ao bloco', async () => {
    const flow = createSdrTemplate();
    const { steps, reachedTarget } = await simulateUntil(flow, { ...sampleLead, budget: 10 }, 'tag');
    expect(reachedTarget).toBe(false);
    expect(steps.filter((s) => s.status !== 'skipped').map((s) => s.nodeId)).toEqual(['trigger', 'qualify']);
    expect(steps.find((s) => s.nodeId === 'assign')!.message).toMatch(/seguiu outro caminho/);
    expect(steps.find((s) => s.nodeId === 'nurture')!.message).toMatch(/Fora do trecho/);
  });

  it('o gatilho como alvo executa só o gatilho', async () => {
    const { steps, reachedTarget } = await simulateUntil(createSdrTemplate(), sampleLead, 'trigger');
    expect(reachedTarget).toBe(true);
    expect(steps.filter((s) => s.status === 'success').map((s) => s.nodeId)).toEqual(['trigger']);
  });

  it('ignora problemas fora do trecho, blocos soltos e ramo de condição sem ligação', async () => {
    const flow: Workflow = createSdrTemplate();
    // Bloco depois do alvo com configuração incompleta e um bloco solto: a validação completa falha.
    flow.nodes = flow.nodes.map((n) => (n.id === 'notify' ? { ...n, config: { message: '' } } : n));
    flow.nodes.push({ ...flow.nodes.find((n) => n.id === 'tag')!, id: 'loose', position: { x: 0, y: 600 } });
    flow.edges = flow.edges.filter((e) => e.id !== 'e3'); // condição sem o ramo "Não"
    expect(validateWorkflow(flow).length).toBeGreaterThan(0);
    expect(partialIssues(flow, 'tag')).toEqual([]);
    const { reachedTarget } = await simulateUntil(flow, sampleLead, 'tag');
    expect(reachedTarget).toBe(true);
    // O bloco escolhido com problema continua bloqueando o teste.
    expect(partialIssues(flow, 'notify').length).toBeGreaterThan(0);
    await expect(simulateUntil(flow, sampleLead, 'notify')).rejects.toThrow();
  });

  it('valida alvo inexistente e alcance a partir do gatilho', async () => {
    const flow = createSdrTemplate();
    await expect(simulateUntil(flow, sampleLead, 'nao-existe')).rejects.toThrow('TARGET_NOT_FOUND');
    expect([...ancestorsOf(flow, 'tag')].sort()).toEqual(['assign', 'qualify', 'tag', 'trigger']);
    expect(reachableFromTrigger(flow, 'notify')).toBe(true);
    flow.nodes.push({ ...flow.nodes.find((n) => n.id === 'tag')!, id: 'loose' });
    expect(reachableFromTrigger(flow, 'loose')).toBe(false);
  });
});
