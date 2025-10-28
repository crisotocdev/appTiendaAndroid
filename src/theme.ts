// src/theme.ts
export type Theme = {
  colors: {
    primary: string;      // Rojo toldo
    primaryDark: string;
    secondary: string;    // Azul puerta
    accent: string;       // Amarillo letrero/luces
    background: string;   // Crema cálido
    surface: string;      // Tarjetas / header
    text: string;         // Texto principal
    textMuted: string;    // Texto secundario
    border: string;       // Líneas sutiles
    success: string;
    warning: string;
    error: string;
  };
  spacing: (m: number) => number;
  radius: { sm: number; md: number; lg: number; pill: number };
  typography: { h1: number; h2: number; h3: number; body: number; small: number };
};

export const theme: Theme = {
  colors: {
    primary:      '#E43C3A', // rojo toldo
    primaryDark:  '#BF2F2E',
    secondary:    '#2D9CDB', // azul puerta/ventanas
    accent:       '#F5C144', // amarillo letrero
    background:   '#FFF7EB', // crema cálido (fondo app)
    surface:      '#FFFFFF', // tarjetas / header claro
    text:         '#1F2937', // gris carbón
    textMuted:    '#6B7280', // gris medio
    border:       '#E5E7EB', // gris borde sutil
    success:      '#22C55E',
    warning:      '#F59E0B',
    error:        '#EF4444',
  },
  spacing: (m) => m * 4,
  radius: { sm: 6, md: 10, lg: 16, pill: 999 },
  typography: { h1: 28, h2: 22, h3: 18, body: 16, small: 13 },
};
