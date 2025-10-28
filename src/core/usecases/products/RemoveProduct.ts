import { ProductRepository } from "../../domain/repositories/ProductRepository";

export class RemoveProduct {
  constructor(private repo: ProductRepository) {}
  execute(id: string): Promise<void> {
    return this.repo.remove(id);
  }
}