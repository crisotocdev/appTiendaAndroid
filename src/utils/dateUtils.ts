// src/utils/dateUtils.ts

/**
 * Valida fechas en formato AAAA-MM-DD.
 * - Estructura correcta (4-2-2 dígitos)
 * - Fecha real en calendario (no acepta 2024-13-99, etc.)
 */
export function isValidYMD(value: string): boolean {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}
