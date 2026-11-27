import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import type { ReceivedSpans } from '../../types.ts';

// Pages in one browser context share localStorage, so a write in one fires a
// `storage` event in the other, as between two tabs.
const APP_URL = 'http://localhost:3001/platforms/vite-7/es2015/index.html';
const STATE_KEY = '11111__embrace_user_session_state';
const LAST_ACTIVITY_KEY = '11111__embrace_last_activity';

const openTab = async (context: BrowserContext) => {
  const page = await context.newPage();

  await page.goto(APP_URL);
  await page.waitForFunction(() => Boolean(window.EMBRACE_SDK));

  return page;
};

const hideTab = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });

const userSessionId = (page: Page) =>
  page.evaluate(() => window.EMBRACE_SDK.session.getUserSessionId());

// Internal to the SDK, but the public session API forwards it.
const sessionPartId = (page: Page) =>
  page.evaluate(() =>
    (
      window.EMBRACE_SDK.session as unknown as {
        getSessionPartId: () => string | null;
      }
    ).getSessionPartId(),
  );

const storedUserSession = async (page: Page) => {
  const raw = await page.evaluate(
    (key) => localStorage.getItem(key),
    STATE_KEY,
  );

  return raw === null
    ? null
    : (JSON.parse(raw) as { userSessionId: string; ended?: boolean });
};

const finalCandidate = async (page: Page) => {
  const raw = await page.evaluate(
    (key) => localStorage.getItem(key),
    LAST_ACTIVITY_KEY,
  );

  return raw === null
    ? null
    : (JSON.parse(raw) as { sessionPartId: string | null }).sessionPartId;
};

const receivedPart = async (
  receivedUserSessionId: string,
  receivedSessionPartId: string,
) => {
  const response = await fetch('http://localhost:3001/received-spans');
  const received = (await response.json()) as ReceivedSpans;

  return received[receivedUserSessionId]?.[receivedSessionPartId];
};

const receivedEndReason = async (
  receivedUserSessionId: string,
  receivedSessionPartId: string,
) =>
  (await receivedPart(receivedUserSessionId, receivedSessionPartId))?.endReason;

test.describe('Cross-tab user sessions', () => {
  test('ends the open part when another tab ends the user session, and moves it to the next one', async ({
    context,
  }) => {
    const thisTab = await openTab(context);
    const otherTab = await openTab(context);
    await hideTab(otherTab);
    const firstUserSessionId = (await userSessionId(thisTab)) as string;
    const firstPartId = (await sessionPartId(thisTab)) as string;

    await otherTab.evaluate(() => window.EMBRACE_SDK.session.endUserSession());

    await expect.poll(() => sessionPartId(thisTab)).not.toBe(firstPartId);
    const nextUserSessionId = await userSessionId(thisTab);
    expect(nextUserSessionId).not.toBe(firstUserSessionId);
    expect(await userSessionId(otherTab)).toBe(nextUserSessionId);
    await expect
      .poll(() => receivedEndReason(firstUserSessionId, firstPartId))
      .toBe('user_session_ended');

    // Neither tab keeps reacting to the other's writes.
    const settled = await storedUserSession(thisTab);
    await thisTab.waitForTimeout(1000);
    expect(await storedUserSession(thisTab)).toEqual(settled);
  });

  test('ends the open part without starting another when another tab clears storage', async ({
    context,
  }) => {
    const thisTab = await openTab(context);
    const otherTab = await openTab(context);
    await hideTab(otherTab);
    const firstUserSessionId = (await userSessionId(thisTab)) as string;
    const firstPartId = (await sessionPartId(thisTab)) as string;

    await otherTab.evaluate(() => localStorage.clear());

    await expect.poll(() => sessionPartId(thisTab)).toBeNull();
    await expect
      .poll(() => receivedEndReason(firstUserSessionId, firstPartId))
      .toBe('user_session_ended');
  });

  test("writes the open part's user session back over a stale end of the one it follows", async ({
    context,
  }) => {
    const thisTab = await openTab(context);
    const otherTab = await openTab(context);
    await hideTab(otherTab);
    const previous = await thisTab.evaluate(
      (key) => localStorage.getItem(key) as string,
      STATE_KEY,
    );
    await thisTab.evaluate(() => window.EMBRACE_SDK.session.endUserSession());
    const partId = await sessionPartId(thisTab);
    const current = await storedUserSession(thisTab);

    // Another tab ends the user session this tab already ended, from a copy
    // it read before this tab's end reached it.
    await otherTab.evaluate(
      ([key, raw]) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            ...JSON.parse(raw),
            ended: true,
            endReason: 'max_duration_reached',
            inactivityDeadlineTs: 0,
            userSessionProperties: {},
          }),
        ),
      [STATE_KEY, previous] as const,
    );

    await expect
      .poll(async () => (await storedUserSession(thisTab))?.userSessionId)
      .toBe(current?.userSessionId);
    expect((await storedUserSession(thisTab))?.ended).toBeUndefined();
    expect(await sessionPartId(thisTab)).toBe(partId);
  });

  test('keeps one part final when the tab with the latest activity is hidden and then ends the user session', async ({
    context,
  }) => {
    const thisTab = await openTab(context);
    const firstUserSessionId = (await userSessionId(thisTab)) as string;
    const thisTabPartId = (await sessionPartId(thisTab)) as string;
    // The other tab's part starts last, so it holds the latest activity.
    const otherTab = await openTab(context);
    const otherTabPartId = (await sessionPartId(otherTab)) as string;

    // Its part ends and releases the final candidate, which this tab claims.
    await hideTab(otherTab);
    await expect.poll(() => finalCandidate(thisTab)).toBe(thisTabPartId);
    await otherTab.evaluate(() => window.EMBRACE_SDK.session.endUserSession());

    await expect
      .poll(() => receivedPart(firstUserSessionId, thisTabPartId))
      .toEqual({
        endReason: 'user_session_ended',
        terminationReason: 'manual',
      });
    expect(await receivedPart(firstUserSessionId, otherTabPartId)).toEqual({
      endReason: 'background',
    });
  });
});
