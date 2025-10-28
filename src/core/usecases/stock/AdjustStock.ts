import type { BatchRepository } from "../../domain/repositories/BatchRepository";
import type { MovementRepository } from "../../domain/repositories/MovementRepository";

export class AdjustStock {
  constructor(private batches: BatchRepository, private moves: MovementRepository) {}

  /**
   * Si delta > 0 => IN
   * Si delta < 0 => OUT (se guarda qty positiva en movement, signo lo da type)
   */
  async execute(params: {
    productId: string;
    delta: number;                 // +in / -out
    note?: string | null;
    expiryDate?: string | null;
    purchaseDate?: string | null;
    cost?: number | null;
  }) {
    const { productId, delta, note = null, expiryDate = null, purchaseDate = null, cost = null } = params;
    if (!delta || delta === 0) return;

    // 1) Registrar lote con la cantidad (puede ser negativa)
    await this.batches.add({ productId, quantity: delta, expiryDate, purchaseDate, cost });

    // 2) Registrar movimiento con qty positiva
    const type = delta > 0 ? "IN" : "OUT";
    await this.moves.add({ productId, type, qty: Math.abs(delta), note });
  }
}
