import { SearchDocumentsStore } from "../plugins/houdini-svelte/stores/SearchDocuments";
import type { Cache as InternalCache } from "./cache/cache";
import type { CacheTypeDef } from "./generated";
import { Cache } from "./public";
export * from "./client";
export * from "./lib";

export function graphql(
    str: "\n  query SearchDocuments($collections: [BucketScopeCollection!]!, $keys: [String!]!) {\n    searchDocuments(collections: $collections, keys: $keys) {\n      bucket\n      scope\n      collection\n      data\n      timeTaken\n    }\n  }\n"
): SearchDocumentsStore;

export declare function graphql<_Payload, _Result = _Payload>(str: TemplateStringsArray): _Result;
export declare const cache: Cache<CacheTypeDef>;
export declare function getCache(): InternalCache;