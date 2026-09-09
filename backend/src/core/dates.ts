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

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  'segunda': 1,
  'segunda-feira': 1,
  terca: 2,
  'terça': 2,
  'terca-feira': 2,
  'terça-feira': 2,
  quarta: 3,
  'quarta-feira': 3,
  quinta: 4,
  'quinta-feira': 4,
  sexta: 5,
  'sexta-feira': 5,
  sabado: 6,
  'sábado': 6,
};

/**
 * Interpreta expressoes de data em linguagem natural PT-BR (secao 13).
 * Aceita: 'hoje', 'ontem', 'amanha', 'depois de amanha', dias da semana,
 * 'semana que vem', 'daqui a N dias/semanas', ISO, dd/mm/yyyy, dd/mm.
 * Sempre no timezone da empresa.
 */
export function parseNaturalDate(input: string, tz: string = DEFAULT_TZ): Date | null {
  const raw = input.trim().toLowerCase().replace(/\s+/g, ' ');
  const base = nowIn(tz);
  const map: Record<string, dayjs.Dayjs> = {
    hoje: base,
    agora: base,
    ontem: base.subtract(1, 'day'),
    anteontem: base.subtract(2, 'day'),
    amanha: base.add(1, 'day'),
    'amanhã': base.add(1, 'day'),
    'depois de amanha': base.add(2, 'day'),
    'depois de amanhã': base.add(2, 'day'),
    'semana que vem': base.add(1, 'week').startOf('week').add(1, 'day'),
    'proxima semana': base.add(1, 'week').startOf('week').add(1, 'day'),
    'próxima semana': base.add(1, 'week').startOf('week').add(1, 'day'),
    'mes que vem': base.add(1, 'month').startOf('month'),
    'mês que vem': base.add(1, 'month').startOf('month'),
  };
  if (raw in map) return map[raw]!.toDate();

  // "daqui a 3 dias" / "em 2 semanas"
  const rel = raw.match(/^(?:daqui a|em|daqui)\s+(\d+)\s+(dia|dias|semana|semanas|mes|meses|mês|mêses)$/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2]!.startsWith('semana') ? 'week' : rel[2]!.startsWith('m') ? 'month' : 'day';
    return base.add(n, unit).toDate();
  }

  // dia da semana (proxima ocorrencia)
  const wdKey = raw.replace(/^(proxima |próxima |na |essa |nesta )/, '');
  if (wdKey in WEEKDAYS) {
    const target = WEEKDAYS[wdKey]!;
    let d = base;
    for (let i = 1; i <= 7; i++) {
      d = d.add(1, 'day');
      if (d.day() === target) break;
    }
    return d.toDate();
  }

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
  const raw = input.trim().toLowerCase().replace(/\s+/g, ' ');

  // "daqui a duas horas" / "em 2 horas" / "daqui a 90 minutos"
  const numWords: Record<string, number> = { uma: 1, duas: 2, tres: 3, 'três': 3, meia: 0.5 };
  const relH = raw.match(/^(?:daqui a|em|daqui)\s+(\d+|uma|duas|tres|três|meia)\s+(hora|horas|minuto|minutos|min)$/);
  if (relH) {
    const n = numWords[relH[1]!] ?? Number(relH[1]);
    const mins = relH[2]!.startsWith('min') ? n : n * 60;
    return nowIn(tz).add(mins, 'minute').second(0).millisecond(0).toDate();
  }

  const dateTimeMatch = raw.match(
    /^(.*?)(?:\s+(?:as|às|as as)\s+|\s+)(\d{1,2})(?:[:h](\d{2}))?\s*h?$/,
  );
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
