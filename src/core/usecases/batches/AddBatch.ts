// src/core/usecases/batches/AddBatch.ts
import type { BatchRepoSQLite } from "../../../infrastructure/persistence/sqlite/BatchRepoSQLite";

export class AddBatch {
  constructor(private repo: BatchRepoSQLite) {}

  execute(input: { productId: string; quantity: number; expiryDate?: string | null; purchaseDate?: string | null; cost?: number | null; }) {
    return this.repo.add(input);
  }
}