import testWithMockApi from '../../utils/test-with-mock-api.ts';

const BASE_URL = 'http://localhost:3016';

type SPAFixture = {
  loadHome: () => Promise<void>;
  triggerSessionEnd: () => Promise<void>;
};

const test = testWithMockApi.extend<SPAFixture>({
  loadHome: async ({ page }, use) => {
    await use(async () => {
      await page.goto(BASE_URL);
      await page.waitForFunction(
        () => window.EMBRACE_CURRENT_USER_SESSION_ID !== null,
      );
    });
  },

  triggerSessionEnd: async ({ page }, use) => {
    await use(async () => {
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          value: 'hidden',
          writable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    });
  },
});

test.describe('Vite React Router SPA Navigation', () => {
  test('navigates forward via link clicks and ends a session part per navigation', async ({
    page,
    loadHome,
    triggerSessionEnd,
    validateThatSessionPartEnded,
  }) => {
    // Skipped: each soft navigation should end the current session part, but
    // the soft navigation instrumentation is not yet implemented
    // biome-ignore lint/suspicious/noSkippedTests: soft navigation instrumentation not yet implemented
    test.skip(true, 'soft navigation instrumentation not yet implemented');

    await loadHome();
    await test
      .expect(page.getByRole('heading', { name: 'Home' }))
      .toBeVisible();

    await page.getByRole('link', { name: 'Products' }).click();
    await test
      .expect(page.getByRole('heading', { name: 'Products' }))
      .toBeVisible();
    await validateThatSessionPartEnded();

    await page.getByRole('link', { name: 'Product One' }).click();
    await test
      .expect(page.getByRole('heading', { name: 'Product 1' }))
      .toBeVisible();
    await validateThatSessionPartEnded();

    await triggerSessionEnd();
    await validateThatSessionPartEnded();
  });

  test('navigates back via the browser back button and ends a session part per navigation', async ({
    page,
    loadHome,
    triggerSessionEnd,
    validateThatSessionPartEnded,
  }) => {
    // Skipped: each soft navigation should end the current session part, but
    // the soft navigation instrumentation is not yet implemented
    // biome-ignore lint/suspicious/noSkippedTests: soft navigation instrumentation not yet implemented
    test.skip(true, 'soft navigation instrumentation not yet implemented');

    await loadHome();

    await page.getByRole('link', { name: 'Products' }).click();
    await test
      .expect(page.getByRole('heading', { name: 'Products' }))
      .toBeVisible();
    await validateThatSessionPartEnded();

    await page.getByRole('link', { name: 'Product One' }).click();
    await test
      .expect(page.getByRole('heading', { name: 'Product 1' }))
      .toBeVisible();
    await validateThatSessionPartEnded();

    await page.goBack();
    await test
      .expect(page.getByRole('heading', { name: 'Products' }))
      .toBeVisible();
    await validateThatSessionPartEnded();

    await triggerSessionEnd();
    await validateThatSessionPartEnded();
  });

  test('navigates forward via the browser forward button and ends a session part per navigation', async ({
    page,
    loadHome,
    triggerSessionEnd,
    validateThatSessionPartEnded,
  }) => {
    // Skipped: each soft navigation should end the current session part, but
    // the soft navigation instrumentation is not yet implemented
    // biome-ignore lint/suspicious/noSkippedTests: soft navigation instrumentation not yet implemented
    test.skip(true, 'soft navigation instrumentation not yet implemented');

    await loadHome();

    await page.getByRole('link', { name: 'Products' }).click();
    await test
      .expect(page.getByRole('heading', { name: 'Products' }))
      .toBeVisible();
    await validateThatSessionPartEnded();

    await page.getByRole('link', { name: 'Product One' }).click();
    await test
      .expect(page.getByRole('heading', { name: 'Product 1' }))
      .toBeVisible();
    await validateThatSessionPartEnded();

    await page.goBack();
    await test
      .expect(page.getByRole('heading', { name: 'Products' }))
      .toBeVisible();
    await validateThatSessionPartEnded();

    await page.goForward();
    await test
      .expect(page.getByRole('heading', { name: 'Product 1' }))
      .toBeVisible();
    await validateThatSessionPartEnded();

    await triggerSessionEnd();
    await validateThatSessionPartEnded();
  });
});
