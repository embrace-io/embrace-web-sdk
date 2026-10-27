/**
 * Resolves `url` against `document.baseURI` into the absolute href the fetch
 * and XHR instrumentations record as `url.full`, so URLs written differently
 * compare equal. A URL that cannot be parsed is returned as-is: fetch rejects
 * it anyway, and callers only compare it, so throwing would gain nothing.
 */
export const resolveUrl = (url: string): string => {
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return url;
  }
};
