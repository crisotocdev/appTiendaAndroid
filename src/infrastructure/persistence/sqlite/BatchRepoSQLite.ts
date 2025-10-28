// src/infrastructure/persistence/sqlite/BatchRepoSQLite.ts
import dayjs from "dayjs";
import { customAlphabet } from "nanoid/non-secure";
import { all, one, run } from "./SQLiteClient";
import { Batch } from "../../../core/domain/entities/Batch";
import type { BatchRepository, AddBatchInput } from "../../../core/domain/repositories/BatchRepository";

const nano = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 16);

type Row = {
  id: string;
  productId: string;
  quantity: number;
  expiryDate: string | null;
  purchaseDate: string | null;
  cost: number | null;
  createdAt: string;
  updatedAt: string;
};

export class BatchRepoSQLite implements BatchRepository {
  /** Crea un lote */
  async add(input: AddBatchInput) {
    const id  = String(input.id ?? nano());
    const now = dayjs().toISOString();

    const productId   = String(input.productId);
    const quantity    = Math.max(0, Number(input.quantity) || 0);
    const expiryDate  =
      input.expiryDate && String(input.expiryDate).trim()
        ? String(input.expiryDate).trim()
        : null; // idealmente "YYYY-MM-DD"
    const purchaseDate =
      input.purchaseDate && String(input.purchaseDate).trim()
        ? String(input.purchaseDate).trim()
        : null;
    const cost =
      typeof input.cost === "number" && isFinite(input.cost) ? input.cost : null;

    run(
      `INSERT INTO batches (id, productId, quantity, expiryDate, purchaseDate, cost, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, productId, quantity, expiryDate, purchaseDate, cost, now, now]
    );

    const row = one<Row>(`SELECT * FROM batches WHERE id=?`, [id])!;
    return Batch.from(row);
  }

  /** Lista lotes de un producto (los con fecha primero, próximo antes) */
  async getByProduct(productId: string) {
    const rows = all<Row>(
      `SELECT * FROM batches
       WHERE productId=?
       ORDER BY (expiryDate IS NULL) ASC, date(expiryDate) ASC, createdAt ASC`,
      [String(productId)]
    );
    return rows.map(Batch.from);
  }

  /** Alias por claridad con el uso en UI */
  async listByProduct(productId: string) {
    return this.getByProduct(productId);
  }

  /** Elimina todos los lotes de un producto */
  async removeByProduct(productId: string) {
    run(`DELETE FROM batches WHERE productId=?`, [String(productId)]);
  }

  /**
   * Consume stock por FIFO (fecha de vencimiento más próxima primero).
   * Devuelve cuánto se logró consumir (puede ser menor a qty si no hay suficiente).
   */
  async consumeFIFO(productId: string, qty: number): Promise<number> {
    let remaining = Math.max(0, Number(qty) || 0);
    if (remaining === 0) return 0;

    const rows = all<Row>(
      `SELECT * FROM batches
       WHERE productId=? AND quantity > 0
       ORDER BY (expiryDate IS NULL) ASC, date(expiryDate) ASC, createdAt ASC`,
      [String(productId)]
    );

    for (const b of rows) {
      if (remaining <= 0) break;
      const take = Math.min(Number(b.quantity) || 0, remaining);
      if (take > 0) {
        run(
          `UPDATE batches SET quantity = quantity - ?, updatedAt=? WHERE id=?`,
          [take, dayjs().toISOString(), b.id]
        );
        remaining -= take;
      }
    }

    return Math.max(0, (Number(qty) || 0) - remaining);
  }

  /** Próxima fecha de vencimiento (YYYY-MM-DD) de un producto (o null si no hay) */
  getNextExpiry(productId: string): string | null {
    const r = one<{ d: string | null }>(
      `SELECT MIN(date(expiryDate)) AS d
       FROM batches
       WHERE productId=? AND quantity>0 AND expiryDate IS NOT NULL`,
      [String(productId)]
    );
    return r?.d ?? null;
  }

  /**
   * Resumen global de vencimientos por producto.
   * - nextExpiry: próxima fecha (o null)
   * - expiredQty: cantidad vencida (expiry < hoy)
   * - soonQty: cantidad que vence entre hoy y hoy+daysAhead
   */
  getExpirySummary(daysAhead: number = 30): Array<{
    productId: string;
    nextExpiry: string | null; // YYYY-MM-DD
    expiredQty: number;
    soonQty: number;
  }> {
    const rows = all<{
      productId: string;
      nextExpiry: string | null;
      expiredQty: number | null;
      soonQty: number | null;
    }>(
      `
      SELECT
        productId,
        MIN(CASE WHEN expiryDate IS NOT NULL THEN date(expiryDate) END) AS nextExpiry,
        SUM(CASE WHEN expiryDate IS NOT NULL AND date(expiryDate) < date('now') THEN quantity ELSE 0 END) AS expiredQty,
        SUM(CASE WHEN expiryDate IS NOT NULL
                  AND date(expiryDate) BETWEEN date('now') AND date('now', ?) THEN quantity ELSE 0 END) AS soonQty
      FROM batches
      WHERE quantity > 0
      GROUP BY productId
      `,
      [`+${Math.max(0, daysAhead)} day`]
    );

    return rows.map((r) => ({
      productId: String(r.productId),
      nextExpiry: r.nextExpiry ? String(r.nextExpiry) : null,
      expiredQty: Number(r.expiredQty ?? 0),
      soonQty: Number(r.soonQty ?? 0),
    }));
  }
}
