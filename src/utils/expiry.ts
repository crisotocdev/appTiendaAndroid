// src/utils/expiry.ts
import dayjs, { Dayjs } from 'dayjs';

export type ExpiryStatus = 'none' | 'ok' | 'soon' | 'expired';

export type ExpiryInfo = {
  status: ExpiryStatus;
  days: number | null;
  label: string;
  color: string;
};

export type ExpiryOpts = {
  /** Días máximos para considerar "por vencer" (>=1). Default: 7 */
  soonThresholdDays?: number;
  /** Días máximos para considerar "ok" antes del verde brillante. Default: 30 */
  okThresholdDays?: number;
  /** Para tests o cálculos controlados */
  today?: Dayjs;
};

// Crea un Dayjs inválido sin usar dayjs.invalid()
const INVALID = () => dayjs('Invalid Date');

// Parser tolerante: ISO, YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
function parseDateSmart(input?: string | null) {
  if (!input) return INVALID();
  const raw = String(input).trim();
  if (!raw) return INVALID();

  const m = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const d = dayjs(`${yyyy}-${mm}-${dd}`);
    return d.isValid() ? d : INVALID();
  }

  const d = dayjs(raw);
  return d.isValid() ? d : INVALID();
}

export function getExpiryInfo(dateStr?: string | null, opts: ExpiryOpts = {}): ExpiryInfo {
  if (!dateStr) {
    return { status: 'none', days: null, label: 'Sin fecha', color: '#6b7280' };
  }

  // Umbrales configurables
  const soonT = Math.max(1, Math.floor(opts.soonThresholdDays ?? 7));
  const okT   = Math.max(soonT + 1, Math.floor(opts.okThresholdDays ?? 30));
  const today = (opts.today ?? dayjs()).startOf('day');

  const date = parseDateSmart(dateStr);
  if (!date.isValid()) {
    return { status: 'none', days: null, label: 'Fecha inválida', color: '#6b7280' };
  }

  const d = date.startOf('day').diff(today, 'day');

  if (d < 0)   return { status: 'expired', days: d, label: 'Vencido',          color: '#b91c1c' };
  if (d === 0) return { status: 'soon',    days: d, label: 'Vence hoy',        color: '#ea580c' };
  if (d <= soonT) return { status: 'soon', days: d, label: `Vence en ${d} días`, color: '#f97316' };
  if (d <= okT)   return { status: 'ok',   days: d, label: `En ${d} días`,       color: '#65a30d' };

  return { status: 'ok', days: d, label: `En ${d} días`, color: '#22c55e' };
}
