// src/settings/expirySettings.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// Claves de almacenamiento
const KEY_SOON = 'expiry_warning_days_v1';         // legado: "por vencer"
const KEY_OK   = 'expiry_ok_threshold_days_v1';    // nuevo: "ok" vs "lejos"

// Valores por defecto (también los usa ProductList)
export const EXPIRY_DEFAULTS = {
  // días para mostrar "Por vencer"
  soonThresholdDays: 7,
  // hasta cuántos días se considera "OK" (luego sería "Lejos")
  okThresholdDays: 30,
};

// Límites
const MIN_SOON = 1;
const MAX_SOON = 60;
const MIN_OK = 2;
const MAX_OK = 365;

function clamp(n: number, min: number, max: number, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  if (v < min) return min;
  if (v > max) return max;
  return Math.round(v);
}

/* ========= API LEGADA (¡NO ROMPE NADA!) ========= */
/** Usado por notifications y pantallas antiguas */
export async function getExpiryWarningDays(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SOON);
    if (!raw) return EXPIRY_DEFAULTS.soonThresholdDays;
    return clamp(Number(raw), MIN_SOON, MAX_SOON, EXPIRY_DEFAULTS.soonThresholdDays);
  } catch {
    return EXPIRY_DEFAULTS.soonThresholdDays;
  }
}

export async function setExpiryWarningDays(days: number): Promise<void> {
  try {
    const clamped = clamp(days, MIN_SOON, MAX_SOON, EXPIRY_DEFAULTS.soonThresholdDays);
    await AsyncStorage.setItem(KEY_SOON, String(clamped));
  } catch {
    // noop
  }
}

/* ========= API NUEVA (para ProductList configurable) ========= */
export type ExpirySettings = {
  /** días para mostrar "Por vencer" */
  soonThresholdDays: number;
  /** hasta cuántos días se considera "OK" antes de pasar a "Lejos" */
  okThresholdDays: number;
};

export async function getExpirySettings(): Promise<ExpirySettings> {
  const soon = await getExpiryWarningDays();
  let ok = EXPIRY_DEFAULTS.okThresholdDays;
  try {
    const rawOk = await AsyncStorage.getItem(KEY_OK);
    if (rawOk) ok = clamp(Number(rawOk), MIN_OK, MAX_OK, EXPIRY_DEFAULTS.okThresholdDays);
  } catch { /* ignore */ }

  // coherencia: ok > soon
  if (ok <= soon) ok = Math.min(Math.max(soon + 1, MIN_OK), MAX_OK);

  return { soonThresholdDays: soon, okThresholdDays: ok };
}

export async function setExpirySettings(partial: Partial<ExpirySettings>): Promise<void> {
  const current = await getExpirySettings();
  const next: ExpirySettings = {
    soonThresholdDays: clamp(
      partial.soonThresholdDays ?? current.soonThresholdDays,
      MIN_SOON, MAX_SOON, EXPIRY_DEFAULTS.soonThresholdDays
    ),
    okThresholdDays: clamp(
      partial.okThresholdDays ?? current.okThresholdDays,
      MIN_OK, MAX_OK, EXPIRY_DEFAULTS.okThresholdDays
    ),
  };
  if (next.okThresholdDays <= next.soonThresholdDays) {
    next.okThresholdDays = Math.min(Math.max(next.soonThresholdDays + 1, MIN_OK), MAX_OK);
  }
  try {
    await AsyncStorage.multiSet([
      [KEY_SOON, String(next.soonThresholdDays)],
      [KEY_OK, String(next.okThresholdDays)],
    ]);
  } catch { /* ignore */ }
}
