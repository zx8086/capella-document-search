import type { Record } from "./public/record";
import { SearchDocuments$result, SearchDocuments$input } from "../artifacts/SearchDocuments";
import { SearchDocumentsStore } from "../plugins/houdini-svelte/stores/SearchDocuments";

type BucketScopeCollection = {
    bucket: string;
    scope: string;
    collection: string;
};

export declare type CacheTypeDef = {
    types: {
        __ROOT__: {
            idFields: {};
            fields: {
                searchDocuments: {
                    type: (Record<CacheTypeDef, "SearchResult">)[];
                    args: {
                        collections: (BucketScopeCollection)[];
                        keys: (string)[];
                    };
                };
            };
            fragments: [];
        };
        SearchResult: {
            idFields: never;
            fields: {
                bucket: {
                    type: string;
                    args: never;
                };
                scope: {
                    type: string;
                    args: never;
                };
                collection: {
                    type: string;
                    args: never;
                };
                data: {
                    type: any | null;
                    args: never;
                };
                timeTaken: {
                    type: number;
                    args: never;
                };
            };
            fragments: [];
        };
    };
    lists: {};
    queries: [[SearchDocumentsStore, SearchDocuments$result, SearchDocuments$input]];
};