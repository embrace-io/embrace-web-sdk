export interface BulkRemoveEventListenerArgs {
  target: EventTarget;
  events: string[];
  callback: EventListener;
}
