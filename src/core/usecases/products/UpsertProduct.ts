import { Product } from "../../domain/entities/Product";
import {
  ProductRepository,
  UpsertProductInput,
} from "../../domain/repositories/ProductRepository";

export class UpsertProduct {
  constructor(private repo: ProductRepository) {}

  async execute(input: UpsertProductInput): Promise<Product> {
    // Nombre obligatorio
    const name = input.name?.trim();
    if (!name) throw new Error("Nombre requerido");

    // ⚠️ SKU OPCIONAL: si viene, se normaliza; si no viene, va undefined
    const sku = input.sku?.trim();
    const payload: UpsertProductInput = {
      ...input,
      name,
      sku: sku ? sku.toUpperCase() : undefined,
      category: input.category?.trim() || undefined,
      brand: input.brand?.trim() || undefined,
      unit: input.unit?.trim() || undefined,
      photoUri: input.photoUri?.trim() || undefined,
      minStock:
        typeof input.minStock === "number" && isFinite(input.minStock)
          ? input.minStock
          : 0,
    };

    return this.repo.upsert(payload);
  }
}
