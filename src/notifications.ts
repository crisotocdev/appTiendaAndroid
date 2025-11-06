// src/notifications.ts

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import productRepo from './infrastructure/persistence/sqlite/ProductRepoSQLite';
import { getExpiryWarningDays } from './settings/expirySettings';

export const BACKGROUND_TASK_NAME = 'inventory-expiry-lowstock-check';

// ----------------- Config básica de notificaciones -----------------

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
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

// ----------------- Helpers internos -----------------

let warned = false;
function warnOnce() {
  if (__DEV__ && !warned) {
    console.log('[notifications] Background task stub activa (sin efecto).');
    warned = true;
  }
}

async function ensurePermission(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    // iOS: status === 2 => granted
    if (existing.granted || existing.ios?.status === 2) {
      return true;
    }
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted || requested.ios?.status === 2;
  } catch (e) {
    console.log('[notifications] error al pedir permisos', e);
    return false;
  }
}

// ----------------- NUEVO: reprogramar avisos de vencimiento -----------------

export async function refreshExpiryNotifications(): Promise<void> {
  try {
    console.log('[notifications] refreshExpiryNotifications START');

    const ok = await ensurePermission();
    if (!ok) {
      console.log('[notifications] sin permiso de notificaciones');
      return;
    }

    // umbral configurable (1–60, por defecto 7)
    const thresholdDays = await getExpiryWarningDays();
    console.log('[notifications] thresholdDays =', thresholdDays);

    // Limpia todas las notificaciones *programadas* antes de re-crear
    // (aunque ahora vamos a lanzar inmediatas, lo dejamos por si luego añadimos programación)
    await Notifications.cancelAllScheduledNotificationsAsync();

    // Leemos todos los productos desde SQLite
    const products: any[] = await productRepo.getAll();
    console.log('[notifications] products para notificaciones =', products.length);

    for (const p of products) {
      const props = (p as any).props ?? p;

      const name: string = props.name ?? 'Producto';
      const nextExpiry: string | null = props.nextExpiry ?? null;

      const rawDays = props.daysToExpiry;
      const daysToExpiry: number | null =
        typeof rawDays === 'number' && Number.isFinite(rawDays) ? rawDays : null;

      // Filtros:
      if (!nextExpiry) continue;
      if (daysToExpiry == null) continue;          // sin info de días → no notificamos
      if (daysToExpiry < 0) continue;              // ya vencido → de momento no
      if (daysToExpiry > thresholdDays) continue;  // muy lejos aún

      let body: string;
      if (daysToExpiry === 0) {
        body = `El producto "${name}" vence HOY (${nextExpiry}).`;
      } else if (daysToExpiry === 1) {
        body = `Al producto "${name}" le queda 1 día antes de vencer (${nextExpiry}).`;
      } else {
        body = `Al producto "${name}" le quedan ${daysToExpiry} día(s) antes de vencer (${nextExpiry}).`;
      }

      // 🔔 En vez de programar para las 9:00, disparamos una notificación casi inmediata (en 2 segundos)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Producto por vencer',
          body,
        },
        // Usamos el formato simple basado en "seconds" para evitar problemas de tipos
        trigger: { seconds: 2 }, // se muestra casi al instante
      } as any);
    }

    console.log('[notifications] refreshExpiryNotifications DONE');
  } catch (e) {
    console.error('[notifications] error en refreshExpiryNotifications', e);
  }
}

// ----------------- Funciones antiguas (compatibilidad) -----------------

export async function registerBackgroundTask(): Promise<void> {
  warnOnce();
}

export async function unregisterBackgroundTask(): Promise<void> {
  warnOnce();
}

export async function askNotificationPermission(): Promise<void> {
  await ensurePermission();
}

export async function scheduleDailyCheck(): Promise<void> {
  await refreshExpiryNotifications();
}
