// src/core/usecases/movements/GetMovementsByProduct.ts
import type { Movement } from "../../domain/entities/Movement";
import type { MovementRepository } from "../../domain/repositories/MovementRepository";

export class GetMovementsByProduct {
  constructor(private repo: MovementRepository) {}

  async execute(productId: string | { productId: string }): Promise<Movement[]> {
    // Permite execute({ productId }) o execute("id")
    const pid = String((productId as any)?.productId ?? productId);

    // Soporta repos con métodos alternativos
    const anyRepo = this.repo as MovementRepository & {
      listByProduct?: (id: string) => Promise<Movement[]>;
      getByProduct?: (id: string) => Promise<Movement[]>;
      byProduct?: (id: string) => Promise<Movement[]>;
      listForProduct?: (id: string) => Promise<Movement[]>;
      findByProduct?: (id: string) => Promise<Movement[]>;
      getMovementsByProduct?: (id: string) => Promise<Movement[]>;
    };

    if (typeof anyRepo.listByProduct === "function") return anyRepo.listByProduct(pid);
    if (typeof anyRepo.getByProduct === "function") return anyRepo.getByProduct(pid);
    if (typeof anyRepo.byProduct === "function") return anyRepo.byProduct(pid);
    if (typeof anyRepo.listForProduct === "function") return anyRepo.listForProduct(pid);
    if (typeof anyRepo.findByProduct === "function") return anyRepo.findByProduct(pid);
    if (typeof anyRepo.getMovementsByProduct === "function") return anyRepo.getMovementsByProduct(pid);

    // Fallback a la interfaz estándar
    return this.repo.listByProduct(pid);
  }
}
