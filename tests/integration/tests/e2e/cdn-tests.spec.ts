import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    EmbraceWebSdk: typeof import('../../../../packages/web-sdk/src/index.ts');
  }
}

const CDN_TEST_URL = 'http://localhost:3001/public/cdn/index.html';

test.describe('CDN E2E Tests', () => {
  test('it should expose EmbraceWebSdk on window', async ({ page }) => {
    await page.goto(CDN_TEST_URL);

    const hasEmbraceWebSdk = await page.evaluate(
      () => typeof window.EmbraceWebSdk === 'object',
    );

    expect(hasEmbraceWebSdk).toBe(true);
  });

  test('it should expose initSDK function', async ({ page }) => {
    await page.goto(CDN_TEST_URL);

    const hasInitSDK = await page.evaluate(
      () => typeof window.EmbraceWebSdk?.initSDK === 'function',
    );

    expect(hasInitSDK).toBe(true);
  });

  test('it should expose 8 functions and an attributes object', async ({
    page,
  }) => {
    await page.goto(CDN_TEST_URL);

    const sdk = await page.evaluate(() => window.EmbraceWebSdk);

    expect(Object.entries(sdk).length).toBe(8);
  });

  test('it should not reinitialize when loaded twice', async ({ page }) => {
    await page.goto(CDN_TEST_URL);

    const result = await page.evaluate(() => {
      const firstRef = window.EmbraceWebSdk;

      // Simulate loading the script again by creating another script element
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = '/embrace-web-sdk.js';
        script.onload = () => {
          resolve(window.EmbraceWebSdk === firstRef);
        };
        document.body.appendChild(script);
      });
    });

    expect(result).toBe(true);
  });
});
