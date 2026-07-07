import initSqlJs, { type Database as SqlJsDb } from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "..", "navi.db");

let db: SqlJsDb | null = null;
let initPromise: Promise<SqlJsDb> | null = null;

async function initDb(): Promise<SqlJsDb> {
  const SQL = await initSqlJs();
  let buffer: Buffer | undefined;
  try {
    buffer = fs.readFileSync(DB_PATH);
  } catch {
    // File doesn't exist yet — will create new
  }

  const database = buffer ? new SQL.Database(buffer) : new SQL.Database();
  database.run("PRAGMA journal_mode = WAL");
  runSchema(database);
  saveDb(database);
  return database;
}

function runSchema(database: SqlJsDb): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS campuses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS buildings (
      id TEXT NOT NULL,
      campus_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      description TEXT DEFAULT '',
      center_lat REAL NOT NULL,
      center_lng REAL NOT NULL,
      outline TEXT,
      floors INTEGER DEFAULT 1,
      color TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (id, campus_id)
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT NOT NULL,
      campus_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      building_id TEXT,
      component_id TEXT,
      floor INTEGER DEFAULT 0,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      has_qr INTEGER DEFAULT 0,
      has_panorama INTEGER DEFAULT 0,
      metadata TEXT,
      PRIMARY KEY (id, campus_id)
    );

    CREATE TABLE IF NOT EXISTS edges (
      id TEXT NOT NULL,
      campus_id TEXT NOT NULL,
      from_node TEXT NOT NULL,
      to_node TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'walkway',
      distance REAL NOT NULL DEFAULT 0,
      metadata TEXT,
      PRIMARY KEY (id, campus_id)
    );

    CREATE TABLE IF NOT EXISTS components (
      id TEXT NOT NULL,
      campus_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      building_id TEXT NOT NULL,
      floor INTEGER DEFAULT 0,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      dimensions TEXT,
      metadata TEXT,
      PRIMARY KEY (id, campus_id)
    );

    CREATE TABLE IF NOT EXISTS graph_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campus_id TEXT NOT NULL,
      data TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0.0',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function saveDb(database: SqlJsDb): void {
  const data = database.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function queryAll(db: SqlJsDb, sql: string, params: any[]): any[] {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export async function getDb(): Promise<SqlJsDb> {
  if (!db) {
    if (!initPromise) {
      initPromise = initDb();
    }
    db = await initPromise;
  }
  return db;
}

export { queryAll };

export function persistDb(): void {
  if (db) {
    saveDb(db);
  }
}

export function closeDb(): void {
  if (db) {
    saveDb(db);
    db.close();
    db = null;
    initPromise = null;
  }
}
