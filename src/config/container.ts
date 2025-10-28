// src/config/container.ts
import { ProductRepoSQLite }  from "../infrastructure/persistence/sqlite/ProductRepoSQLite";
import { BatchRepoSQLite }    from "../infrastructure/persistence/sqlite/BatchRepoSQLite";
import { MovementRepoSQLite } from "../infrastructure/persistence/sqlite/MovementRepoSQLite";

import { GetAllProducts } from "../core/usecases/products/GetAllProducts";
import { GetProductById } from "../core/usecases/products/GetProductById";
import { UpsertProduct }  from "../core/usecases/products/UpsertProduct";
import { RemoveProduct }  from "../core/usecases/products/RemoveProduct";

import { AdjustStock } from "../core/usecases/stock/AdjustStock";

// ⬇️ Barrel de movimientos (AddMovement y GetMovementsByProduct)
import { AddMovement, GetMovementsByProduct } from "../core/usecases/movements";

export type AppContainer = {
  repos: {
    productRepo: ProductRepoSQLite;
    batchRepo: BatchRepoSQLite;
    movementRepo: MovementRepoSQLite;
  };
  usecases: {
    // Productos
    getAllProducts: GetAllProducts;
    getProductById: GetProductById;
    upsertProduct:  UpsertProduct;
    removeProduct:  RemoveProduct;

    // Stock / Movimientos
    adjustStock: AdjustStock;
    registerMovement: AddMovement;           // AddMovement internamente
    getMovementsByProduct: GetMovementsByProduct;

    // Aliases cómodos para UI
    products: {
      list:   GetAllProducts;
      get:    GetProductById;
      upsert: UpsertProduct;
      delete: RemoveProduct;
    };
    movements: {
      register:  AddMovement;                // u.movements.register(...)
      byProduct: GetMovementsByProduct;
    };

    // ⬇️ NUEVO: helpers directos para lotes / vencimientos
    batches: {
      // CRUD básico
      add: (input: {
        productId: string;
        quantity: number;
        expiryDate?: string | null;
        purchaseDate?: string | null;
        cost?: number | null;
        id?: string;
      }) => Promise<import("../core/domain/entities/Batch").Batch>;

      listByProduct: (productId: string) =>
        Promise<import("../core/domain/entities/Batch").Batch[]>;

      removeByProduct: (productId: string) => void;

      // Vencimientos y consumo FIFO
      getNextExpiry: (productId: string) => string | null;

      getExpirySummary: (daysAhead?: number) => Array<{
        productId: string;
        nextExpiry: string | null;
        expiredQty: number;
        soonQty: number;
      }>;

      consumeFIFO: (productId: string, qty: number) => Promise<number>;
    };
  };
};

// Singleton para Fast Refresh
let _container: AppContainer | null = null;

export function buildContainer(): AppContainer {
  if (_container) return _container;

  const productRepo  = new ProductRepoSQLite();
  const batchRepo    = new BatchRepoSQLite();
  const movementRepo = new MovementRepoSQLite();

  // Usecases "clásicos"
  const getAllProducts        = new GetAllProducts(productRepo);
  const getProductById        = new GetProductById(productRepo);
  const upsertProduct         = new UpsertProduct(productRepo);
  const removeProduct         = new RemoveProduct(productRepo);

  const adjustStock           = new AdjustStock(batchRepo, movementRepo); // requiere ambos repos
  const registerMovement      = new AddMovement(movementRepo);
  const getMovementsByProduct = new GetMovementsByProduct(movementRepo);

  _container = {
    repos: { productRepo, batchRepo, movementRepo },
    usecases: {
      // Productos
      getAllProducts,
      getProductById,
      upsertProduct,
      removeProduct,

      // Stock / Movimientos
      adjustStock,
      registerMovement,
      getMovementsByProduct,

      // Aliases cómodos para UI
      products: {
        list:   getAllProducts,
        get:    getProductById,
        upsert: upsertProduct,
        delete: removeProduct,
      },
      movements: {
        register:  registerMovement,
        byProduct: getMovementsByProduct,
      },

      // NUEVO: helpers de lotes/vencimientos (van directo al repo)
      batches: {
        add: (input) => batchRepo.add(input),
        listByProduct: (productId) => batchRepo.listByProduct(productId),
        removeByProduct: (productId) => batchRepo.removeByProduct(productId),
        getNextExpiry: (productId) => batchRepo.getNextExpiry(productId),
        getExpirySummary: (daysAhead = 30) => batchRepo.getExpirySummary(daysAhead),
        consumeFIFO: (productId, qty) => batchRepo.consumeFIFO(productId, qty),
      },
    },
  };

  return _container;
}
