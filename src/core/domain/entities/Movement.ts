export type MovementType = "IN" | "OUT" | "ADJUST";

export type MovementProps = {
  id: string;
  productId: string;
  type: MovementType;
  qty: number;               // SIEMPRE positiva; OUT/ADJUST negativo se expresa por "type"
  note?: string | null;
  createdAt: string;
};

export class Movement {
  constructor(public props: MovementProps) {}
  static from(row: any): Movement {
    return new Movement({
      id: String(row.id),
      productId: String(row.productId),
      type: row.type as MovementType,
      qty: Math.abs(Number(row.qty)),
      note: row.note ?? null,
      createdAt: String(row.createdAt),
    });
  }
}
