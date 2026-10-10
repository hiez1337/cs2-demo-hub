import { describe, it, expect, vi } from 'vitest';
import { registerProcessGuard } from '../../src/infrastructure/process-guard.js';

describe('Infrastructure: process-guard', () => {
  it('should execute onShutdown callback when triggered', async () => {
    const mockShutdown = vi.fn(async () => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    const guard = registerProcessGuard(mockShutdown);
    await guard.trigger('TEST');

    expect(mockShutdown).toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
