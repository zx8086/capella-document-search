/** @type {import('houdini').ConfigFile} */
const config = {
  schemaPath: "./schema.graphql",
  sourceGlob: "src/**/*.{svelte,gql,graphql}",
  module: "esm",
  framework: "svelte-kit",
  apiUrl: "https://capellaql.prd.shared-services.eu.pvh.cloud/graphql",
  client: "./src/client.js",
  plugins: {
    "houdini-svelte": {},
  },
  scalars: {
    // Define any custom scalars that match your GraphQL schema
    JSON: {
      type: "any", // Using 'any' is typical for JSON in TypeScript
    },
  },
};

export default config;
