// src/notifications.ts
// Fondo: por ahora deshabilitamos las tareas en segundo plano para
// evitar dependencias al db.ts viejo. Dejamos la API estable
// para reactivarla más adelante con usecases.

export const BACKGROUND_TASK_NAME = 'inventory-expiry-lowstock-check';

let warned = false;
function warnOnce() {
  if (__DEV__ && !warned) {
    console.log('[notifications] Background task stub activa (sin efecto).');
    warned = true;
  }
}

// No-op: mantiene compatibilidad si alguien llama a estas funciones “nuevas”
export async function registerBackgroundTask(): Promise<void> {
  warnOnce();
}

export async function unregisterBackgroundTask(): Promise<void> {
  warnOnce();
}

// ————— Compatibilidad con imports antiguos —————
// (Para que App.tsx u otras partes no fallen aunque aún importen estos nombres)
export async function askNotificationPermission(): Promise<void> {
  warnOnce();
}

export async function scheduleDailyCheck(): Promise<void> {
  warnOnce();
}
