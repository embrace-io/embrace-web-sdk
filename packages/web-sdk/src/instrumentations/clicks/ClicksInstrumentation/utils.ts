const MAX_INNER_TEXT = 30;

// A click often lands on an icon or a span inside the element the developer labelled or gave an id.
const INTERACTIVE_ELEMENTS = 'button, a, [role="button"], input, select';

export const getHTMLElementFriendlyName = (
  element: HTMLElement,
  innerText: string,
) => {
  const nodeName = element.nodeName.toLowerCase();
  const truncatedInnerText = innerText.substring(0, MAX_INNER_TEXT);
  const ellipsis = innerText.length > MAX_INNER_TEXT ? '...' : '';
  const className = element.className ? ` class="${element.className}"` : '';
  return `<${nodeName}${className}>${truncatedInnerText}${ellipsis}</${nodeName}>`;
};

export const getClickLabel = (element: HTMLElement): string | undefined =>
  element.closest('[data-click-label]')?.getAttribute('data-click-label') ||
  undefined;

export const getClickElementId = (element: HTMLElement): string | undefined =>
  (element.id ? element : element.closest(INTERACTIVE_ELEMENTS))?.id ||
  undefined;
