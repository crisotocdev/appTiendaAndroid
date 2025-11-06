// src/settings/expirySettings.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'settings.expiryWarningDays'; // puedes dejar 'expiryWarningDays' si prefieres
const DEFAULT_DAYS = 7;

// Normaliza/clampa el valor a [1, 60]
function clampDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DAYS;
  return Math.min(60, Math.max(1, Math.round(value)));
}

// LEE los días (1–60). Si no hay nada o algo raro, devuelve 7.
export async function getExpiryWarningDays(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw == null) return DEFAULT_DAYS;

    const n = Number(raw);
    return clampDays(n);
  } catch {
    return DEFAULT_DAYS;
  }
}

// GUARDA los días (clamp 1–60)
export async function setExpiryWarningDays(days: number): Promise<void> {
  try {
    const safe = clampDays(days);
    await AsyncStorage.setItem(KEY, String(safe));
  } catch {
    // si falla, no rompemos la app
  }
}
