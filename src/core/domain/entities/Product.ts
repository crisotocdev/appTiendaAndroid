// src/core/domain/entities/Product.ts
export type UUID = string;

// Helpers
const oneLine = (v: any): string =>
  String(v ?? "")
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const firstDefined = <T>(...xs: T[]): T | undefined => xs.find((v) => !!v);

export interface ProductProps {
  id: UUID;
  sku: string | null;          // puede ser null (se guarda en mayúsculas si viene)
  name: string;
  category: string | null;

  // Normalizamos a photoUrl aunque venga como photo_url/photoUri/photoURL/photo/imageUrl
  photoUrl: string | null;

  // Atributos adicionales usados en la app
  brand: string | null;
  unit: string | null;         // "pcs" | "kg" | "lt" | "pack" | string
  minStock: number;            // numérico (default 0)

  // ⬅️ NUEVO: stock actual del producto
  qty: number;                 // numérico (default 0)

  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export class Product {
  constructor(public readonly props: ProductProps) {}

  /**
   * Normaliza:
   * - name/brand/category/unit a una sola línea
   * - sku opcional (uppercased si existe)
   * - photo: mapea alias a photoUrl
   * - minStock y qty siempre numéricos (default 0)
   */
  static from(row: any): Product {
    const id = String(row?.id ?? "");

    const name = oneLine(row?.name ?? row?.title ?? "");
    const brand = oneLine(row?.brand ?? row?.marca ?? "");
    const category = oneLine(row?.category ?? row?.categoria ?? "");
    const unit = oneLine(row?.unit ?? "");

    const skuRaw = row?.sku;
    const sku =
      typeof skuRaw === "string" && skuRaw.trim()
        ? skuRaw.trim().toUpperCase()
        : null;

    // Imagen
    const photoRaw = firstDefined<string | null | undefined>(
      row?.photoUrl,
      row?.photo_url,   // snake_case desde migración
      row?.photoUri,
      row?.photoURL,
      row?.photo,
      row?.imageUrl
    );
    const photoUrl =
      typeof photoRaw === "string" && photoRaw.trim() ? photoRaw.trim() : null;

    // Númericos
    const ms = Number(row?.minStock);
    const minStock = Number.isFinite(ms) ? ms : 0;

    const q = Number(row?.qty);
    const qty = Number.isFinite(q) ? q : 0;

    const createdAt = String(row?.createdAt ?? new Date().toISOString());
    const updatedAt = String(row?.updatedAt ?? createdAt);

    return new Product({
      id,
      sku,
      name,
      category: category || null,
      photoUrl,
      brand: brand || null,
      unit: unit || null,
      minStock,
      qty,               // ⬅️ ahora viaja a la UI
      createdAt,
      updatedAt,
    });
  }

  toJSON(): ProductProps {
    return this.props;
  }
}
