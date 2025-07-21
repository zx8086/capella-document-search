/* src/tools/toolUtils.ts */

import { createError } from "../lib/errors";
import type { DocumentContent, ToolResponse } from "../lib/types";

export interface DocumentParams {
  scope: string;
  collection: string;
  id: string;
  content?: DocumentContent;
}

export function validateDocumentParams(params: DocumentParams): void {
  if (!params.scope) {
    throw createError('VALIDATION_ERROR', 'Scope is required');
  }
  if (!params.collection) {
    throw createError('VALIDATION_ERROR', 'Collection is required');
  }
  if (!params.id) {
    throw createError('VALIDATION_ERROR', 'Document ID is required');
  }
}

export function formatDocumentResponse(
  action: string,
  scope: string,
  collection: string,
  id: string,
  content?: DocumentContent
): ToolResponse {
  let text = `✅ Document Operation Successful\nAction: ${action}\nLocation: ${scope}/${collection}/${id}`;
  
  if (content) {
    text += `\nContent:\n${JSON.stringify(content, null, 2)}`;
  }
  
  return {
    content: [{ type: "text" as const, text }]
  };
} 