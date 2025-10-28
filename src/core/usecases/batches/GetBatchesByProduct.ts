// src/core/usecases/batches/GetBatchesByProduct.ts
import type { BatchRepoSQLite } from "../../../infrastructure/persistence/sqlite/BatchRepoSQLite";

export class GetBatchesByProduct {
  constructor(private repo: BatchRepoSQLite) {}
  execute(productId: string) {
    return this.repo.listByProduct(productId);
  }
}