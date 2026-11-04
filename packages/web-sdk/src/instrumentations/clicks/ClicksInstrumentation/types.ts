export type ClicksInstrumentationArgs = {
  shouldTrack?: (element: HTMLElement) => boolean;
  innerTextForElement?: (element: HTMLElement) => string;
};
