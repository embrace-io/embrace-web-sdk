export interface EmbraceNetworkSpanProcessorArgs {
  /** Endpoints the SDK's exporters send to. Network spans to these endpoints are tagged as `sys.export_request` instead of `perf.network_request`. */
  exporterEndpoints?: readonly string[];
}
