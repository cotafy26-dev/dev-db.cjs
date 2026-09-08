import { describe, expect, it } from 'vitest';
import { parseNaturalDate, parseNaturalDateTime, dayjs } from '../src/core/dates';

describe('parseNaturalDate', () => {
  it('resolve palavras relativas', () => {
    const hoje = dayjs().format('YYYY-MM-DD');
    const amanha = dayjs().add(1, 'day').format('YYYY-MM-DD');
    expect(dayjs(parseNaturalDate('hoje')).format('YYYY-MM-DD')).toBe(hoje);
    expect(dayjs(parseNaturalDate('amanha')).format('YYYY-MM-DD')).toBe(amanha);
    expect(dayjs(parseNaturalDate('ontem')).format('YYYY-MM-DD')).toBe(
      dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
    );
  });

  it('resolve dd/mm/yyyy e dd/mm', () => {
    expect(dayjs(parseNaturalDate('25/12/2026')).format('YYYY-MM-DD')).toBe('2026-12-25');
    const y = dayjs().year();
    expect(dayjs(parseNaturalDate('01/06')).format('YYYY-MM-DD')).toBe(`${y}-06-01`);
  });

  it('retorna null para lixo', () => {
    expect(parseNaturalDate('qualquer coisa')).toBeNull();
  });
});

describe('parseNaturalDateTime', () => {
  it('extrai hora de "amanha as 14h"', () => {
    const d = parseNaturalDateTime('amanha as 14h');
    expect(d).not.toBeNull();
    expect(dayjs(d!).hour()).toBe(14);
    expect(dayjs(d!).format('YYYY-MM-DD')).toBe(dayjs().add(1, 'day').format('YYYY-MM-DD'));
  });

  it('extrai hora com minutos "10/12 09:30"', () => {
    const d = parseNaturalDateTime('10/12 09:30');
    expect(dayjs(d!).hour()).toBe(9);
    expect(dayjs(d!).minute()).toBe(30);
  });
});
