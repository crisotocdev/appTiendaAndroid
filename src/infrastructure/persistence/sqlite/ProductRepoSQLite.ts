// src/infrastructure/persistence/sqlite/ProductRepoSQLite.ts
import dayjs from 'dayjs';
import { customAlphabet } from 'nanoid/non-secure';
import { Product } from '../../../core/domain/entities/Product';
import {
  ProductRepository,
  UpsertProductInput,
} from '../../../core/domain/repositories/ProductRepository';
import { all, one, run } from './SQLiteClient';

const nano = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 16);

// tomar el primer valor definido/truey
const firstDefined = <T>(...xs: T[]): T | undefined => xs.find((v) => !!v);

// Normaliza fechas: acepta DD-MM-YYYY / DD/MM/YYYY / ISO; devuelve YYYY-MM-DD o null
const normalizeDate = (v: any): string | null => {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

// ————————————————————————————————————————————————————————
// MIGRACIÓN SUAVE: crea tabla si falta y agrega columnas si no existen
try {
  run(
    `CREATE TABLE IF NOT EXISTS products (
       id TEXT PRIMARY KEY NOT NULL,
       sku TEXT,
       name TEXT NOT NULL,
       category TEXT,
       photoUri TEXT,
       photo_url TEXT,
       brand TEXT,
       unit TEXT,
       minStock INTEGER,
       qty INTEGER,
       next_expiry TEXT,
       createdAt TEXT,
       updatedAt TEXT
     )`
  );
  // columnas que podrían faltar en DB antiguas
  try { run(`ALTER TABLE products ADD COLUMN photo_url TEXT`); } catch {}
  try { run(`ALTER TABLE products ADD COLUMN photoUri TEXT`); } catch {}
  try { run(`ALTER TABLE products ADD COLUMN unit TEXT`); } catch {}
  try { run(`ALTER TABLE products ADD COLUMN minStock INTEGER`); } catch {}
  try { run(`ALTER TABLE products ADD COLUMN next_expiry TEXT`); } catch {}

  // Índices útiles
  try { run(`CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)`); } catch {}
  try { run(`CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`); } catch {}
  try { run(`CREATE INDEX IF NOT EXISTS idx_products_updatedAt ON products(updatedAt)`); } catch {}
} catch (e) {
  console.error('[ProductRepoSQLite.migration] error:', e);
}

// ————————————————————————————————————————————————————————
// Row normalizada que sale de SELECT
type Row = {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  photoUrl: string | null;
  brand: string | null;
  unit: string | null;
  minStock: number | null;
  qty: number | null;
  nextExpiry: string | null;
  daysToExpiry: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const SELECT_BASE = `
  SELECT
    id,
    sku,
    name,
    category,
    COALESCE(photo_url, photoUri) AS photoUrl,
    brand,
    unit,
    COALESCE(minStock, 0) AS minStock,
    COALESCE(qty, 0) AS qty,
    next_expiry AS nextExpiry,
    CASE
      WHEN next_expiry IS NOT NULL AND length(next_expiry) > 0
      THEN CAST(julianday(date(next_expiry)) - julianday(date('now','localtime')) AS INTEGER)
      ELSE NULL
    END AS daysToExpiry,
    createdAt,
    updatedAt
  FROM products
`;

// Helper: mapea Row -> Product domain
// 🔥 Nos aseguramos de que .props incluya nextExpiry y daysToExpiry
const toDomain = (r: Row): Product => {
  const base: any = Product.from({
    ...r,
    photoUri: r.photoUrl,
  });
  base.props = {
    ...(base.props || {}),
    nextExpiry: r.nextExpiry,
    daysToExpiry: r.daysToExpiry,
  };
  return base as Product;
};

export class ProductRepoSQLite implements ProductRepository {
  // NEW: usado por notifications.ts (devuelve filas "raw" del SELECT)
  async list(): Promise<Row[]> {
    return all<Row>(`${SELECT_BASE} ORDER BY updatedAt DESC`);
  }

  async getAll() {
    const rows = all<Row>(`${SELECT_BASE} ORDER BY updatedAt DESC`);
    return rows.map(toDomain);
  }
  listProducts() { return this.getAll(); }
  getProducts() { return this.getAll(); }

  async getById(id: string) {
    const r = one<Row>(`${SELECT_BASE} WHERE id=?`, [id]);
    return r ? toDomain(r) : null;
  }

  async upsert(input: UpsertProductInput) {
    const now = dayjs().toISOString();
    const id = input.id ?? nano();

    const sku = input.sku?.trim() ? input.sku.trim().toUpperCase() : null;
    const name = (input.name ?? '').trim();
    const category = input.category?.trim() || null;

    const photoRaw = firstDefined(
      (input as any).photoUrl,
      (input as any).photoURL,
      (input as any).photo_url,
      (input as any).photoUri,
      (input as any).photo
    );
    const photo =
      typeof photoRaw === 'string' && photoRaw.trim() ? photoRaw.trim() : null;

    const brand = input.brand?.trim() || null;
    const unit = (input as any).unit?.trim?.() || null;

    const minStock =
      typeof (input as any).minStock === 'number' && isFinite((input as any).minStock)
        ? Math.max(0, (input as any).minStock)
        : 0;

    const qtyIn =
      typeof (input as any).qty === 'number' && isFinite((input as any).qty)
        ? Math.max(0, (input as any).qty)
        : undefined;

    const nextExpiryRaw = firstDefined(
      (input as any).nextExpiry,
      (input as any).next_expiry,
      (input as any).expiry,
      (input as any).expirationDate,
      (input as any).expiryDate
    );
    const nextExpiry = normalizeDate(nextExpiryRaw);

    const exists = one<{ id: string }>(`SELECT id FROM products WHERE id=?`, [id]);

    if (exists) {
      const prevQtyRow = one<{ qty: number | null }>(`SELECT qty FROM products WHERE id=?`, [id]);
      const qty = qtyIn ?? (Number(prevQtyRow?.qty) || 0);

      run(
        `UPDATE products
           SET sku=?,
               name=?,
               category=?,
               photoUri=?,
               photo_url=?,
               brand=?,
               unit=?,
               minStock=?,
               qty=?,
               next_expiry=?,
               updatedAt=?
         WHERE id=?`,
        [sku, name, category, photo, photo, brand, unit, minStock, qty, nextExpiry, now, id]
      );
    } else {
      const qty = qtyIn ?? 0;
      run(
        `INSERT INTO products
           (id, sku, name, category, photoUri, photo_url, brand, unit, minStock, qty, next_expiry, createdAt, updatedAt)
         VALUES
           (?,  ?,   ?,    ?,        ?,        ?,        ?,    ?,    ?,   ?,    ?,           ?,         ?)`,
        [id, sku, name, category, photo, photo, brand, unit, minStock, qty, nextExpiry, now, now]
      );
    }

    const row = one<Row>(`${SELECT_BASE} WHERE id=?`, [id])!;
    return toDomain(row);
  }

  async createProduct(payload: any): Promise<string> {
    const now = dayjs().toISOString();
    const id: string = payload?.id || nano();

    const name = String(payload?.name ?? '').trim();
    if (!name) throw new Error('name es requerido');

    const sku =
      typeof payload?.sku === 'string' && payload.sku.trim()
        ? payload.sku.trim().toUpperCase()
        : null;

    const brand = payload?.brand?.trim?.() || null;
    const category = payload?.category?.trim?.() || null;

    const photoRaw = firstDefined(
      payload?.photoUrl,
      payload?.photoURL,
      payload?.photo_url,
      payload?.photoUri,
      payload?.photo
    );
    const photo =
      typeof photoRaw === 'string' && photoRaw.trim() ? photoRaw.trim() : null;

    const unit = payload?.unit?.trim?.() || null;
    const minStock =
      typeof payload?.min_stock === 'number'
        ? Math.max(0, payload.min_stock)
        : typeof payload?.minStock === 'number'
        ? Math.max(0, payload.minStock)
        : 0;

    const qty =
      typeof payload?.qty === 'number' && isFinite(payload.qty)
        ? Math.max(0, payload.qty)
        : 0;

    const nextExpiryRaw = firstDefined(
      payload?.nextExpiry,
      payload?.next_expiry,
      payload?.expiry,
      payload?.expiryDate,
      payload?.expirationDate
    );
    const nextExpiry = normalizeDate(nextExpiryRaw);

    run(
      `INSERT INTO products
         (id, sku, name, category, photoUri, photo_url, brand, unit, minStock, qty, next_expiry, createdAt, updatedAt)
       VALUES
         (?,  ?,   ?,    ?,        ?,        ?,        ?,    ?,    ?,   ?,    ?,           ?,         ?)`,
      [id, sku, name, category, photo, photo, brand, unit, minStock, qty, nextExpiry, now, now]
    );

    return id;
  }

  async updateProductQty(productId: string | number, qty: number) {
    const id = String(productId);
    const now = dayjs().toISOString();
    const value = Number.isFinite(qty) ? Math.max(0, qty) : 0;
    run(`UPDATE products SET qty=?, updatedAt=? WHERE id=?`, [value, now, id]);
  }

  async updateProductExpiry(productId: string | number, expiryInput: any) {
    const id = String(productId);
    const now = dayjs().toISOString();
    const nextExpiry = normalizeDate(expiryInput);
    run(`UPDATE products SET next_expiry=?, updatedAt=? WHERE id=?`, [nextExpiry, now, id]);
  }

  async adjustStock(productId: string | number, delta: number) {
    const id = String(productId);
    const now = dayjs().toISOString();
    const d = Number.isFinite(delta) ? Number(delta) : 0;
    run(
      `UPDATE products
         SET qty = MAX(0, COALESCE(qty,0) + ?),
             updatedAt=?
       WHERE id=?`,
      [d, now, id]
    );
  }

  async incrementQty(productId: string | number, amount: number) {
    return this.adjustStock(productId, Math.abs(Number(amount) || 0));
  }

  async decrementQty(productId: string | number, amount: number) {
    return this.adjustStock(productId, -Math.abs(Number(amount) || 0));
  }

  async remove(id: string) {
    run(`DELETE FROM products WHERE id=?`, [id]);
  }
}

const defaultInstance = new ProductRepoSQLite();
export default defaultInstance;
