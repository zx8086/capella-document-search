export type SearchDocuments = {
    readonly "input": SearchDocuments$input;
    readonly "result": SearchDocuments$result | undefined;
};

export type SearchDocuments$result = {
    readonly searchDocuments: ({
        readonly bucket: string;
        readonly scope: string;
        readonly collection: string;
        readonly data: any | null;
        readonly timeTaken: number;
    })[];
};

type BucketScopeCollection = {
    bucket: string;
    scope: string;
    collection: string;
};

export type SearchDocuments$input = {
    collections: (BucketScopeCollection)[];
    keys: (string)[];
};

export type SearchDocuments$artifact = {
    "name": "SearchDocuments";
    "kind": "HoudiniQuery";
    "hash": "c7b95fedd6f823a1aa7574be84db3b96a08116f59a19b5a882a8578365c7e5b3";
    "raw": `query SearchDocuments($collections: [BucketScopeCollection!]!, $keys: [String!]!) {
  searchDocuments(collections: $collections, keys: $keys) {
    bucket
    scope
    collection
    data
    timeTaken
  }
}
`;
    "rootType": "Query";
    "stripVariables": [];
    "selection": {
        "fields": {
            "searchDocuments": {
                "type": "SearchResult";
                "keyRaw": "searchDocuments(collections: $collections, keys: $keys)";
                "selection": {
                    "fields": {
                        "bucket": {
                            "type": "String";
                            "keyRaw": "bucket";
                            "visible": true;
                        };
                        "scope": {
                            "type": "String";
                            "keyRaw": "scope";
                            "visible": true;
                        };
                        "collection": {
                            "type": "String";
                            "keyRaw": "collection";
                            "visible": true;
                        };
                        "data": {
                            "type": "JSON";
                            "keyRaw": "data";
                            "nullable": true;
                            "visible": true;
                        };
                        "timeTaken": {
                            "type": "Float";
                            "keyRaw": "timeTaken";
                            "visible": true;
                        };
                    };
                };
                "visible": true;
            };
        };
    };
    "pluginData": {
        "houdini-svelte": {};
    };
    "input": {
        "fields": {
            "collections": "BucketScopeCollection";
            "keys": "String";
        };
        "types": {
            "BucketScopeCollection": {
                "bucket": "String";
                "scope": "String";
                "collection": "String";
            };
        };
        "defaults": {};
        "runtimeScalars": {};
    };
    "policy": "CacheOrNetwork";
    "partial": false;
};