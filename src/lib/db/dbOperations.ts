/* src/lib/db/dbOperations.ts */

import { Database } from "bun:sqlite";

let db: Database | null = null;

export function initializeDatabase() {
  if (!db) {
    console.log("Initializing database");
    db = new Database("capella-document-search.sqlite", { create: true });
    db.exec(`
      CREATE TABLE IF NOT EXISTS scopes (
        bucket TEXT NOT NULL,
        scope_name TEXT NOT NULL,
        PRIMARY KEY (bucket, scope_name)
      );
      CREATE TABLE IF NOT EXISTS collections (
        bucket TEXT NOT NULL,
        scope_name TEXT NOT NULL,
        collection_name TEXT NOT NULL,
        PRIMARY KEY (bucket, scope_name, collection_name),
        FOREIGN KEY (bucket, scope_name) REFERENCES scopes (bucket, scope_name)
      );
      CREATE TABLE IF NOT EXISTS tooltips (
        bucket TEXT NOT NULL,
        scope_name TEXT NOT NULL,
        collection_name TEXT NOT NULL,
        tooltip_content TEXT,
        PRIMARY KEY (bucket, scope_name, collection_name),
        FOREIGN KEY (bucket, scope_name, collection_name)
        REFERENCES collections (bucket, scope_name, collection_name)
      );
    `);
    console.log("Database initialized");
  }
  return db;
}

export function getDatabase() {
  if (!db) {
    return initializeDatabase();
  }
  return db;
}

export function insertScope(bucket: string, scopeName: string) {
  const db = getDatabase();
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO scopes (bucket, scope_name) VALUES (?, ?)",
  );
  const result = stmt.run(bucket, scopeName);
  console.log(`Inserted scope: ${bucket}.${scopeName}, Result:`, result);
  return result;
}

export function insertCollection(
  bucket: string,
  scopeName: string,
  collectionName: string,
) {
  const db = getDatabase();
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO collections (bucket, scope_name, collection_name) VALUES (?, ?, ?)",
  );
  const result = stmt.run(bucket, scopeName, collectionName);
  console.log(
    `Inserted collection: ${bucket}.${scopeName}.${collectionName}, Result:`,
    result,
  );
  return result;
}

export function getAllCollections() {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT c.bucket, c.scope_name, c.collection_name
    FROM collections c
    JOIN scopes s ON c.bucket = s.bucket AND c.scope_name = s.scope_name
  `);
  const results = stmt.all();
  console.log("Retrieved collections:", results);
  return results;
}

export function getFormattedCollections() {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT c.bucket, c.scope_name as scope, c.collection_name as collection
    FROM collections c
    JOIN scopes s ON c.bucket = s.bucket AND c.scope_name = s.scope_name
    ORDER BY c.bucket, c.scope_name, c.collection_name
  `);
  const results = stmt.all() as Array<{
    bucket: string;
    scope: string;
    collection: string;
  }>;
  console.log("Retrieved formatted collections:", results);
  return results;
}

export function insertTooltip(
  bucket: string,
  scopeName: string,
  collectionName: string,
  tooltipContent: string,
) {
  const db = getDatabase();
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO tooltips (bucket, scope_name, collection_name, tooltip_content) VALUES (?, ?, ?, ?)",
  );
  const result = stmt.run(bucket, scopeName, collectionName, tooltipContent);
  console.log(
    `Inserted tooltip for: ${bucket}.${scopeName}.${collectionName}, Result:`,
    result,
  );
  return result;
}

export function getTooltip(
  bucket: string,
  scopeName: string,
  collectionName: string,
) {
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT tooltip_content FROM tooltips WHERE bucket = ? AND scope_name = ? AND collection_name = ?",
  );
  const result = stmt.get(bucket, scopeName, collectionName);
  return result ? result.tooltip_content : null;
}

export function getAllCollectionsWithTooltips() {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT c.bucket, c.scope_name, c.collection_name, t.tooltip_content
    FROM collections c
    LEFT JOIN tooltips t ON c.bucket = t.bucket AND c.scope_name = t.scope_name AND c.collection_name = t.collection_name
    JOIN scopes s ON c.bucket = s.bucket AND c.scope_name = s.scope_name
  `);
  const results = stmt.all();
  console.log("Retrieved collections with tooltips:", results);
  return results;
}
