import { describe, expect, it } from 'vitest';
import tr from './locales/tr.json';
import fr from './locales/fr.json';
import nl from './locales/nl.json';
import en from './locales/en.json';

describe('StockFlow translations', () => {
  const keys = Object.keys(tr).sort();
  for (const [code, dict] of Object.entries({fr, nl, en})) {
    it(`${code} contains every Turkish key`, () => {
      expect(Object.keys(dict).sort()).toEqual(keys);
      expect(Object.values(dict).every(value => typeof value === 'string' && value.trim().length > 0)).toBe(true);
    });
  }
  it('includes important navigation and order labels', () => {
    expect(en['Ürünler']).toBe('Products');
    expect(fr['Yönetim']).toBe('Gestion');
    expect(nl['Siparişler']).toBe('Bestellingen');
  });
});
