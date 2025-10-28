import { Product } from "../../domain/entities/Product";
import { ProductRepository } from "../../domain/repositories/ProductRepository";

export class GetProductById {
  constructor(private repo: ProductRepository) {}
  execute(id: string): Promise<Product | null> {
    return this.repo.getById(id);
  }
}
