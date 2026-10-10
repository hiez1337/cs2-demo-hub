import { describe, it, expect } from 'vitest';
import { getMapTitle, MAP_EMOJIS } from '../../src/domain/maps.js';

describe('Domain: maps', () => {
  it('should return matching formatted title with emoji', () => {
    expect(getMapTitle('de_mirage')).toBe('🏛️  DE_MIRAGE');
    expect(getMapTitle('DE_DUST2')).toBe('🏜️  DE_DUST2');
    expect(getMapTitle('de_inferno')).toBe('🔔  DE_INFERNO');
  });

  it('should format unknown maps with default prefix', () => {
    expect(getMapTitle('de_tuscan')).toBe('🎯  DE_TUSCAN');
    expect(getMapTitle(null)).toBe('🎯  UNKNOWN');
  });
});
