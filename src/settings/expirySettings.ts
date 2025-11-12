// src/settings/expirySettings.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'expiry_warning_days_v1';
const DEFAULT_DAYS = 7;
const MIN_DAYS = 1;
const MAX_DAYS = 60;

function clampDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DAYS;
  if (value < MIN_DAYS) return MIN_DAYS;
  if (value > MAX_DAYS) return MAX_DAYS;
  return Math.round(value);
}

/**
 * Lee desde almacenamiento el número de días de aviso.
 * Si no hay nada guardado, devuelve 7.
 */
export async function getExpiryWarningDays(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_DAYS;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_DAYS;

    return clampDays(parsed);
  } catch {
    // Si algo falla, usamos el valor por defecto
    return DEFAULT_DAYS;
  }
}

/**
 * Guarda en almacenamiento el número de días de aviso.
 * Siempre lo deja entre 1 y 60 días.
 */
export async function setExpiryWarningDays(days: number): Promise<void> {
  try {
    const clamped = clampDays(days);
    await AsyncStorage.setItem(KEY, String(clamped));
  } catch {
    // Si falla el guardado, no rompemos la app
  }
}
