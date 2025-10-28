// src/core/usecases/products/GetAllProducts.ts
import { Product } from "../../domain/entities/Product";
import { ProductRepository } from "../../domain/repositories/ProductRepository";

export class GetAllProducts {
  constructor(private repo: ProductRepository) {}
  execute(): Promise<Product[]> {
    return this.repo.getAll();
  }
}
