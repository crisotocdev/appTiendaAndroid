// src/infrastructure/persistence/sqlite/ensureProductSchema.ts
import * as SQLite from 'expo-sqlite';

export async function ensureProductSchema(db: SQLite.SQLiteDatabase) {
  // 1) Crea tabla si no existe (con todas las columnas que hoy usa la app)
  await db.execAsync?.(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      brand TEXT,
      category TEXT,
      sku TEXT,
      qty INTEGER DEFAULT 0,
      min_stock INTEGER DEFAULT 0,
      next_expiry TEXT,
      photo_url TEXT
    );
  `);

  // 2) ALTERs idempotentes — si la columna existe, capturamos el error y seguimos
  const alters = [
    `ALTER TABLE products ADD COLUMN min_stock INTEGER DEFAULT 0;`,
    `ALTER TABLE products ADD COLUMN next_expiry TEXT;`,
    `ALTER TABLE products ADD COLUMN photo_url TEXT;`,
  ];

  for (const sql of alters) {
    try {
      await db.execAsync?.(sql);
    } catch {
      // columna ya existe: ignorar
    }
  }
}
