import type { Movement } from "../entities/Movement";

export type AddMovementInput = {
  id?: string;
  productId: string;
  type: "IN" | "OUT" | "ADJUST";
  qty: number;                     // positiva
  note?: string | null;
};

export interface MovementRepository {
  add(input: AddMovementInput): Promise<Movement>;
  listByProduct(productId: string): Promise<Movement[]>;
  removeByProduct(productId: string): Promise<void>;
}
