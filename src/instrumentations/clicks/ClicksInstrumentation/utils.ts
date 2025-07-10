const MAX_INNER_TEXT = 30;

export const getHTMLElementFriendlyName = (
  element: HTMLElement,
  innerText: string
) => {
  const nodeName = element.nodeName.toLowerCase();
  const truncatedInnerText = innerText.substring(0, MAX_INNER_TEXT);
  const ellipsis = innerText.length > MAX_INNER_TEXT ? '...' : '';
  const className = element.className ? ` class="${element.className}"` : '';
  return `<${nodeName}${className}>${truncatedInnerText}${ellipsis}</${nodeName}>`;
};
