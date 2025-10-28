// src/core/usecases/movements/AddMovement.ts
import type { Movement } from "../../domain/entities/Movement";
import type {
  MovementRepository,
  AddMovementInput,
} from "../../domain/repositories/MovementRepository";

export class AddMovement {
  constructor(private repo: MovementRepository) {}

  async execute(input: AddMovementInput): Promise<Movement> {
    // Normalizaciones seguras
    const payload: AddMovementInput = {
      id: input.id,
      productId: String(input.productId),
      type: input.type,
      qty: Math.max(1, Number(input.qty) || 1), // siempre positivo y >= 1
      note: input.note ?? null,
    };

    // Si el repo expone 'register', úsalo; si no, 'add'
    const anyRepo = this.repo as MovementRepository & {
      register?: (i: AddMovementInput) => Promise<Movement>;
    };

    if (typeof anyRepo.register === "function") {
      return anyRepo.register(payload);
    }
    return this.repo.add(payload);
  }
}
