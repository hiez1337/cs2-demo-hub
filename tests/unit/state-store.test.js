import { describe, it, expect } from 'vitest';
import { AppStateStore } from '../../src/core/state-store.js';

describe('AppStateStore', () => {
  const mockConfig = { steamId: '76561198434644264', maxPages: 3 };
  const mockHistoryStore = { has: () => false };

  it('should initialize with idle state', () => {
    const store = new AppStateStore(mockConfig, mockHistoryStore);
    const snap = store.getSnapshot();
    expect(snap.status).toBe('idle');
    expect(snap.matches).toEqual([]);
  });

  it('should manage ring buffer logs up to 150 entries', () => {
    const store = new AppStateStore(mockConfig, mockHistoryStore);
    for (let i = 0; i < 200; i++) store.log(`Message ${i}`);
    const snap = store.getSnapshot();
    expect(snap.logs.length).toBe(150);
    expect(snap.logs[0].message).toBe('Message 50');
  });

  it('should update match status', () => {
    const store = new AppStateStore(mockConfig, mockHistoryStore);
    store.setMatches([{ csrepMatchId: 'm1', statusClass: 'pending', statusText: 'Ожидание' }]);
    store.updateMatchStatus('m1', 'done', 'Загружено ✓');
    expect(store.state.matches[0].statusClass).toBe('done');
  });
});
