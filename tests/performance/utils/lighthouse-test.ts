import os from 'os';
import getPort from 'get-port';
import type { BrowserContext } from 'playwright';
import { chromium } from 'playwright';
import { test as base } from '@playwright/test';
import path from 'path';

export const lighthouseTest = base.extend<
  {
    context: BrowserContext;
  },
  {
    port: number;
  }
>({
  port: [
    async ({}, use) => {
      const port = await getPort();
      await use(port);
    },
    { scope: 'worker' },
  ],
  context: [
    async ({ port }, use) => {
      const userDataDir = path.join(os.tmpdir(), 'pw', String(Math.random()));
      const context = await chromium.launchPersistentContext(userDataDir, {
        args: [`--remote-debugging-port=${port}`],
      });
      await use(context);
      await context.close();
    },
    { scope: 'test' },
  ],
});
