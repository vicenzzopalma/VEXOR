import { isAllowedVariable, templateParts } from '@eimax/workflow-schema';

export function resolveTemplate(template: string, lead: unknown, steps: Record<string, unknown> = {}) {
  const issues: string[] = [];
  const text = templateParts(template)
    .map((part) => {
      if (part.kind === 'text') return part.value;
      if (!isAllowedVariable(part.value)) {
        issues.push('INVALID_REFERENCE');
        return '';
      }
      const keys = part.value.split('.');
      let value: unknown = keys.shift() === 'lead' ? lead : steps;
      for (const key of keys) {
        value =
          value && typeof value === 'object' && Object.hasOwn(value, key)
            ? (value as Record<string, unknown>)[key]
            : undefined;
      }
      if (value === null || value === undefined) {
        issues.push('MISSING_VALUE');
        return '';
      }
      if (
        !['string', 'number', 'boolean'].includes(typeof value) ||
        (typeof value === 'number' && !Number.isFinite(value))
      ) {
        issues.push('INVALID_TYPE');
        return '';
      }
      return String(value);
    })
    .join('');
  return { text, issues };
}
