export const getHTMLElementFriendlyName = (element: HTMLElement) => {
  const nodeName = element.nodeName.toLowerCase();
  const innerText = element.innerText.substring(0, 50);
  const ellipsis = element.innerText.length > 50 ? '...' : '';
  return `<${nodeName} class="${element.className}">${innerText}${ellipsis}</${nodeName}>`;
};
