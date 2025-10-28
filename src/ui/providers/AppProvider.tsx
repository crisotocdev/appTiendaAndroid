// src/ui/providers/AppProvider.tsx
'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type PropsWithChildren,
} from 'react';
import { buildContainer, type AppContainer } from '../../config/container';
import { runMigrations } from '../../infrastructure/persistence/sqlite/migrations';
import { nukeDemoRows } from '../../infrastructure/persistence/sqlite/devTools';

type AppCtxValue = {
  /** Para pantallas: usamos esto */
  usecases: any;
  /** Por si necesitas acceder al contenedor original */
  container: AppContainer | any;
};

const Ctx = createContext<AppCtxValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const container = useMemo(buildContainer, []);

  useEffect(() => {
    // 1) Migraciones / esquema
    runMigrations();

    // 2) (solo DEV) limpia el registro de prueba una sola vez
    if (__DEV__) {
      try {
        nukeDemoRows();
      } catch (e) {
        console.warn('nukeDemoRows failed:', e);
      }
    }
  }, []);

  // Exponemos un alias "usecases" robusto para que las pantallas encuentren métodos
  const value = useMemo<AppCtxValue>(() => {
    const c: any = container;
    // preferimos container.usecases, luego useCases/uc, y si no existe, el container completo
    const uc =
      c?.usecases ??
      c?.useCases ??
      c?.uc ??
      c;

    return { usecases: uc, container: c };
  }, [container]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('AppProvider missing');
  return ctx;
}
