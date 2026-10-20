export const leadVariables = {
  name: 'Nome do Lead',
  company: 'Empresa',
  email: 'E-mail',
  phone: 'Telefone',
  budget: 'Orçamento',
  score: 'Pontuação',
  source: 'Origem',
  assignedTo: 'SDR Responsável',
  message: 'Texto da mensagem recebida',
} as const;
export const stepVariables: Record<string, Record<string, string>> = {
  'sdr.assign': { assignedTo: 'SDR Responsável', assigned: 'Atribuído' },
  condition: { matched: 'Regra atendida', branch: 'Caminho' },
  'email.send': { messageId: 'Identificador da mensagem', notificationId: 'Registro na fila de envio' },
  'manager.notify': { notificationId: 'Identificador do aviso' },
  'tag.add': { tag: 'Etiqueta' },
};
export type TemplatePart = { kind: 'text' | 'variable'; value: string };
export function templateParts(value: string): TemplatePart[] {
  return value
    .split(/(\{\{[^{}]*\}\})/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('{{')
        ? { kind: 'variable', value: part.slice(2, -2).trim() }
        : { kind: 'text', value: part },
    );
}
export function isAllowedVariable(path: string): boolean {
  const keys = path.split('.');
  return (
    (keys.length === 2 && keys[0] === 'lead' && Object.hasOwn(leadVariables, keys[1])) ||
    (keys.length === 3 &&
      keys[0] === 'steps' &&
      /^[a-zA-Z0-9_-]+$/.test(keys[1]) &&
      Object.values(stepVariables).some((fields) => Object.hasOwn(fields, keys[2])))
  );
}
