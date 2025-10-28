// src/infrastructure/persistence/sqlite/MovementRepoSQLite.ts
import dayjs from "dayjs";
import { customAlphabet } from "nanoid/non-secure";
import { all, one, run } from "./SQLiteClient";
import { Movement } from "../../../core/domain/entities/Movement";
import type {
  MovementRepository,
  AddMovementInput,
} from "../../../core/domain/repositories/MovementRepository";

const nano = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 16);

type Row = {
  id: string;
  productId: string;
  type: "IN" | "OUT" | "ADJUST";
  qty: number;
  note: string | null;
  createdAt: string;
};

export class MovementRepoSQLite implements MovementRepository {
  // cache simple para no consultar PRAGMA en cada inserción
  private hasQtyColumnCache: boolean | null = null;

  private hasProductsQtyColumn(): boolean {
    if (this.hasQtyColumnCache != null) return this.hasQtyColumnCache;
    try {
      const cols = all<{ name: string }>(`PRAGMA table_info(products)`);
      this.hasQtyColumnCache = cols.some((c) => c.name === "qty");
    } catch {
      this.hasQtyColumnCache = false;
    }
    return this.hasQtyColumnCache!;
  }

  // Punto único de inserción
  private _insertSync(input: AddMovementInput): Movement {
    const id = String(input.id ?? nano());
    const productId = String(input.productId);
    const type = input.type as Row["type"];
    const qty = Math.max(1, Number(input.qty) || 1); // siempre positivo
    const note = input.note ?? null;
    const now = dayjs().toISOString();

    // Inserta el movimiento
    run(
      `INSERT INTO movements (id, productId, type, qty, note, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, productId, type, qty, note, now]
    );

    // Mantener updatedAt del producto fresco
    run(`UPDATE products SET updatedAt=? WHERE id=?`, [now, productId]);

    // Si existe columna qty en products, actualiza stock
    // IN suma, OUT resta, ADJUST no cambia (ajústalo si quieres otro comportamiento)
    if (this.hasProductsQtyColumn()) {
      const delta = type === "IN" ? qty : type === "OUT" ? -qty : 0;
      if (delta !== 0) {
        run(
          `UPDATE products
           SET qty = MAX(0, COALESCE(qty, 0) + ?), updatedAt = ?
           WHERE id = ?`,
           [delta, now, productId]
        );
      }
    }

    const row = one<Row>(`SELECT * FROM movements WHERE id=?`, [id])!;
    return Movement.from(row);
  }

  // ✅ Compatibilidad con interfaz (async/Promise)
  async add(input: AddMovementInput): Promise<Movement> {
    return this._insertSync(input);
  }

  // ✅ Alias moderno usado por la UI y casos de uso nuevos
  async register(input: AddMovementInput): Promise<Movement> {
    return this._insertSync(input);
  }

  async listByProduct(productId: string): Promise<Movement[]> {
    const rows = all<Row>(
      `SELECT * FROM movements WHERE productId=? ORDER BY datetime(createdAt) DESC`,
      [String(productId)]
    );
    return rows.map(Movement.from);
  }

  async removeByProduct(productId: string): Promise<void> {
    run(`DELETE FROM movements WHERE productId=?`, [String(productId)]);
  }
}
