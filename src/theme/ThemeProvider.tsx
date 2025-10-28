// src/theme/ThemeProvider.tsx
import React, { createContext, useContext } from 'react';
import { theme, Theme } from '../theme';

const ThemeCtx = createContext<Theme>(theme);
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>;
}
