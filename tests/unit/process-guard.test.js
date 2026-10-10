import { describe, it, expect, vi } from 'vitest';
import { registerProcessGuard } from '../../src/infrastructure/process-guard.js';

describe('Infrastructure: process-guard', () => {
  it('should execute onShutdown callback when triggered', async () => {
    const mockShutdown = vi.fn(async () => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    const guard = registerProcessGuard(mockShutdown);
    await guard.trigger('TEST');
    expect(mockShutdown).toHaveBeenCalled();

    // Test error in shutdown callback
    const errorShutdown = vi.fn(async () => { throw new Error('fail'); });
    const guard2 = registerProcessGuard(errorShutdown);
    await guard2.trigger('FAIL');
    expect(errorShutdown).toHaveBeenCalled();

    exitSpy.mockRestore();
  });
});
