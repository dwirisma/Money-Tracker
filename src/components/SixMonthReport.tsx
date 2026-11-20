import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Download, Printer } from 'lucide-react';
import type { Transaction } from '../types';
import { formatRupiah } from '../utils/financeUtils';
import { buildSixMonths, sixMonthsCsv } from '../utils/dateUtils';
import { Money } from './ui/BaseUI';

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

  const last = rows[rows.length - 1];
  return (
    <section className="ax-panel ax-sec">
      <div className="ax-secthead">
        <div>
          <h3><BarChart3 className="w-5 h-5" style={{ color: 'var(--accent-blue)' }} />Arus Kas 6 Bulan Terakhir{last ? <em>{last.label}</em> : null}</h3>
          <p className="ax-sec-sub">Buku kas {ledgerName}. Transfer antar akun tidak dihitung.</p>
        </div>
        <div className="ax-btnrow no-print">
          <button type="button" onClick={downloadCsv} className="brutal-btn ax-btn-light"><Download className="w-4 h-4" />CSV</button>
          <button type="button" onClick={printLight} className="brutal-btn ax-btn-light"><Printer className="w-4 h-4" />Cetak / PDF</button>
        </div>
      </div>

      <div className="ax-leg">
        <span><i style={{ background: 'var(--accent-sage)' }} />Pemasukan</span>
        <span><i style={{ background: 'var(--accent-terracotta)' }} />Pengeluaran</span>
      </div>

      <div className="ax-rchart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
            <YAxis tickFormatter={compact} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} width={48} />
            <Tooltip formatter={(v) => formatRupiah(Number(v))} cursor={{ fill: 'var(--bg-muted)', opacity: 0.5 }}
              contentStyle={{ background: 'var(--bg-surface)', border: '2px solid var(--border-color)', borderRadius: 12, color: 'var(--text-primary)', boxShadow: 'var(--shadow-md)' }} />
            <Bar dataKey="income" name="Pemasukan" fill="var(--accent-sage)" stroke="var(--border-color)" strokeWidth={1.5} radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" name="Pengeluaran" fill="var(--accent-terracotta)" stroke="var(--border-color)" strokeWidth={1.5} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="ax-tbl">
          <thead>
            <tr>
              <th>Bulan</th><th>Pemasukan</th><th>Pengeluaran</th><th>Surplus / Defisit</th><th>Rasio</th><th>Keluar vs bulan lalu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td><Money value={r.income} tone="income" /></td>
                <td><Money value={r.expense} tone="expense" /></td>
                <td><Money value={r.net} tone="auto" className="font-bold" /></td>
                <td className="font-num">{r.ratio === null ? '-' : `${r.ratio.toFixed(1)}%`}</td>
                <td className="font-num" style={{ color: 'var(--text-secondary)' }}>{r.expenseDelta === null ? '-' : `${r.expenseDelta > 0 ? '▲' : r.expenseDelta < 0 ? '▼' : '='} ${Math.abs(r.expenseDelta).toFixed(0)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
