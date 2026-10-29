import { describe, expect, it } from 'vitest';
import { buildSchema, formatSize, itemsOf, pathText } from '../../apps/web/components/node-data-view';

describe('Vistas de dados do detalhe do bloco', () => {
  it('monta caminhos no formato das variáveis, com índices e chaves especiais', () => {
    expect(pathText('lead', ['score'])).toBe('lead.score');
    expect(pathText('steps.qualify', ['details', 'rules', 0, 'op'])).toBe(
      'steps.qualify.details.rules[0].op',
    );
    expect(pathText('lead', ['nome completo'])).toBe('lead["nome completo"]');
    expect(pathText('', [0, 'a'])).toBe('[0].a');
    expect(pathText('steps.x', [])).toBe('steps.x');
  });
  it('trata objeto como um item, lista como itens e vazio como nenhum', () => {
    expect(itemsOf({ a: 1 })).toEqual([{ a: 1 }]);
    expect(itemsOf([1, 2])).toEqual([1, 2]);
    expect(itemsOf(null)).toEqual([]);
    expect(itemsOf(undefined)).toEqual([]);
    expect(itemsOf('texto')).toEqual(['texto']);
  });
  it('junta campos de todos os itens com tipos, exemplo e filhos', () => {
    const schema = buildSchema(
      [
        { score: 42, tags: [{ name: 'a' }], extra: null },
        { score: 'alto', tags: [{ name: 'b', weight: 2 }], extra: 'x', details: { ok: true } },
      ],
      [0],
    );
    const score = schema.find((field) => field.key === 'score')!;
    expect([...score.types]).toEqual(['número', 'texto']);
    expect(score.example).toBe(42);
    expect(score.path).toEqual([0, 'score']);
    // Exemplo nulo é trocado pelo primeiro valor não nulo.
    expect(schema.find((field) => field.key === 'extra')!.example).toBe('x');
    const tags = schema.find((field) => field.key === 'tags')!;
    expect([...tags.types]).toEqual(['lista']);
    expect(tags.children.map((child) => child.key)).toEqual(['name', 'weight']);
    expect(tags.children[0].path).toEqual([0, 'tags', 0, 'name']);
    expect(schema.find((field) => field.key === 'details')!.children[0].types.has('booleano')).toBe(true);
  });
  it('escala bem com muitos itens', () => {
    const items = Array.from({ length: 20000 }, (_, i) => ({ list: [{ i }], nested: { i } }));
    const started = performance.now();
    const schema = buildSchema(items, [0]);
    expect(schema.map((field) => field.key)).toEqual(['list', 'nested']);
    expect(performance.now() - started).toBeLessThan(2000);
  });
  it('formata tamanhos em KB e MB no padrão brasileiro', () => {
    expect(formatSize(10)).toBe('1 KB');
    expect(formatSize(300 * 1024)).toBe('300 KB');
    expect(formatSize(1.25 * 1024 * 1024)).toBe('1,3 MB');
    expect(formatSize(3 * 1024 * 1024)).toBe('3 MB');
  });
});
