export default {
    "name": "SearchDocuments",
    "kind": "HoudiniQuery",
    "hash": "c7b95fedd6f823a1aa7574be84db3b96a08116f59a19b5a882a8578365c7e5b3",

    "raw": `query SearchDocuments($collections: [BucketScopeCollection!]!, $keys: [String!]!) {
  searchDocuments(collections: $collections, keys: $keys) {
    bucket
    scope
    collection
    data
    timeTaken
  }
}
`,

    "rootType": "Query",
    "stripVariables": [],

    "selection": {
        "fields": {
            "searchDocuments": {
                "type": "SearchResult",
                "keyRaw": "searchDocuments(collections: $collections, keys: $keys)",

                "selection": {
                    "fields": {
                        "bucket": {
                            "type": "String",
                            "keyRaw": "bucket",
                            "visible": true
                        },

                        "scope": {
                            "type": "String",
                            "keyRaw": "scope",
                            "visible": true
                        },

                        "collection": {
                            "type": "String",
                            "keyRaw": "collection",
                            "visible": true
                        },

                        "data": {
                            "type": "JSON",
                            "keyRaw": "data",
                            "nullable": true,
                            "visible": true
                        },

                        "timeTaken": {
                            "type": "Float",
                            "keyRaw": "timeTaken",
                            "visible": true
                        }
                    }
                },

                "visible": true
            }
        }
    },

    "pluginData": {
        "houdini-svelte": {}
    },

    "input": {
        "fields": {
            "collections": "BucketScopeCollection",
            "keys": "String"
        },

        "types": {
            "BucketScopeCollection": {
                "bucket": "String",
                "scope": "String",
                "collection": "String"
            }
        },

        "defaults": {},
        "runtimeScalars": {}
    },

    "policy": "CacheOrNetwork",
    "partial": false
};

"HoudiniHash=77421a6b8aa3ca007b3c5b96f532d0e767f2a582b8a404c1668a381d268d9839";