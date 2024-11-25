export const createDatabase = () => {
  if (typeof process !== 'undefined' && process.versions && process.versions.bun) {
    // Bun environment
    return import('bun:sqlite').then(({ Database }) => new Database('your-database.sqlite'));
  } else {
    // Node.js environment (during build)
    return {
      // Provide mock implementations for build time
      prepare: () => ({ get: () => null, all: () => [], run: () => {} }),
      query: () => null,
      // Add other methods you use
    };
  }
}; 