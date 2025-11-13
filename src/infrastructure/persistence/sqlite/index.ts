// ej: src/infrastructure/persistence/sqlite/index.ts
import * as SQLite from 'expo-sqlite';
import { ensureProductSchema } from './ensureProductSchema';

let db: SQLite.SQLiteDatabase;

export async function getDB() {
  if (!db) {
    db = await SQLite.openDatabaseAsync('inventario.db');
    await ensureProductSchema(db);
  }
  return db;
}
