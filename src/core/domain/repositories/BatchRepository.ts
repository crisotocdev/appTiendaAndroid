import type { Batch } from "../entities/Batch";

export type AddBatchInput = {
  id?: string;
  productId: string;
  quantity: number;                // puede ser negativa
  expiryDate?: string | null;
  purchaseDate?: string | null;
  cost?: number | null;
};

export interface BatchRepository {
  add(input: AddBatchInput): Promise<Batch>;
  getByProduct(productId: string): Promise<Batch[]>;
  removeByProduct(productId: string): Promise<void>;
}
