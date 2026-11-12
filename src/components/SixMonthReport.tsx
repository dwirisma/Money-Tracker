import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Printer } from 'lucide-react';
import type { Transaction } from '../types';
import { formatRupiah } from '../utils/calculator';
import { buildSixMonths, sixMonthsCsv } from '../utils/sixMonths';
import { Money, NeoButton, NeoCard } from './ui/Neo';

const compact = (v: number) => (Math.abs(v) >= 1e6 ? `${+(v / 1e6).toFixed(1)} jt` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)} rb` : String(v));

/** Cetak dalam tema terang (hemat tinta) lalu kembalikan tema aktif setelah dialog cetak ditutup. */
function printLight() {
  const root = document.documentElement;
  const prev = root.getAttribute('data-theme');
  root.setAttribute('data-theme', 'light');
  const restore = () => { root.setAttribute('data-theme', prev || 'dark'); window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
}

export function SixMonthReport({ transactions, ledgerName }: { transactions: Transaction[]; ledgerName: string }) {
  const rows = useMemo(() => buildSixMonths(transactions), [transactions]);

  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob([sixMonthsCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `Arus_Kas_6_Bulan_${ledgerName.replace(/[^\w-]+/g, '_')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <NeoCard className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-heading font-bold text-[var(--text-primary)]">Arus Kas 6 Bulan Terakhir</h3>
          <p className="text-xs text-[var(--text-secondary)]">Buku kas {ledgerName}. Transfer antar akun tidak dihitung.</p>
        </div>
        <div className="flex gap-2 no-print">
          <NeoButton onClick={downloadCsv} className="flex items-center gap-1 text-xs"><Download className="w-4 h-4" />CSV</NeoButton>
          <NeoButton onClick={printLight} className="flex items-center gap-1 text-xs"><Printer className="w-4 h-4" />Cetak / PDF</NeoButton>
        </div>
      </div>

      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
            <YAxis tickFormatter={compact} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} width={48} />
            <Tooltip formatter={(v) => formatRupiah(Number(v))} contentStyle={{ background: 'var(--bg-surface)', border: '2px solid var(--border-color)', borderRadius: 4, color: 'var(--text-primary)' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="income" name="Pemasukan" fill="#2dd4a7" stroke="var(--border-color)" />
            <Bar dataKey="expense" name="Pengeluaran" fill="#ff7a4d" stroke="var(--border-color)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-mono uppercase text-[var(--text-secondary)] border-b-2 border-[var(--border-color)]">
              <th className="py-2 pr-3">Bulan</th><th className="pr-3 text-right">Pemasukan</th><th className="pr-3 text-right">Pengeluaran</th><th className="pr-3 text-right">Surplus / Defisit</th><th className="pr-3 text-right">Rasio</th><th className="text-right">Pengeluaran vs bulan lalu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className="border-b border-[var(--border-subtle)]">
                <td className="py-2 pr-3 font-bold text-[var(--text-primary)]">{r.label}</td>
                <td className="pr-3 text-right"><Money value={r.income} tone="income" /></td>
                <td className="pr-3 text-right"><Money value={r.expense} tone="expense" /></td>
                <td className="pr-3 text-right"><Money value={r.net} tone="auto" className="font-bold" /></td>
                <td className="pr-3 text-right font-num text-[var(--text-primary)]">{r.ratio === null ? '-' : `${r.ratio.toFixed(1)}%`}</td>
                <td className="text-right font-num text-[var(--text-secondary)]">{r.expenseDelta === null ? '-' : `${r.expenseDelta > 0 ? '▲' : r.expenseDelta < 0 ? '▼' : '='} ${Math.abs(r.expenseDelta).toFixed(0)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </NeoCard>
  );
}
