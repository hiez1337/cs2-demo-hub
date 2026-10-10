import { describe, it, expect } from 'vitest';
import { parseMatchScore, formatMatchDate } from '../../src/domain/match-parser.js';

describe('Domain: match-parser', () => {
  it('should parse score from string "13:9" or "13-9"', () => {
    expect(parseMatchScore('13:9')).toEqual({ scoreStr: '13:9', isWin: true, team1: 13, team2: 9 });
    expect(parseMatchScore('9-13')).toEqual({ scoreStr: '9:13', isWin: false, team1: 9, team2: 13 });
  });

  it('should parse score from array [16, 14]', () => {
    expect(parseMatchScore([16, 14])).toEqual({ scoreStr: '16:14', isWin: true, team1: 16, team2: 14 });
  });

  it('should parse score from object { t1: 13, t2: 5 }', () => {
    expect(parseMatchScore({ t1: 13, t2: 5 })).toEqual({ scoreStr: '13:5', isWin: true, team1: 13, team2: 5 });
  });

  it('should handle empty or null score gracefully', () => {
    expect(parseMatchScore(null)).toEqual({ scoreStr: '—', isWin: false, team1: 0, team2: 0 });
    expect(parseMatchScore('')).toEqual({ scoreStr: '—', isWin: false, team1: 0, team2: 0 });
  });

  it('should format date safely', () => {
    expect(formatMatchDate(null)).toBe('—');
    expect(formatMatchDate('2026-08-20T12:00:00Z')).toContain('2026');
  });
});
