import { testWithMockApi, extendedMockApiTestExpect } from '../utils/index.js';

type NextLatestFixture = {
  navigateAndWaitUntilReady: () => Promise<void>;
};

const test = testWithMockApi.extend<NextLatestFixture>({
  navigateAndWaitUntilReady: async ({ page }, use) => {
    await use(async () => {
      await page.goto('http://localhost:3000');
      await page.waitForSelector('h1', { state: 'visible' });
    });
  },
});

test.describe('Next Latest e2e Tests', () => {
  // test('it should load the home page without errors', async ({
  //   page,
  //   navigateAndWaitUntilReady,
  // }) => {
  //   await navigateAndWaitUntilReady();
  //
  //   const title = await page.textContent('h1');
  //   test.expect(title).toBe('Next Test App');
  // });

  test('it should end a session and send a request to the API', async ({
    requests,
    waitForRequest,
    navigateAndWaitUntilReady,
    page,
  }) => {
    await navigateAndWaitUntilReady();
    const button = page.getByRole('button', { name: 'End Session' });
    await button.click();
    await waitForRequest();

    test.expect(requests).toHaveLength(1);
    extendedMockApiTestExpect(requests[0]).toMatchGoldenFile(
      'next-latest-session.json'
    );
  });

  test('it should send a log', async ({
    page,
    requests,
    waitForRequest,
    navigateAndWaitUntilReady,
  }) => {
    await navigateAndWaitUntilReady();

    const button = page.getByRole('button', { name: 'Send Log' });
    await button.click();
    await waitForRequest();

    test.expect(requests).toHaveLength(1);
    extendedMockApiTestExpect(requests[0]).toMatchGoldenFile(
      'next-latest-send-log.json'
    );
  });
});
