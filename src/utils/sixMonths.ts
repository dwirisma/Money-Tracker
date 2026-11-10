import type { Transaction } from '../types';

export interface MonthRow { key: string; label: string; income: number; expense: number; net: number; ratio: number | null; expenseDelta: number | null }

/** Ringkasan 6 bulan terakhir (termasuk bulan berjalan). Transfer antar akun tidak dihitung. */
export function buildSixMonths(txs: Pick<Transaction, 'date' | 'type' | 'amount'>[], now = new Date()): MonthRow[] {
  const rows: MonthRow[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let income = 0, expense = 0;
    for (const t of txs) {
      if (!t.date.startsWith(key)) continue;
      if (t.type === 'income') income += t.amount; else if (t.type === 'expense') expense += t.amount;
    }
    const prev = rows[rows.length - 1];
    rows.push({
      key, label: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }), income, expense, net: income - expense,
      ratio: income > 0 ? ((income - expense) / income) * 100 : null,
      expenseDelta: prev && prev.expense > 0 ? ((expense - prev.expense) / prev.expense) * 100 : null,
    });
  }
  return rows;
}

export function sixMonthsCsv(rows: MonthRow[]): string {
  const head = 'Bulan,Pemasukan,Pengeluaran,Surplus/Defisit,Rasio Tabungan (%)';
  const body = rows.map(r => [r.key, r.income, r.expense, r.net, r.ratio === null ? '' : r.ratio.toFixed(1)].join(','));
  return '\uFEFF' + [head, ...body].join('\r\n');
}
