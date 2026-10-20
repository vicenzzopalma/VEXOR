import { describe, expect, it } from 'vitest';
import { connectorRegistry, publicConnectorCatalog, sheetMappingSchema } from '@eimax/connectors';
describe('Contratos versionados de conectores', () => {
  it.each(Object.entries(connectorRegistry))(
    '%s declara autenticação, formulários e operações validadas',
    (_provider, definition) => {
      expect(definition.version).toMatch(/^\d+\.\d+\.\d+$/);
      for (const action of [...definition.actions, ...definition.triggers])
        expect(action.schema.safeParse(undefined).success).toBe(false);
      expect(definition.credentialsSchema.safeParse({ secret: 'unknown' }).success).toBe(false);
    },
  );
  it('catálogo público não serializa schemas ou credenciais e não alega homologação', () => {
    const catalog = publicConnectorCatalog();
    expect(catalog.every((c) => !c.homologated)).toBe(true);
    expect(JSON.stringify(catalog)).not.toContain('_def');
    expect(connectorRegistry.EVOLUTION.capabilities.createInstance).toBe(true);
    expect(connectorRegistry.META.capabilities.qr).toBe(false);
  });
  it('mapeamentos recusam duplicatas e campos confidenciais', () => {
    expect(
      sheetMappingSchema.safeParse({
        spreadsheetId: 'test',
        sheet: 'Leads',
        fields: [{ column: 'A', field: 'password' }],
      }).success,
    ).toBe(false);
    expect(
      sheetMappingSchema.safeParse({
        spreadsheetId: 'test',
        sheet: 'Leads',
        fields: [
          { column: 'A', field: 'name' },
          { column: 'A', field: 'email' },
        ],
      }).success,
    ).toBe(false);
  });
});
