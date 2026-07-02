import * as chai from 'chai';
import { flushSync } from 'react-dom';
import type { PageManager } from '../../../src/api-page/manager/types.ts';
import { UUID_PATTERN } from '../constants.ts';
import { waitFor } from './reactTestUtils.ts';

const { expect } = chai;

type ReactRouterTestOptions = {
  pageManager: PageManager;
  rootElement: Element;
};

export const runReactRouterTest = async ({
  pageManager,
  rootElement,
}: ReactRouterTestOptions) => {
  expect(pageManager.getCurrentRoute()).to.deep.equal({
    path: '/',
    url: '/',
  });
  expect(pageManager.getCurrentPageId()).to.match(UUID_PATTERN);

  const goToProductButton = rootElement.querySelector('.to-product-button');
  expect(goToProductButton).to.not.be.null;
  expect(goToProductButton?.textContent).to.equal('Go to Product Page');

  flushSync(() => {
    goToProductButton?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
  });

  await waitFor(() => {
    const h1 = rootElement.querySelector('h1');

    return h1 !== null && h1.textContent === 'Product';
  });

  const productHeading = rootElement.querySelector('h1');
  expect(productHeading?.textContent).to.equal('Product');

  expect(pageManager.getCurrentRoute()?.path).to.equal('/product/:id');

  const goToProductDetailsButton = rootElement.querySelector(
    '.to-product-details-button',
  );
  expect(goToProductDetailsButton).to.not.be.null;
  expect(goToProductDetailsButton?.textContent).to.equal(
    'Go to Product Details',
  );

  flushSync(() => {
    goToProductDetailsButton?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
  });

  await waitFor(() => {
    return pageManager.getCurrentRoute()?.path === '/product/:id/details';
  });

  await waitFor(() => {
    const h2 = rootElement.querySelector('h2');

    return h2 !== null && h2.textContent === 'Product Details';
  });

  const toRelativeDetailsButton = rootElement.querySelector(
    '.to-relative-product-details-button',
  );
  expect(toRelativeDetailsButton).to.not.be.null;

  flushSync(() => {
    toRelativeDetailsButton?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
  });

  await waitFor(
    () => pageManager.getCurrentRoute()?.path === '/product/:id/more-details',
  );
};
