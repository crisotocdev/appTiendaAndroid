import * as SQLite from 'expo-sqlite';
import dayjs from 'dayjs';

export type Product = {
  id?: number;
  name: string;
  brand?: string;
  sku?: string;
  category?: string;
  unit?: 'pcs' | 'kg' | 'lt' | 'pack' | string;
  minStock?: number;
  photoUri?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type Movement = {                     // NEW: tipo para historial
  id?: number;
  productId: number;
  type: 'IN' | 'OUT' | 'ADJUST';
  qty: number;          // cantidad positiva (la dirección la da type)
  note?: string | null;
  createdAt?: string;   // ISO
};

export type Batch = {
  id?: number;
  productId: number;
  quantity: number;
  expiryDate?: string | null; // YYYY-MM-DD
  purchaseDate?: string | null;
  cost?: number | null;
};

let db: SQLite.SQLiteDatabase | null = null;

/** Abre la DB (SDK 53/54) y crea tablas si no existen */
export async function initDb(): Promise<void> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('inventario.db');

    // Ajustes recomendados para mejor rendimiento y consistencia
    await db.execAsync('PRAGMA journal_mode = WAL;'); // Escrituras concurrentes
    await db.execAsync('PRAGMA foreign_keys = ON;');  // Forzar reglas de FK

    // Tabla de productos
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        brand TEXT,
        sku TEXT,
        category TEXT,
        unit TEXT,
        minStock INTEGER DEFAULT 0,
        photoUri TEXT,
        createdAt TEXT,
        updatedAt TEXT
      );
    `);

    // Tabla de lotes (batches) asociados a cada producto
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId INTEGER NOT NULL,
        quantity REAL NOT NULL,
        expiryDate TEXT,
        purchaseDate TEXT,
        cost REAL,
        FOREIGN KEY(productId) REFERENCES products(id) ON DELETE CASCADE
      );
    `);

    // NEW: Tabla de movimientos (historial/kardex)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId INTEGER NOT NULL,
        type TEXT NOT NULL,           -- 'IN' | 'OUT' | 'ADJUST'
        qty REAL NOT NULL,            -- siempre positiva
        note TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(productId) REFERENCES products(id) ON DELETE CASCADE
      );
    `);
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_mov_product ON movements(productId);`);  // NEW
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_mov_date ON movements(createdAt);`);     // NEW
  }
}

/** Obtiene la DB y si no existe la inicializa */
async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    await initDb();
  }
  return db!;
}

/* ---------- CRUD ---------- */

/** Agregar un producto */
export async function addProduct(p: Product): Promise<number> {
  const d = await getDb();
  const now = new Date().toISOString();

  const res = await d.runAsync(
    `INSERT INTO products
     (name, brand, sku, category, unit, minStock, photoUri, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.name,
      p.brand ?? null,
      p.sku ?? null,
      p.category ?? null,
      p.unit ?? null,
      p.minStock ?? 0,
      p.photoUri ?? null,
      now,
      now,
    ]
  );

  return Number(res.lastInsertRowId);
}

/** Agregar un lote para un producto */
export async function addBatch(b: Batch): Promise<number> {
  const d = await getDb();
  const res = await d.runAsync(
    `INSERT INTO batches
     (productId, quantity, expiryDate, purchaseDate, cost)
     VALUES (?, ?, ?, ?, ?)`,
    [
      b.productId,
      b.quantity,
      b.expiryDate ?? null,
      b.purchaseDate ?? null,
      b.cost ?? null,
    ]
  );
  return Number(res.lastInsertRowId);
}

/** Eliminar un producto por ID
 *  - Gracias al FOREIGN KEY con `ON DELETE CASCADE`, también se eliminan sus lotes
 */
export async function deleteProduct(id: number): Promise<void> {
  const d = await getDb();
  await d.runAsync('DELETE FROM products WHERE id = ?', [id]);
}

/* ---------- MOVEMENTS API (NEW) ---------- */

export async function addMovement(m: Movement): Promise<number> {     // NEW
  const d = await getDb();
  const now = new Date().toISOString();
  const res = await d.runAsync(
    `INSERT INTO movements (productId, type, qty, note, createdAt)
     VALUES (?, ?, ?, ?, ?)`,
    [m.productId, m.type, Math.abs(m.qty), m.note ?? null, now]
  );
  return Number(res.lastInsertRowId);
}

export async function getMovements(productId: number): Promise<Movement[]> {  // NEW
  const d = await getDb();
  const rows = await d.getAllAsync<Movement>(
    `SELECT * FROM movements
     WHERE productId = ?
     ORDER BY datetime(createdAt) DESC`,
    [productId]
  );
  return rows;
}

/** Ajustar el stock de un producto
 *  - `delta` puede ser positivo (+1, +5) o negativo (-1, -3)
 *  - Se crea un "batch" virtual que refleja el ajuste (no se edita un campo total directamente)
 *  - Antes de descontar, valida que el stock actual no quede negativo
 */
export async function adjustStock(productId: number, delta: number): Promise<void> {
  const d = await getDb();

  // Calcular el stock actual
  const current = await d.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(quantity), 0) AS total FROM batches WHERE productId = ?',
    [productId]
  );
  const totalNow = Number(current?.total ?? 0);

  // Evitar stock negativo → si delta es muy grande en negativo, lo limita
  const allowedDelta = Math.max(-totalNow, delta);

  // Si el ajuste no cambia nada, salir
  if (allowedDelta === 0) return;

  // Insertar un lote con el ajuste
  await d.runAsync(
    `INSERT INTO batches (productId, quantity, expiryDate, purchaseDate, cost)
     VALUES (?, ?, NULL, NULL, NULL)`,
    [productId, allowedDelta]
  );

  // NEW: Registrar movimiento en historial
  const type: Movement['type'] =
    allowedDelta > 0 ? 'IN' : (delta < 0 ? 'OUT' : 'ADJUST');

  await addMovement({
    productId,
    type,
    qty: Math.abs(allowedDelta),
    note: null,
  });
}

/* ---------- CONSULTAS ---------- */

export type ProductRow = Product & {
  totalQty: number;
  nextExpiry: string | null;
  status: 'ok' | 'low' | 'expiring' | 'expired';
  daysToExpiry: number | null;
};

/** Listar todos los productos con su stock calculado y estado */
export async function listProducts(): Promise<ProductRow[]> {
  const d = await getDb();

  const rows = await d.getAllAsync<{
    id: number;
    name: string;
    brand: string | null;
    sku: string | null;
    category: string | null;
    unit: string | null;
    minStock: number | null;
    photoUri: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    totalQty: number | null;
    nextExpiry: string | null;
  }>(`
    SELECT p.*,
           COALESCE(SUM(b.quantity), 0) AS totalQty,
           MIN(b.expiryDate) AS nextExpiry
    FROM products p
    LEFT JOIN batches b ON b.productId = p.id
    GROUP BY p.id
    ORDER BY p.name ASC;
  `);

  const today = dayjs().startOf('day');
  const out: ProductRow[] = [];

  for (const r of rows) {
    let status: ProductRow['status'] = 'ok';
    let daysToExpiry: number | null = null;

    // Calcular vencimiento más cercano
    if (r.nextExpiry) {
      const dExp = dayjs(r.nextExpiry);
      daysToExpiry = dExp.diff(today, 'day');
      if (daysToExpiry < 0) status = 'expired';
      else if (daysToExpiry <= 7) status = 'expiring';
    }

    // Chequear stock mínimo
    const total = Number(r.totalQty ?? 0);
    if (r.minStock != null && total < r.minStock) {
      status =
        status === 'expired'
          ? 'expired'
          : status === 'expiring'
          ? 'expiring'
          : 'low';
    }

    out.push({
      id: r.id,
      name: r.name,
      brand: r.brand ?? undefined,
      sku: r.sku ?? undefined,
      category: r.category ?? undefined,
      unit: r.unit ?? undefined,
      minStock: r.minStock ?? undefined,
      photoUri: r.photoUri ?? undefined,
      createdAt: r.createdAt ?? undefined,
      updatedAt: r.updatedAt ?? undefined,
      totalQty: total,
      nextExpiry: r.nextExpiry ?? null,
      status,
      daysToExpiry,
    });
  }

  return out;
}
