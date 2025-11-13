// src/notifications.ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import productRepo from './infrastructure/persistence/sqlite/ProductRepoSQLite';
import { getExpiryWarningDays } from './settings/expirySettings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getExpiryInfo } from './utils/expiry';

// ----------------- Config básica de notificaciones -----------------

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    // API nueva (SDK >= 53)
    shouldShowBanner: true,
    shouldShowList: true,
  }),
} as any);

// Canal para Android
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Vencimientos',
    importance: Notifications.AndroidImportance.DEFAULT,
  }).catch((e) => {
    console.log('[notifications] error creando canal', e);
  });
}

// ----------------- Helpers de tipos (arreglan TS: "type" es requerido) -----------------

const KEY_LAST_STOCK_ALERT = 'last_stock_alert_v1';

// Tipos (si tu editor no los reconoce, deja los "as any")
type DateTrig = Notifications.DateTriggerInput;
type TimeTrig = Notifications.TimeIntervalTriggerInput;
type AnyTrig = Notifications.NotificationTriggerInput;

// Construye un trigger de FECHA (ejecuta en un Date exacto)
function at(date: Date): AnyTrig {
  return { type: 'date', date } as DateTrig as AnyTrig;
}

// Construye un trigger por INTERVALO DE TIEMPO (x segundos desde ahora)
function inSeconds(seconds: number): AnyTrig {
  return { type: 'timeInterval', seconds, repeats: false } as TimeTrig as AnyTrig;
}

async function ensurePermission(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted || existing.ios?.status === 2) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted || requested.ios?.status === 2;
  } catch (e) {
    console.log('[notifications] error al pedir permisos', e);
    return false;
  }
}

// Pequeño util para días entre hoy y una fecha YYYY-MM-DD
function daysUntil(ymd: string): number | null {
  const d = new Date(ymd);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  // Zerar horas para calcular por días completos
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diff = (d.getTime() - today.getTime()) / 86400000;
  return Math.round(diff);
}

async function shouldNotifyStockOnce(key: string): Promise<boolean> {
  try {
    const last = await AsyncStorage.getItem(KEY_LAST_STOCK_ALERT);
    if (last === key) return false; // misma alerta inmediata → suprimir
    await AsyncStorage.setItem(KEY_LAST_STOCK_ALERT, key);
    return true;
  } catch {
    return true;
  }
}

// ----------------- Avisos de vencimiento -----------------

export async function refreshExpiryNotifications(): Promise<void> {
  try {
    const ok = await ensurePermission();
    if (!ok) return;

    const thresholdDays = await getExpiryWarningDays();

    // Cancelamos todas las programadas antes de reprogramar
    await Notifications.cancelAllScheduledNotificationsAsync();

    const products: any[] = await productRepo.getAll();

    for (const p of products) {
  const props = (p as any).props ?? p;

  const name: string = props.name ?? 'Producto';
  const nextExpiry: string | null =
    props.nextExpiry ?? props.expirationDate ?? props.vence ?? null;

  if (!nextExpiry) continue;

  // 🔁 Recalcular días restantes con el umbral actual (sin depender del repo)
  const info = getExpiryInfo(nextExpiry, {
    soonThresholdDays: thresholdDays,
    okThresholdDays: Math.max(thresholdDays + 1, 30), // valor seguro
  });

  if (info.days == null || info.days < 0) continue;      // vencido o sin fecha válida
  if (info.days > thresholdDays) continue;               // aún lejos del umbral

  const body =
    info.days === 0
      ? `El producto "${name}" vence HOY (${nextExpiry}).`
      : info.days === 1
      ? `Al producto "${name}" le queda 1 día antes de vencer (${nextExpiry}).`
      : `Al producto "${name}" le quedan ${info.days} día(s) antes de vencer (${nextExpiry}).`;

  await Notifications.scheduleNotificationAsync({
    content: { title: 'Producto por vencer', body },
    // ⏱ Local inmediata (evita errores de tipos con triggers por fecha)
    trigger: null,
  } as any);
}
  } catch (e) {
    console.error('[notifications] error en refreshExpiryNotifications', e);
  }
}

// 🔔 Avisos de stock bajo / sin stock
export async function notifyStockAlert(params: {
  name: string;
  status: 'out' | 'low';
  qty: number;
  minStock?: number | null;
}) {
  try {
    const ok = await ensurePermission();
    if (!ok) return;

    const { name, status, qty, minStock } = params;

    // 🔒 Anti-duplicado inmediato (misma alerta consecutiva)
    const dedupeKey = `${status}|${name}|${qty}|${minStock ?? ''}`;
    const allowed = await shouldNotifyStockOnce(dedupeKey);
    if (!allowed) return;

    let title = '';
    let body = '';

    if (status === 'out') {
      title = 'Producto sin stock';
      body = `El producto "${name}" se quedó sin stock.`;
      if (typeof minStock === 'number' && Number.isFinite(minStock) && minStock > 0) {
        body += ` Stock mínimo configurado: ${minStock}.`;
      }
    } else {
      title = 'Producto con bajo stock';
      body = `El producto "${name}" está con bajo stock (stock: ${qty}`;
      if (typeof minStock === 'number' && Number.isFinite(minStock) && minStock > 0) {
        body += `, mínimo: ${minStock}`;
      }
      body += ').';
    }

    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null, // inmediato
    } as any);
  } catch (e) {
    console.log('[notifications] error en notifyStockAlert', e);
  }
}


// ----------------- Stubs antiguos (mantienen compatibilidad) -----------------

export async function registerBackgroundTask(): Promise<void> {
  // Expo Go ya no soporta remote push; y el background check se queda como stub
  if (__DEV__) console.log('[notifications] Background task stub (sin efecto en Expo Go).');
}

export async function unregisterBackgroundTask(): Promise<void> {
  if (__DEV__) console.log('[notifications] Background task stub (sin efecto en Expo Go).');
}

export async function askNotificationPermission(): Promise<void> {
  await ensurePermission();
}

export async function scheduleDailyCheck(): Promise<void> {
  await refreshExpiryNotifications();
}
