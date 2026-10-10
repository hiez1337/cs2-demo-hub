import { describe, it, expect, vi } from 'vitest';
import { BrowserManager } from '../../src/browser/browser-manager.js';

describe('BrowserManager', () => {
  it('should manage context lifecycle', async () => {
    const mockCookieStore = {
      load: vi.fn(() => [{ name: 'test_c', value: '123' }]),
      normalizeForPlaywright: vi.fn((c) => c),
      save: vi.fn(),
    };
    const config = { browserSessionDir: './tests_temp_browser', tempDownloadsDir: './tests_temp_downloads' };
    const manager = new BrowserManager(config, mockCookieStore);

    const mockContext = {
      cookies: vi.fn(async () => [{ name: 'test_c', value: '123' }]),
      close: vi.fn(async () => {}),
    };
    manager.context = mockContext;

    await manager.saveCookies();
    expect(mockCookieStore.save).toHaveBeenCalled();

    await manager.close();
    expect(manager.context).toBeNull();

    // Ensure safe no-op when context is already closed
    await manager.saveCookies();
    await manager.close();
    expect(manager.context).toBeNull();

    // getContext returns existing context if already created
    manager.context = mockContext;
    const ctx = await manager.getContext();
    expect(ctx).toBe(mockContext);
  });
});
