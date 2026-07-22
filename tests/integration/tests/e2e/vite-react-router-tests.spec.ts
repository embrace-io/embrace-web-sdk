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

  triggerSessionEnd: async ({ setPageVisibility }, use) => {
    await use(async () => {
      await setPageVisibility('hidden');
    });
  },
});

test.describe('Vite React Router SPA Navigation', () => {
  test('navigates forward via link clicks and ends a session part per navigation', async ({
    page,
    loadHome,
    triggerSessionEnd,
    validateThatSessionPartsEnded,
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
    // 2 soft navigations + 1 session end = 3 session parts
    await validateThatSessionPartsEnded(3);
  });

  test('navigates back via the browser back button and ends a session part per navigation', async ({
    page,
    loadHome,
    triggerSessionEnd,
    validateThatSessionPartsEnded,
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
    // 3 soft navigations + 1 session end = 4 session parts
    await validateThatSessionPartsEnded(4);
  });

  test('navigates forward via the browser forward button and ends a session part per navigation', async ({
    page,
    loadHome,
    triggerSessionEnd,
    validateThatSessionPartsEnded,
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
    // 4 soft navigations + 1 session end = 5 session parts
    await validateThatSessionPartsEnded(5);
  });
});
