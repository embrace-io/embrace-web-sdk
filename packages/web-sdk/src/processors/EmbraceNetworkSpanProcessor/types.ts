export interface EmbraceNetworkSpanProcessorArgs {
  /** Exact URLs whose network spans get `emb.is_embrace_export` set to true. */
  embraceExporterEndpoints?: readonly string[];
}
