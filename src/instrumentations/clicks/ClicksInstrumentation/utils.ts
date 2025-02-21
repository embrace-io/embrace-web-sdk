const MAX_INNER_TEXT = 30;

export const getHTMLElementFriendlyName = (element: HTMLElement) => {
  const nodeName = element.nodeName.toLowerCase();
  const innerText = element.innerText.substring(0, MAX_INNER_TEXT);
  const ellipsis = element.innerText.length > MAX_INNER_TEXT ? '...' : '';
  return `<${nodeName} class="${element.className}">${innerText}${ellipsis}</${nodeName}>`;
};
