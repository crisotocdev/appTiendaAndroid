// src/core/usecases/batches/GetExpirySummary.ts
import type { BatchRepoSQLite } from "../../../infrastructure/persistence/sqlite/BatchRepoSQLite";

export class GetExpirySummary {
  constructor(private repo: BatchRepoSQLite) {}

  execute(daysAhead: number = 30) {
    return this.repo.getExpirySummary(daysAhead);
  }
}
