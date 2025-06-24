import type { TestPage } from '../types/index.js';

const EMBRACE_API_REGEX =
  /https:\/\/[a-z]-[a-z0-9]{5}\.data\.emb-api\.com\/v2\/(spans|logs)/;
const BASE_URL = 'http://localhost:3000';
const PAGES: Record<TestPage, { name: TestPage; path: string }> = {
  baseline: {
    name: 'baseline',
    path: '/stress-test.html',
  },
  'with-sdk': {
    name: 'with-sdk',
    path: '/stress-test-with-sdk.html',
  },
};

export { EMBRACE_API_REGEX, BASE_URL, PAGES };
