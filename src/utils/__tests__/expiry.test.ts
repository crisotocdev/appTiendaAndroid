// src/utils/__tests__/expiry.test.ts
import { getExpiryInfo } from '../expiry';

describe('getExpiryInfo', () => {
  // Fijamos la fecha "actual" para que los tests no dependan del día real
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-10T12:00:00Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const cfg = {
    soonThresholdDays: 7,
    okThresholdDays: 30,
  };

  it('devuelve status "none" si no hay fecha', () => {
    const r = getExpiryInfo(null as any, cfg);
    expect(r.status).toBe('none');
    expect(r.days).toBeNull();
  });

  it('marca como "expired" cuando la fecha es anterior a hoy', () => {
    const r = getExpiryInfo('2025-01-05', cfg); // 5 días atrás
    expect(r.status).toBe('expired');
    expect(typeof r.days).toBe('number');
    expect(r.days!).toBeLessThan(0);
  });

  it('marca como "soon" si falta menos o igual al umbral soonThresholdDays', () => {
    const r = getExpiryInfo('2025-01-15', cfg); // 5 días después
    expect(r.status).toBe('soon');
    expect(r.days).toBeGreaterThanOrEqual(0);
    expect(r.days).toBeLessThanOrEqual(cfg.soonThresholdDays);
  });

  it('marca como "ok" cuando está más lejos que "soon" pero dentro de okThresholdDays', () => {
    const r = getExpiryInfo('2025-02-05', cfg); // ~26 días después
    expect(r.status).toBe('ok');
    expect(r.days).toBeGreaterThan(cfg.soonThresholdDays);
    expect(r.days).toBeLessThanOrEqual(cfg.okThresholdDays);
  });
});
