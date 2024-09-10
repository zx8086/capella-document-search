/* src/models/collections.ts */

export interface Collection {
  bucket: string;
  scope_name: string;
  collection_name: string;
  tooltip_content?: string | null;
}

export interface SearchResult {
  bucket: string;
  scope: string;
  collection: string;
  data: any;
  timeTaken: number;
}

export interface CheckResult {
  status: string;
  message?: string;
  responseTime?: number;
}
