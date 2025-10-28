// src/core/application/usecases/movements/RegisterMovement.ts
import type { MovementRepository } from "../../domain/repositories/MovementRepository";
import type { Movement, MovementType } from "../../domain/entities/Movement";

export class RegisterMovement {
  constructor(private repo: MovementRepository) {}

  async execute(input: {
    productId: string;
    type: MovementType;
    qty: number;
    note?: string | null;
  }): Promise<Movement> {
    const qty = Math.max(1, Number(input.qty) || 1); // siempre positivo
    return this.repo.add({
      productId: String(input.productId),
      type: input.type,
      qty,
      note: input.note ?? null,
    });
  }
}
