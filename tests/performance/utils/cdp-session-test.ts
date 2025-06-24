import type { CDPSession } from 'playwright';
import { chromium } from 'playwright';
import type { Browser } from '@playwright/test';
import { test as base } from '@playwright/test';
import getPort from 'get-port';

export const cdpSessionTest = base.extend<
  {
    cdpSession: CDPSession;
  },
  {
    chromeBrowser: Browser;
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
  chromeBrowser: [
    async ({ port }, use) => {
      const chromeBrowser = await chromium.launch({
        args: [`--remote-debugging-port=${port}`],
        headless: true,
      });
      await use(chromeBrowser);
    },
    { scope: 'worker' },
  ],
  cdpSession: [
    async ({ chromeBrowser }, use) => {
      const context = await chromeBrowser.newContext();
      const page = await context.newPage();
      const session = await page.context().newCDPSession(page);
      await use(session);
      await context.close();
    },
    { scope: 'test' },
  ],
});
