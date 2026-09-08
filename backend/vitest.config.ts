import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/hermes_test?schema=public',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef',
      AI_PROVIDER: 'stub',
      TELEGRAM_MODE: 'off',
      LOG_LEVEL: 'error',
    },
  },
});
