import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    env: {
      SESSION_STORAGE_PATH: './tests_temp_session/session_vitest.enc',
      SQLITE_DB_PATH: ':memory:',
    },
    include: ['tests/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/server/web-server.js', 'src/cli/**', 'src/main/**', 'src/preload/**', 'src/renderer/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 65,
        statements: 75,
      },
    },
  },
});
