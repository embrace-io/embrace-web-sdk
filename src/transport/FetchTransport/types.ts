export interface FetchRequestParameters {
  url: string;
  headers: Record<string, string>;
  compression: 'gzip' | 'none';
}
