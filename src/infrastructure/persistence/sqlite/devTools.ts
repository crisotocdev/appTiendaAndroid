import { exec } from "./SQLiteClient";

/** Ejecuta esto una sola vez, luego borra la llamada. */
export function nukeDemoRows() {
  // Borra por id o por nombre, por si cambió algo
  exec(`DELETE FROM products WHERE id = '2' OR name = 'ComidaPostura';`);
}
