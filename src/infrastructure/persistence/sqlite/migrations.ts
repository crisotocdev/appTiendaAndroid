// src/infrastructure/persistence/sqlite/migrations.ts
import { exec, one, run, all } from "./SQLiteClient";

/**
 * Migraciones:
 * - 001_init: crea tabla products (sku NOT NULL)
 * - 002_products_brand_unit_minStock: agrega brand, unit, minStock si no existen
 * - 003_products_sku_nullable: vuelve sku opcional (quita NOT NULL)
 * - 004_products_fix_types_and_nullable: reconstruye la tabla si el esquema/tipos no coinciden
 * - 005_cleanup_numeric_ids: limpia filas antiguas con id numérico (legado)
 * - 006_batches_movements_text_ids: crea/reconstruye batches y movements con IDs TEXT y FKs TEXT
 * - 007_products_add_qty: agrega columna qty y normaliza a 0
 * - 008_products_photo_url_column: agrega photo_url y backfill desde photoUri
 */
export function runMigrations() {
  // Tabla de control de migraciones
  exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
  `);

  const migrations: Array<{ name: string; sql?: string; fn?: () => void }> = [
    {
      name: "001_init",
      sql: `
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          sku TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          category TEXT,
          photoUri TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
      `,
    },
    {
      name: "002_products_brand_unit_minStock",
      fn: () => {
        const cols = all<{ name: string }>(`PRAGMA table_info(products)`).map((c) => c.name);
        if (!cols.includes("brand"))    { try { exec(`ALTER TABLE products ADD COLUMN brand TEXT;`); } catch {} }
        if (!cols.includes("unit"))     { try { exec(`ALTER TABLE products ADD COLUMN unit TEXT;`); } catch {} }
        if (!cols.includes("minStock")) { try { exec(`ALTER TABLE products ADD COLUMN minStock REAL DEFAULT 0;`); } catch {} }
      },
    },
    {
      name: "003_products_sku_nullable",
      fn: () => {
        const cols = all<{ name: string; notnull: number }>(`PRAGMA table_info(products)`);
        const skuCol = cols.find((c) => c.name === "sku");
        if (!skuCol || skuCol.notnull === 0) return;

        exec("PRAGMA foreign_keys = OFF;");

        exec(`
          CREATE TABLE IF NOT EXISTS products_new (
            id TEXT PRIMARY KEY,
            sku TEXT UNIQUE,               -- SIN NOT NULL
            name TEXT NOT NULL,
            category TEXT,
            photoUri TEXT,
            brand TEXT,
            unit TEXT,
            minStock REAL DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
          );
        `);

        exec(`
          INSERT INTO products_new (id, sku, name, category, photoUri, brand, unit, minStock, createdAt, updatedAt)
          SELECT id, sku, name, category, photoUri, brand, unit, COALESCE(CAST(minStock AS REAL), 0), createdAt, updatedAt
          FROM products;
        `);

        exec(`DROP TABLE products;`);
        exec(`ALTER TABLE products_new RENAME TO products;`);
        exec(`CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);`);

        exec("PRAGMA foreign_keys = ON;");
      },
    },
    {
      name: "004_products_fix_types_and_nullable",
      fn: () => {
        const info = all<{ cid: number; name: string; type: string; notnull: number }>(
          `PRAGMA table_info(products)`
        );
        const has = (n: string) => info.some((c) => c.name === n);
        const col = (n: string) => info.find((c) => c.name === n);

        const needsRebuild =
          !has("brand") ||
          !has("unit") ||
          !has("minStock") ||
          (col("sku") && col("sku")!.notnull === 1) ||
          (col("minStock") && col("minStock")!.type.toUpperCase() !== "REAL");

        if (!needsRebuild) return;

        exec("PRAGMA foreign_keys = OFF;");

        exec(`
          CREATE TABLE IF NOT EXISTS products_new (
            id TEXT PRIMARY KEY,
            sku TEXT UNIQUE,
            name TEXT NOT NULL,
            category TEXT,
            photoUri TEXT,
            brand TEXT,
            unit TEXT,
            minStock REAL DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
          );
        `);

        const selectSku       = has("sku")       ? `sku`                                : `NULL AS sku`;
        const selectCategory  = has("category")  ? `category`                           : `NULL AS category`;
        const selectPhoto     = has("photoUri")  ? `photoUri`                           : `NULL AS photoUri`;
        const selectBrand     = has("brand")     ? `brand`                              : `NULL AS brand`;
        const selectUnit      = has("unit")      ? `unit`                               : `NULL AS unit`;
        const selectMinStock  = has("minStock")  ? `COALESCE(CAST(minStock AS REAL),0)` : `0 AS minStock`;

        exec(`
          INSERT INTO products_new (id, sku, name, category, photoUri, brand, unit, minStock, createdAt, updatedAt)
          SELECT
            id,
            ${selectSku},
            name,
            ${selectCategory},
            ${selectPhoto},
            ${selectBrand},
            ${selectUnit},
            ${selectMinStock},
            createdAt,
            updatedAt
          FROM products;
        `);

        exec(`DROP TABLE products;`);
        exec(`ALTER TABLE products_new RENAME TO products;`);
        exec(`CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);`);

        exec("PRAGMA foreign_keys = ON;");
      },
    },
    {
      name: "005_cleanup_numeric_ids",
      fn: () => {
        exec(`
          DELETE FROM products
          WHERE id GLOB '[0-9]*' AND NOT id GLOB '*[!0-9]*';
        `);
      },
    },
    {
      name: "006_batches_movements_text_ids",
      fn: () => {
        const tblInfo = (t: string) =>
          all<{ name: string; type: string }>(`PRAGMA table_info(${t})`);

        // --- BATCHES ---
        const bInfo = tblInfo("batches");
        const hasBatches = bInfo.length > 0;
        const needsBatchesRebuild =
          !hasBatches ||
          !bInfo.some(c => c.name === "id" && c.type?.toUpperCase().includes("TEXT")) ||
          !bInfo.some(c => c.name === "productId" && c.type?.toUpperCase().includes("TEXT")) ||
          !bInfo.some(c => c.name === "quantity");

        // --- MOVEMENTS ---
        const mInfo = tblInfo("movements");
        const hasMovements = mInfo.length > 0;
        const needsMovementsRebuild =
          !hasMovements ||
          !mInfo.some(c => c.name === "id" && c.type?.toUpperCase().includes("TEXT")) ||
          !mInfo.some(c => c.name === "productId" && c.type?.toUpperCase().includes("TEXT")) ||
          !mInfo.some(c => c.name === "type") ||
          !mInfo.some(c => c.name === "qty") ||
          !mInfo.some(c => c.name === "createdAt");

        exec("PRAGMA foreign_keys = OFF;");

        // ===== Rebuild/crear BATCHES =====
        if (needsBatchesRebuild) {
          exec(`
            CREATE TABLE IF NOT EXISTS batches_new (
              id TEXT PRIMARY KEY,
              productId TEXT NOT NULL,
              quantity REAL NOT NULL,
              expiryDate TEXT,
              purchaseDate TEXT,
              cost REAL,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL,
              FOREIGN KEY(productId) REFERENCES products(id) ON DELETE CASCADE
            );
          `);

          if (hasBatches) {
            const bCols = new Set(bInfo.map(c => c.name));
            const selId          = bCols.has("id")           ? `CAST(id AS TEXT)` : `hex(randomblob(8))`;
            const selProductId   = bCols.has("productId")    ? `CAST(productId AS TEXT)` : `NULL`;
            const selQuantity    = bCols.has("quantity")     ? `quantity` : `0`;
            const selExpiryDate  = bCols.has("expiryDate")   ? `expiryDate` : `NULL`;
            const selPurchase    = bCols.has("purchaseDate") ? `purchaseDate` : `NULL`;
            const selCost        = bCols.has("cost")         ? `cost` : `NULL`;
            const selCreated     = bCols.has("createdAt")    ? `COALESCE(createdAt, datetime('now'))` : `datetime('now')`;
            const selUpdated     = bCols.has("updatedAt")    ? `COALESCE(updatedAt, datetime('now'))` : `datetime('now')`;

            exec(`
              INSERT INTO batches_new (id, productId, quantity, expiryDate, purchaseDate, cost, createdAt, updatedAt)
              SELECT
                ${selId},
                ${selProductId},
                ${selQuantity},
                ${selExpiryDate},
                ${selPurchase},
                ${selCost},
                ${selCreated},
                ${selUpdated}
              FROM batches;
            `);
            exec(`DROP TABLE batches;`);
          }

          exec(`ALTER TABLE batches_new RENAME TO batches;`);
          exec(`CREATE INDEX IF NOT EXISTS idx_batches_product ON batches(productId);`);
          exec(`CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiryDate);`);
        }

        // ===== Rebuild/crear MOVEMENTS =====
        if (needsMovementsRebuild) {
          exec(`
            CREATE TABLE IF NOT EXISTS movements_new (
              id TEXT PRIMARY KEY,
              productId TEXT NOT NULL,
              type TEXT NOT NULL,     -- 'IN'|'OUT'|'ADJUST'
              qty REAL NOT NULL,      -- siempre positiva
              note TEXT,
              createdAt TEXT NOT NULL,
              FOREIGN KEY(productId) REFERENCES products(id) ON DELETE CASCADE
            );
          `);

          if (hasMovements) {
            const mCols = new Set(mInfo.map(c => c.name));
            const selId        = mCols.has("id")        ? `CAST(id AS TEXT)` : `hex(randomblob(8))`;
            const selProductId = mCols.has("productId") ? `CAST(productId AS TEXT)` : `NULL`;
            const selType      = mCols.has("type")      ? `type` : `'ADJUST'`;
            const selQty       = mCols.has("qty")       ? `ABS(qty)` : `0`;
            const selNote      = mCols.has("note")      ? `note` : `NULL`;
            const selCreated   = mCols.has("createdAt") ? `COALESCE(createdAt, datetime('now'))` : `datetime('now')`;

            exec(`
              INSERT INTO movements_new (id, productId, type, qty, note, createdAt)
              SELECT
                ${selId},
                ${selProductId},
                ${selType},
                ${selQty},
                ${selNote},
                ${selCreated}
              FROM movements;
            `);
            exec(`DROP TABLE movements;`);
          }

          exec(`ALTER TABLE movements_new RENAME TO movements;`);
          exec(`CREATE INDEX IF NOT EXISTS idx_mov_product ON movements(productId);`);
          exec(`CREATE INDEX IF NOT EXISTS idx_mov_date ON movements(createdAt);`);
        }

        exec("PRAGMA foreign_keys = ON;");
      },
    },

    // === 007: agrega qty y normaliza a 0 ===
    {
      name: "007_products_add_qty",
      fn: () => {
        const cols = new Set(all<{ name: string }>(`PRAGMA table_info(products)`).map(c => c.name));
        if (!cols.has("qty")) {
          try { exec(`ALTER TABLE products ADD COLUMN qty REAL DEFAULT 0;`); } catch {}
        }
        // Normaliza nulos a 0
        try { exec(`UPDATE products SET qty = 0 WHERE qty IS NULL;`); } catch {}
      },
    },

    // === 008: agrega photo_url y backfill desde photoUri ===
    {
      name: "008_products_photo_url_column",
      fn: () => {
        const cols = new Set(all<{ name: string }>(`PRAGMA table_info(products)`).map(c => c.name));
        if (!cols.has("photo_url")) {
          try { exec(`ALTER TABLE products ADD COLUMN photo_url TEXT;`); } catch {}
        }
        try {
          exec(`
            UPDATE products
            SET photo_url = photoUri
            WHERE (photo_url IS NULL OR photo_url = '')
              AND (photoUri IS NOT NULL AND photoUri <> '');
          `);
        } catch {}
      },
    },
  ];

  // Ejecutar migraciones pendientes
  for (const m of migrations) {
    const r = one<{ c: number }>(`SELECT COUNT(1) c FROM _migrations WHERE name=?`, [m.name]);
    if (!r || r.c === 0) {
      if (m.sql) exec(m.sql);
      if (m.fn) m.fn();
      run(`INSERT INTO _migrations (name) VALUES (?)`, [m.name]);
    }
  }
}
