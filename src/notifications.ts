// src/notifications.ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import productRepo from './infrastructure/persistence/sqlite/ProductRepoSQLite';
import { getExpiryWarningDays } from './settings/expirySettings';

export const BACKGROUND_TASK_NAME = 'inventory-expiry-lowstock-check';

// ----------------- Config básica de notificaciones -----------------

// src/notifications.ts

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // 🔊 Sonido y badge como antes
    shouldPlaySound: true,
    shouldSetBadge: false,

    // 👇 API nueva
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

// ----------------- Avisos de vencimiento -----------------

export async function refreshExpiryNotifications(): Promise<void> {
  try {
    const ok = await ensurePermission();
    if (!ok) {
      return;
    }

    const thresholdDays = await getExpiryWarningDays();

    await Notifications.cancelAllScheduledNotificationsAsync();

    const products: any[] = await productRepo.getAll();

    for (const p of products) {
      const props = (p as any).props ?? p;

      const name: string = props.name ?? 'Producto';
      const nextExpiry: string | null = props.nextExpiry ?? null;

      const rawDays = props.daysToExpiry;
      const daysToExpiry: number | null =
        typeof rawDays === 'number' && Number.isFinite(rawDays) ? rawDays : null;

      if (!nextExpiry) continue;
      if (daysToExpiry == null) continue;
      if (daysToExpiry < 0) continue;
      if (daysToExpiry > thresholdDays) continue;

      let body: string;
      if (daysToExpiry === 0) {
        body = `El producto "${name}" vence HOY (${nextExpiry}).`;
      } else if (daysToExpiry === 1) {
        body = `Al producto "${name}" le queda 1 día antes de vencer (${nextExpiry}).`;
      } else {
        body = `Al producto "${name}" le quedan ${daysToExpiry} día(s) antes de vencer (${nextExpiry}).`;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Producto por vencer',
          body,
        },
        trigger: { seconds: 2 },
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
      content: {
        title,
        body,
      },
      trigger: null, // inmediato
    } as any);
  } catch (e) {
    console.log('[notifications] error en notifyStockAlert', e);
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
