// 간단한 로컬 데이터베이스(Node 내장 SQLite). 조회 결과·분석 결과·상담 신청을 저장한다.
import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS property_lookups (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      lookup_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      answers TEXT NOT NULL,
      overrides TEXT NOT NULL,
      target TEXT NOT NULL,
      result TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS consultation_requests (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL,
      option_id TEXT NOT NULL,
      partner_type TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      status TEXT NOT NULL,
      shared_fields TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      address_shared TEXT,
      message TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

export const newId = () => crypto.randomUUID();
