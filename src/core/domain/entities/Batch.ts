export type BatchProps = {
  id: string;
  productId: string;
  quantity: number;          // puede ser negativa si haces “OUT” mediante ajuste
  expiryDate?: string | null;
  purchaseDate?: string | null;
  cost?: number | null;
  createdAt: string;
  updatedAt: string;
};

export class Batch {
  constructor(public props: BatchProps) {}
  static from(row: any): Batch {
    return new Batch({
      id: String(row.id),
      productId: String(row.productId),
      quantity: Number(row.quantity),
      expiryDate: row.expiryDate ?? null,
      purchaseDate: row.purchaseDate ?? null,
      cost: row.cost != null ? Number(row.cost) : null,
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    });
  }
}
