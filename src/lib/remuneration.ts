// Fixed-salary pay for a reporting period.
// The salary is stored as a monthly amount; for a period it is pro-rated by days within each calendar month,
// so whole months pay exactly one salary each and part months pay their share (e.g. 16 of 30 days).
export function fixedSalaryForPeriod(monthlyCents: number, from: Date, to: Date): number {
  if (!(monthlyCents > 0) || to.getTime() < from.getTime()) return 0;
  const dayMs = 86400000;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const start = day(from);
  const end = day(to);
  let total = 0;
  for (let m = new Date(start.getFullYear(), start.getMonth(), 1); m <= end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const monthStart = m;
    const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    const a = start > monthStart ? start : monthStart;
    const b = end < monthEnd ? end : monthEnd;
    const days = Math.round((b.getTime() - a.getTime()) / dayMs) + 1;
    const inMonth = monthEnd.getDate();
    total += (monthlyCents * days) / inMonth;
  }
  return Math.round(total);
}
