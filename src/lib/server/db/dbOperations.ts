/* src/lib/server/db/dbOperations.ts */

import { Database, type Statement } from "bun:sqlite";
import { log, err } from "$utils/unifiedLogger";

// Create a singleton instance at the module level
let dbInstance: Database | null = null;
let statementsInitialized = false;

// Prepared statements as module-level variables
let insertScopeStmt: Statement | null = null;
let insertCollectionStmt: Statement | null = null;
let insertTooltipStmt: Statement | null = null;
let getTooltipStmt: Statement | null = null;
let getAllCollectionsStmt: Statement | null = null;
let getFormattedCollectionsStmt: Statement | null = null;
let getAllCollectionsWithTooltipsStmt: Statement | null = null;

export function initializeDatabase() {
    if (!dbInstance) {
        log("Creating new in-memory database instance");
        dbInstance = new Database(":memory:");
        
        // Create tables
        dbInstance.exec(`
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
    }

    // Initialize prepared statements only once
    if (!statementsInitialized) {
        log("Initializing prepared statements");
        insertScopeStmt = dbInstance.prepare(
            "INSERT OR REPLACE INTO scopes (bucket, scope_name) VALUES (?, ?)"
        );
        insertCollectionStmt = dbInstance.prepare(
            "INSERT OR REPLACE INTO collections (bucket, scope_name, collection_name) VALUES (?, ?, ?)"
        );
        insertTooltipStmt = dbInstance.prepare(
            "INSERT OR REPLACE INTO tooltips (bucket, scope_name, collection_name, tooltip_content) VALUES (?, ?, ?, ?)"
        );
        getTooltipStmt = dbInstance.prepare(
            "SELECT tooltip_content FROM tooltips WHERE bucket = ? AND scope_name = ? AND collection_name = ?"
        );
        getAllCollectionsStmt = dbInstance.prepare(`
            SELECT c.bucket, c.scope_name, c.collection_name
            FROM collections c
            JOIN scopes s ON c.bucket = s.bucket AND c.scope_name = s.scope_name
        `);
        getFormattedCollectionsStmt = dbInstance.prepare(`
            SELECT c.bucket, c.scope_name as scope, c.collection_name as collection
            FROM collections c
            JOIN scopes s ON c.bucket = s.bucket AND c.scope_name = s.scope_name
            ORDER BY c.bucket, c.scope_name, c.collection_name
        `);
        getAllCollectionsWithTooltipsStmt = dbInstance.prepare(`
            SELECT c.bucket, c.scope_name, c.collection_name, t.tooltip_content
            FROM collections c
            LEFT JOIN tooltips t ON c.bucket = t.bucket AND c.scope_name = t.scope_name AND c.collection_name = t.collection_name
            JOIN scopes s ON c.bucket = s.bucket AND c.scope_name = s.scope_name
        `);
        statementsInitialized = true;
        log("Database and prepared statements initialized");
    }

    return dbInstance;
}

export function getDatabase() {
    if (!dbInstance) {
        return initializeDatabase();
    }
    return dbInstance;
}

export function insertScope(bucket: string, scopeName: string) {
    if (!insertScopeStmt) {
        throw new Error("Database not initialized");
    }
    const result = insertScopeStmt.run(bucket, scopeName);
    log(`Inserted scope: ${bucket}.${scopeName}, Result:`, { meta: { result } });
    return result;
}

export function insertCollection(
    bucket: string,
    scopeName: string,
    collectionName: string,
) {
    if (!insertCollectionStmt) {
        throw new Error("Database not initialized");
    }
    const result = insertCollectionStmt.run(bucket, scopeName, collectionName);
    log(
        `Inserted collection: ${bucket}.${scopeName}.${collectionName}, Result:`,
        { meta: { result } },
    );
    return result;
}

export function getAllCollections() {
    if (!getAllCollectionsStmt) {
        throw new Error("Database not initialized");
    }
    const results = getAllCollectionsStmt.all();
    log("Retrieved collections - function getAllCollections:", {
        meta: { results },
    });
    return results;
}

export function getFormattedCollections() {
    if (!getFormattedCollectionsStmt) {
        throw new Error("Database not initialized");
    }
    const results = getFormattedCollectionsStmt.all() as Array<{
        bucket: string;
        scope: string;
        collection: string;
    }>;
    log("Retrieved formatted collections - function getFormattedCollections:");
    return results;
}

export function insertTooltip(
    bucket: string,
    scopeName: string,
    collectionName: string,
    tooltipContent: string,
) {
    if (!insertTooltipStmt) {
        throw new Error("Database not initialized");
    }
    const result = insertTooltipStmt.run(
        bucket,
        scopeName,
        collectionName,
        tooltipContent,
    );
    log(
        `Inserted tooltip for: ${bucket}.${scopeName}.${collectionName}, Result:`,
        { meta: { result } },
    );
    return result;
}

export function getTooltip(
    bucket: string,
    scopeName: string,
    collectionName: string,
) {
    if (!getTooltipStmt) {
        throw new Error("Database not initialized");
    }
    const result = getTooltipStmt.get(bucket, scopeName, collectionName) as {
        tooltip_content: string | null;
    } | null;
    return result ? result.tooltip_content : null;
}

export function getAllCollectionsWithTooltips() {
    if (!getAllCollectionsWithTooltipsStmt) {
        throw new Error("Database not initialized");
    }
    const results = getAllCollectionsWithTooltipsStmt.all();
    log(
        "Retrieved collections with tooltips - function getAllCollectionsWithTooltips:",
    );
    return results;
} 