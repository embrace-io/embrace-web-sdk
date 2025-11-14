import * as chai from 'chai';
import { flushSync } from 'react-dom';
import type { PageManager } from '../../api-page';
import { UUID_PATTERN } from '../constants';
import { waitFor } from './reactTestUtils';

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

  const goToProductButton = rootElement.querySelector('#to-product-button');
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
};
