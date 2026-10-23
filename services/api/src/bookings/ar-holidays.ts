/**
 * National holidays of Argentina (days off, including bridge days) as local dates. Provisional:
 * confirm each year against the official decree before relying on it; any other year is
 * imported by passing `dates` explicitly.
 */
export const AR_HOLIDAYS: Readonly<Record<number, readonly { date: string; name: string }[]>> = {
  2026: [
    { date: '2026-01-01', name: 'Año Nuevo' },
    { date: '2026-02-16', name: 'Carnaval' },
    { date: '2026-02-17', name: 'Carnaval' },
    { date: '2026-03-23', name: 'Feriado puente' },
    { date: '2026-03-24', name: 'Día de la Memoria' },
    { date: '2026-04-02', name: 'Día de Malvinas' },
    { date: '2026-04-03', name: 'Viernes Santo' },
    { date: '2026-05-01', name: 'Día del Trabajador' },
    { date: '2026-05-25', name: 'Revolución de Mayo' },
    { date: '2026-06-15', name: 'Paso a la Inmortalidad de Güemes' },
    { date: '2026-06-20', name: 'Día de la Bandera' },
    { date: '2026-07-09', name: 'Día de la Independencia' },
    { date: '2026-07-10', name: 'Feriado puente' },
    { date: '2026-08-17', name: 'Paso a la Inmortalidad de San Martín' },
    { date: '2026-10-12', name: 'Diversidad Cultural' },
    { date: '2026-11-23', name: 'Soberanía Nacional' },
    { date: '2026-12-07', name: 'Feriado puente' },
    { date: '2026-12-08', name: 'Inmaculada Concepción' },
    { date: '2026-12-25', name: 'Navidad' },
  ],
};

export function holidaysOf(year: number): readonly { date: string; name: string }[] {
  return AR_HOLIDAYS[year] ?? [];
}
