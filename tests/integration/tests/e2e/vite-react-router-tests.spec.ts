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
  test('navigates forward via link clicks and produces a session span', async ({
    page,
    loadHome,
    triggerSessionEnd,
    validateThatUserSessionEnded,
  }) => {
    await loadHome();
    await test
      .expect(page.getByRole('heading', { name: 'Home' }))
      .toBeVisible();

    await page.getByRole('link', { name: 'Products' }).click();
    await test
      .expect(page.getByRole('heading', { name: 'Products' }))
      .toBeVisible();

    await page.getByRole('link', { name: 'Product One' }).click();
    await test
      .expect(page.getByRole('heading', { name: 'Product 1' }))
      .toBeVisible();

    await triggerSessionEnd();
    await validateThatUserSessionEnded();
  });

  test('navigates back via the browser back button and produces a session span', async ({
    page,
    loadHome,
    triggerSessionEnd,
    validateThatUserSessionEnded,
  }) => {
    await loadHome();

    await page.getByRole('link', { name: 'Products' }).click();
    await test
      .expect(page.getByRole('heading', { name: 'Products' }))
      .toBeVisible();

    await page.getByRole('link', { name: 'Product One' }).click();
    await test
      .expect(page.getByRole('heading', { name: 'Product 1' }))
      .toBeVisible();

    await page.goBack();
    await test
      .expect(page.getByRole('heading', { name: 'Products' }))
      .toBeVisible();

    await triggerSessionEnd();
    await validateThatUserSessionEnded();
  });

  test('navigates forward via the browser forward button and produces a session span', async ({
    page,
    loadHome,
    triggerSessionEnd,
    validateThatUserSessionEnded,
  }) => {
    await loadHome();

    await page.getByRole('link', { name: 'Products' }).click();
    await test
      .expect(page.getByRole('heading', { name: 'Products' }))
      .toBeVisible();

    await page.getByRole('link', { name: 'Product One' }).click();
    await test
      .expect(page.getByRole('heading', { name: 'Product 1' }))
      .toBeVisible();

    await page.goBack();
    await test
      .expect(page.getByRole('heading', { name: 'Products' }))
      .toBeVisible();

    await page.goForward();
    await test
      .expect(page.getByRole('heading', { name: 'Product 1' }))
      .toBeVisible();

    await triggerSessionEnd();
    await validateThatUserSessionEnded();
  });
});
