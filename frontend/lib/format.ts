import { SALARY_PERIOD_LABELS, type SalaryPeriod } from '@edu-forum/shared';

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

export function salaryRange(min: number, max: number, period: SalaryPeriod): string {
  return `${naira.format(min)}–${naira.format(max)} ${SALARY_PERIOD_LABELS[period]}`;
}

export function money(amount: number): string {
  return naira.format(amount);
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}
