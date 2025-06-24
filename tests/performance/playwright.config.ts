import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 5 * 60 * 1000, // 5 minutes
  webServer: {
    command: 'npx serve public -p 3000',
  },
});
