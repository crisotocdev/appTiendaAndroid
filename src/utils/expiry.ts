// src/utils/expiry.ts
import dayjs from 'dayjs';

export type ExpiryStatus = 'none' | 'ok' | 'soon' | 'expired';

export type ExpiryInfo = {
  status: ExpiryStatus;
  days: number | null;
  label: string;
  color: string;
};

// Recibe un string tipo "2025-11-03" o ISO, o null
export function getExpiryInfo(dateStr?: string | null): ExpiryInfo {
  if (!dateStr) {
    return {
      status: 'none',
      days: null,
      label: 'Sin fecha',
      color: '#6b7280', // gris
    };
  }

  const today = dayjs().startOf('day');
  const date = dayjs(dateStr);

  if (!date.isValid()) {
    // Por si viene algo raro de la BD
    return {
      status: 'none',
      days: null,
      label: 'Fecha inválida',
      color: '#6b7280',
    };
  }

  const d = date.startOf('day').diff(today, 'day'); // días hasta el vencimiento

  if (d < 0) {
    return {
      status: 'expired',
      days: d,
      label: 'Vencido',
      color: '#b91c1c', // rojo
    };
  }

  if (d === 0) {
    return {
      status: 'soon',
      days: d,
      label: 'Vence hoy',
      color: '#ea580c', // naranjo fuerte
    };
  }

  if (d <= 7) {
    return {
      status: 'soon',
      days: d,
      label: `Vence en ${d} días`,
      color: '#f97316', // naranjo
    };
  }

  if (d <= 30) {
    return {
      status: 'ok',
      days: d,
      label: `En ${d} días`,
      color: '#65a30d', // verde medio
    };
  }

  return {
    status: 'ok',
    days: d,
    label: `En ${d} días`,
    color: '#22c55e', // verde brillante
  };
}
