import { Product } from "../entities/Product";

export interface UpsertProductInput {
  id?: string;
  sku: string;
  name: string;
  category?: string | null;
  photoUri?: string | null;
  // ⬇️ nuevos
  brand?: string | null;
  unit?: string | null;
  minStock?: number | null;
}

export interface ProductRepository {
  getAll(): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;
  upsert(input: UpsertProductInput): Promise<Product>;
  remove(id: string): Promise<void>;
}
