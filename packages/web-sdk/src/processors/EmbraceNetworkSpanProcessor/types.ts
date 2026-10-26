export interface EmbraceNetworkSpanProcessorArgs {
  /** Exact URLs whose network spans get emb.type `sys.export_request` instead of `perf.network_request`. */
  embraceExporterEndpoints?: readonly string[];
}
