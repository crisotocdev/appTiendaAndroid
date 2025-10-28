// src/infrastructure/persistence/sqlite/SQLiteClient.ts
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

let _db: SQLiteDatabase | null = null;

/** Abre una vez la DB y garantiza el esquema. */
export function ensureDB(): SQLiteDatabase {
  if (_db) return _db;
  _db = openDatabaseSync('inventory.db');
  initSchema(_db);
  return _db;
}

/** Crea tablas/índices requeridos; SIN inserts por defecto. */
export function initSchema(db = ensureDB()): void {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT,
      name TEXT NOT NULL,
      category TEXT,
      photoUri TEXT,
      photo_url TEXT,
      brand TEXT,
      unit TEXT,
      minStock INTEGER DEFAULT 0,
      qty REAL DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_products_updatedAt ON products(updatedAt);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
  `);
}

/** COMPAT: algunos módulos aún llaman exec(sql [, params]). */
export function exec(sql: string, params?: any[]): void {
  const db = ensureDB();
  if (params && params.length) {
    // Si te pasan params, ejecutamos como sentencia parametrizada.
    db.runSync(sql, params);
  } else {
    // Si NO hay params, permitimos múltiples sentencias separadas por ';'
    db.execSync(sql);
  }
}

/** INSERT/UPDATE/DELETE parametrizado */
export function run(sql: string, params: any[] = []): void {
  const db = ensureDB();
  db.runSync(sql, params);
}

/** Una sola fila o null */
export function one<T = any>(sql: string, params: any[] = []): T | null {
  const db = ensureDB();
  const row = db.getFirstSync(sql, params) as T | undefined;
  return row ?? null;
}

/** Todas las filas ([] si no hay resultados) */
export function all<T = any>(sql: string, params: any[] = []): T[] {
  const db = ensureDB();
  return (db.getAllSync(sql, params) as T[]) ?? [];
}

/** Transacción síncrona */
export function txSync(fn: (db: SQLiteDatabase) => void): void {
  const database = ensureDB();
  database.withTransactionSync(() => {
    fn(database);
  });
}

/** Transacción asíncrona (si alguna parte de tu código la usa). */
export async function txAsync(
  fn: (db: SQLiteDatabase) => Promise<void> | void
): Promise<void> {
  const database = ensureDB();
  await database.withTransactionAsync(async () => {
    await fn(database);
  });
}
