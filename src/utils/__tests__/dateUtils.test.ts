// src/utils/__tests__/dateUtils.test.ts
import { isValidYMD } from '../dateUtils';

describe('isValidYMD', () => {
  it('acepta fechas válidas básicas', () => {
    expect(isValidYMD('2024-01-01')).toBe(true);
    expect(isValidYMD('1999-12-31')).toBe(true);
  });

  it('acepta años bisiestos válidos', () => {
    // 2020 fue bisiesto
    expect(isValidYMD('2020-02-29')).toBe(true);
  });

  it('rechaza fechas con formato incorrecto', () => {
    expect(isValidYMD('')).toBe(false);
    expect(isValidYMD('2024/01/01')).toBe(false);
    expect(isValidYMD('2024-1-1')).toBe(false);          // falta 0
    expect(isValidYMD('24-01-01')).toBe(false);          // año corto
    expect(isValidYMD('2024-001-01')).toBe(false);       // mes raro
  });

  it('rechaza fechas imposibles en calendario', () => {
    expect(isValidYMD('2024-13-01')).toBe(false);        // mes 13
    expect(isValidYMD('2024-00-10')).toBe(false);        // mes 0
    expect(isValidYMD('2024-01-00')).toBe(false);        // día 0
    expect(isValidYMD('2024-02-30')).toBe(false);        // febrero 30
    expect(isValidYMD('2021-02-29')).toBe(false);        // no bisiesto
  });
});
