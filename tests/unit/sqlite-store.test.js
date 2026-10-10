import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SqliteStore } from '../../src/storage/sqlite-store.js';

const TEST_DIR = path.resolve('./tests_temp_sqlite');
const TEST_DB = path.join(TEST_DIR, 'test_data.sqlite');

describe('SqliteStore Unit Tests', () => {
  let store;

  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch {}
    }
    store = new SqliteStore(TEST_DB);
  });

  afterEach(() => {
    if (store) {
      try { store.close(); } catch {}
    }
    if (fs.existsSync(TEST_DIR)) {
      try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
    }
  });

  describe('Database Initialization', () => {
    it('should initialize tables in memory or file', () => {
      const memStore = new SqliteStore(':memory:');
      expect(memStore).toBeDefined();

      const stats = memStore.getStats();
      expect(stats).toEqual({ total: 0, uploaded: 0, missing: 0, failed: 0 });
      memStore.close();
    });

    it('should create matches and settings tables with expected schema', () => {
      const matchCols = store.db.pragma('table_info(matches)').map(c => c.name);
      expect(matchCols).toContain('id');
      expect(matchCols).toContain('faceit_id');
      expect(matchCols).toContain('map');
      expect(matchCols).toContain('score');
      expect(matchCols).toContain('is_win');
      expect(matchCols).toContain('demo_size');
      expect(matchCols).toContain('status');
      expect(matchCols).toContain('error');
      expect(matchCols).toContain('created_at');
      expect(matchCols).toContain('updated_at');

      const settingsCols = store.db.pragma('table_info(settings)').map(c => c.name);
      expect(settingsCols).toContain('key');
      expect(settingsCols).toContain('value');
    });
  });

  describe('Match Operations', () => {
    it('should upsert a new match and read it back', () => {
      const match = {
        id: 'match-101',
        faceit_id: 'faceit-101',
        map: 'de_mirage',
        score: '13:9',
        is_win: 1,
        demo_size: 45000000,
        status: 'uploaded',
      };

      const result = store.upsertMatch(match);
      expect(result).toBeDefined();
      expect(result.id).toBe('match-101');
      expect(result.faceit_id).toBe('faceit-101');
      expect(result.map).toBe('de_mirage');
      expect(result.score).toBe('13:9');
      expect(result.is_win).toBe(1);
      expect(result.demo_size).toBe(45000000);
      expect(result.status).toBe('uploaded');

      expect(store.hasMatch('match-101')).toBe(true);
      expect(store.hasMatch('non-existent')).toBe(false);
    });

    it('should support alternative field naming (csrepMatchId, faceitId, isWin, demoSize)', () => {
      const match = {
        csrepMatchId: 'match-102',
        faceitId: 'faceit-102',
        mapName: 'de_inferno',
        score: '16:14',
        isWin: true,
        demoSize: 52000000,
        status: 'missing',
      };

      const result = store.upsertMatch(match);
      expect(result.id).toBe('match-102');
      expect(result.faceit_id).toBe('faceit-102');
      expect(result.map).toBe('de_inferno');
      expect(result.is_win).toBe(1);
      expect(result.demo_size).toBe(52000000);
      expect(result.status).toBe('missing');
    });

    it('should update match on conflict without overwriting untouched columns', () => {
      store.upsertMatch({
        id: 'match-103',
        faceit_id: 'faceit-103',
        map: 'de_anubis',
        score: '11:13',
        is_win: 0,
        status: 'missing',
      });

      // Update status to uploaded
      store.upsertMatch({
        id: 'match-103',
        status: 'uploaded',
      });

      const updated = store.getMatch('match-103');
      expect(updated.status).toBe('uploaded');
      expect(updated.map).toBe('de_anubis');
      expect(updated.faceit_id).toBe('faceit-103');
      expect(updated.is_win).toBe(0);
    });

    it('should update match status and error using updateMatchStatus', () => {
      store.upsertMatch({
        id: 'match-104',
        status: 'missing',
      });

      const success = store.updateMatchStatus('match-104', 'failed', 'Network timeout while uploading');
      expect(success).toBe(true);

      const match = store.getMatch('match-104');
      expect(match.status).toBe('failed');
      expect(match.error).toBe('Network timeout while uploading');

      // Clear error on retry success
      store.updateMatchStatus('match-104', 'uploaded');
      const cleared = store.getMatch('match-104');
      expect(cleared.status).toBe('uploaded');
      expect(cleared.error).toBeNull();
    });

    it('should delete a match and clear all matches', () => {
      store.upsertMatch({ id: 'm1', status: 'missing' });
      store.upsertMatch({ id: 'm2', status: 'missing' });
      expect(store.hasMatch('m1')).toBe(true);

      expect(store.deleteMatch('m1')).toBe(true);
      expect(store.hasMatch('m1')).toBe(false);

      store.clearMatches();
      expect(store.hasMatch('m2')).toBe(false);
      expect(store.getStats().total).toBe(0);
    });
  });

  describe('Filtering and Querying Matches', () => {
    beforeEach(() => {
      store.upsertMatch({ id: 'm-1', faceit_id: 'f-1', map: 'de_mirage', score: '13:5', is_win: 1, status: 'uploaded' });
      store.upsertMatch({ id: 'm-2', faceit_id: 'f-2', map: 'de_inferno', score: '7:13', is_win: 0, status: 'missing' });
      store.upsertMatch({ id: 'm-3', faceit_id: 'f-3', map: 'de_mirage', score: '13:11', is_win: 1, status: 'failed', error: '403 Forbidden' });
      store.upsertMatch({ id: 'm-4', faceit_id: 'f-4', map: 'de_nuke', score: '13:8', is_win: 1, status: 'uploaded' });
    });

    it('should get all matches with no filter', () => {
      const matches = store.getMatches();
      expect(matches.length).toBe(4);
    });

    it('should filter by string status', () => {
      const uploaded = store.getMatches('uploaded');
      expect(uploaded.length).toBe(2);
      expect(uploaded.every(m => m.status === 'uploaded')).toBe(true);
    });

    it('should filter by status array in filter object', () => {
      const matches = store.getMatches({ status: ['missing', 'failed'] });
      expect(matches.length).toBe(2);
    });

    it('should filter by map and is_win', () => {
      const mirageWins = store.getMatches({ map: 'de_mirage', is_win: 1 });
      expect(mirageWins.length).toBe(2);
      expect(mirageWins.every(m => m.map === 'de_mirage' && m.is_win === 1)).toBe(true);
    });

    it('should search by id, faceit_id, or map keyword', () => {
      const searchRes = store.getMatches({ search: 'inferno' });
      expect(searchRes.length).toBe(1);
      expect(searchRes[0].id).toBe('m-2');

      const faceitSearch = store.getMatches({ search: 'f-3' });
      expect(faceitSearch.length).toBe(1);
      expect(faceitSearch[0].id).toBe('m-3');
    });

    it('should support pagination (limit & offset)', () => {
      const paged = store.getMatches({ limit: 2, offset: 1 });
      expect(paged.length).toBe(2);
    });
  });

  describe('Statistics', () => {
    it('should calculate accurate stats for uploaded, missing, and failed matches', () => {
      store.upsertMatch({ id: 'm-1', status: 'uploaded' });
      store.upsertMatch({ id: 'm-2', status: 'done' }); // counts as uploaded
      store.upsertMatch({ id: 'm-3', status: 'missing' });
      store.upsertMatch({ id: 'm-4', status: 'pending' }); // counts as missing
      store.upsertMatch({ id: 'm-5', status: 'failed' });
      store.upsertMatch({ id: 'm-6', status: 'error' }); // counts as failed

      const stats = store.getStats();
      expect(stats.total).toBe(6);
      expect(stats.uploaded).toBe(2);
      expect(stats.missing).toBe(2);
      expect(stats.failed).toBe(2);
    });
  });

  describe('Settings Storage', () => {
    it('should set and get string settings', () => {
      store.setSetting('steam_id', '76561198000000000');
      expect(store.getSetting('steam_id')).toBe('76561198000000000');
    });

    it('should set and get boolean, number, and object settings', () => {
      store.setSetting('auto_upload', true);
      store.setSetting('chunk_size', 5242880);
      store.setSetting('filters', { minElo: 2000, onlyWins: false });

      expect(store.getSetting('auto_upload')).toBe(true);
      expect(store.getSetting('chunk_size')).toBe(5242880);
      expect(store.getSetting('filters')).toEqual({ minElo: 2000, onlyWins: false });
    });

    it('should return defaultVal for non-existent setting', () => {
      expect(store.getSetting('non_existent', 'default-val')).toBe('default-val');
      expect(store.getSetting('non_existent')).toBeNull();
    });

    it('should overwrite existing setting', () => {
      store.setSetting('theme', 'dark');
      expect(store.getSetting('theme')).toBe('dark');
      store.setSetting('theme', 'light');
      expect(store.getSetting('theme')).toBe('light');
    });

    it('should delete a setting', () => {
      store.setSetting('temp_key', 'val');
      expect(store.getSetting('temp_key')).toBe('val');
      expect(store.deleteSetting('temp_key')).toBe(true);
      expect(store.getSetting('temp_key')).toBeNull();
    });
  });
});
