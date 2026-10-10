import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ConfigManager } from '../../src/config/index.js';

const TEST_DIR = path.resolve('./tests_temp_config');

describe('ConfigManager', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
    }
  });

  it('should load default configuration when file does not exist', () => {
    const mgr = new ConfigManager(path.join(TEST_DIR, 'missing.json'));
    expect(mgr.config.steamId).toBe('76561198434644264');
    expect(mgr.config.maxPages).toBe(3);
    expect(mgr.config.chunkConcurrency).toBe(4);
  });

  it('should merge JSON file settings', () => {
    const cfgPath = path.join(TEST_DIR, 'test_config.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ steamId: '76561198434644264', maxPages: 5, chunkConcurrency: 8 }));

    const mgr = new ConfigManager(cfgPath);
    expect(mgr.config.maxPages).toBe(5);
    expect(mgr.config.chunkConcurrency).toBe(8);
  });

  it('should parse CLI arguments and override values', () => {
    const mgr = new ConfigManager(path.join(TEST_DIR, 'missing.json'));
    mgr.applyCliArgs(['--pages=10', '--concurrency=2', '--port=8080']);
    expect(mgr.config.maxPages).toBe(10);
    expect(mgr.config.chunkConcurrency).toBe(2);
    expect(mgr.config.webPort).toBe(8080);
  });
});
