import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import 'dayjs/locale/pt-br';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.locale('pt-br');

export const DEFAULT_TZ = 'America/Sao_Paulo';

export function nowIn(tz: string = DEFAULT_TZ): dayjs.Dayjs {
  return dayjs().tz(tz);
}

export interface DateRange {
  from: Date;
  to: Date;
}

/** Intervalo [inicio, fim) de um dia no timezone informado. */
export function dayRange(date: dayjs.ConfigType, tz: string = DEFAULT_TZ): DateRange {
  const d = dayjs.tz(date, tz);
  return { from: d.startOf('day').toDate(), to: d.add(1, 'day').startOf('day').toDate() };
}

export function monthRange(date: dayjs.ConfigType, tz: string = DEFAULT_TZ): DateRange {
  const d = dayjs.tz(date, tz);
  return { from: d.startOf('month').toDate(), to: d.add(1, 'month').startOf('month').toDate() };
}

/**
 * Interpreta expressoes de data em linguagem natural PT-BR usadas pela IA e pelo painel.
 * Aceita: 'hoje', 'ontem', 'amanha', 'semana', 'mes', ISO, dd/mm/yyyy, dd/mm.
 */
export function parseNaturalDate(input: string, tz: string = DEFAULT_TZ): Date | null {
  const raw = input.trim().toLowerCase();
  const base = nowIn(tz);
  const map: Record<string, dayjs.Dayjs> = {
    hoje: base,
    'agora': base,
    ontem: base.subtract(1, 'day'),
    anteontem: base.subtract(2, 'day'),
    amanha: base.add(1, 'day'),
    'amanhã': base.add(1, 'day'),
    'depois de amanha': base.add(2, 'day'),
  };
  if (raw in map) return map[raw]!.toDate();

  const iso = dayjs(input);
  if (iso.isValid() && /\d{4}-\d{2}-\d{2}/.test(input)) return iso.toDate();

  for (const fmt of ['DD/MM/YYYY', 'D/M/YYYY', 'DD/MM/YY', 'DD/MM', 'D/M']) {
    const p = dayjs.tz(input, fmt, tz);
    if (p.isValid()) {
      const year = /\/\d{2,4}\s*$/.test(input) ? p.year() : base.year();
      return p.year(year).toDate();
    }
  }
  return null;
}

export function parseNaturalDateTime(input: string, tz: string = DEFAULT_TZ): Date | null {
  const dateTimeMatch = input
    .trim()
    .toLowerCase()
    .match(/^(.*?)(?:\s+(?:as|às|as as)\s+|\s+)(\d{1,2})(?:[:h](\d{2}))?\s*h?$/);
  if (dateTimeMatch) {
    const [, datePart, hh, mm] = dateTimeMatch;
    const day = parseNaturalDate((datePart || 'hoje').trim() || 'hoje', tz);
    if (day) {
      return dayjs(day)
        .tz(tz)
        .hour(Number(hh))
        .minute(mm ? Number(mm) : 0)
        .second(0)
        .millisecond(0)
        .toDate();
    }
  }
  const iso = dayjs(input);
  if (iso.isValid() && input.includes('T')) return iso.toDate();
  return parseNaturalDate(input, tz);
}

export { dayjs };
