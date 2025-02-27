export interface BulkAddEventListenerArgs {
  target: EventTarget;
  events: string[];
  callback: EventListener;
}
