import { describe, it, expect } from 'vitest';
import { sanitizeXml } from '../../src/infrastructure/notifier.js';

describe('Infrastructure: notifier', () => {
  it('should sanitize XML characters', () => {
    expect(sanitizeXml('<hello>&"\'world</hello>')).toBe('&lt;hello&gt;&amp;&quot;&apos;world&lt;/hello&gt;');
    expect(sanitizeXml(null)).toBe('');
    expect(sanitizeXml(123)).toBe('123');
  });
});
