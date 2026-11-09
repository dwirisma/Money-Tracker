import { useMemo, useState } from 'react';
import { Activity, CalendarClock, Landmark, PiggyBank, Target, TrendingDown, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import type { Account, Bill, Debt, Goal, Transaction } from '../types';
import { calculateNetWorthAccounts, getBillDueStatus } from '../services/cashManagementService';
import { Money, NeoCard } from './ui/Neo';
import type { ModuleId } from './layout/navConfig';

interface Props {
  ledgerName: string;
  accounts: Account[];
  transactions: Transaction[];
  goals: Goal[];
  bills: Bill[];
  debts: Debt[];
  onNavigate: (id: ModuleId) => void;
}

const WINDOWS = [7, 14, 30] as const;

function greeting(h: number) {
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
}

/** Skor 0-100: tabungan (40) + tagihan tidak telat (30) + beban utang terhadap aset (30) */
function healthScore(savingsRatio: number, overdueCount: number, assets: number, liabilities: number) {
  const s = Math.min(40, Math.max(0, (savingsRatio / 20) * 40));
  const b = Math.max(0, 30 - overdueCount * 10);
  const d = assets > 0 ? 30 * (1 - Math.min(1, liabilities / assets)) : liabilities > 0 ? 0 : 30;
  return Math.round(s + b + d);
}

function scoreMeta(score: number) {
  if (score >= 80) return { label: 'Sehat', color: 'var(--accent-sage)' };
  if (score >= 60) return { label: 'Waspada', color: 'var(--accent-sand)' };
  if (score >= 40) return { label: 'Perlu perhatian', color: 'var(--accent-terracotta)' };
  return { label: 'Kritis', color: 'var(--accent-terracotta)' };
}

function Metric({ icon: Icon, label, children, hint }: { icon: LucideIcon; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <NeoCard className="p-4 flex flex-col gap-2" title={hint}>
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        <Icon className="w-4 h-4" />
        <span className="font-mono text-[11px] font-bold tracking-wide uppercase">{label}</span>
      </div>
      <div className="font-heading font-bold text-xl sm:text-2xl text-[var(--text-primary)] break-words">{children}</div>
    </NeoCard>
  );
}

export function DashboardPage({ ledgerName, accounts, transactions, goals, bills, debts, onNavigate }: Props) {
  const [windowDays, setWindowDays] = useState<number>(7);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const d = useMemo(() => {
    const { totalAssets, totalCreditDebt, netBalance } = calculateNetWorthAccounts(accounts);
    let income = 0, expense = 0;
    transactions.forEach(t => {
      if (!t.date.startsWith(ym)) return;
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') expense += t.amount;
    });
    const savingsRatio = income > 0 ? ((income - expense) / income) * 100 : 0;
    const debtLeft = debts.filter(x => !x.isPaidOff).reduce((n, x) => n + x.remainingDebt, 0);
    const liabilities = totalCreditDebt + debtLeft;

    const dueItems = [
      ...bills.map(b => ({ key: 'b' + b.id, name: b.name, amount: b.fixedAmount ?? b.lastNominal ?? 0, kind: 'Tagihan', st: getBillDueStatus(b.nextPaymentDate) })),
      ...debts.filter(x => !x.isPaidOff && x.nextPaymentDate).map(x => ({ key: 'd' + x.id, name: x.name, amount: x.remainingDebt, kind: 'Sisa utang', st: getBillDueStatus(x.nextPaymentDate) })),
    ].sort((a, b) => a.st.daysLeft - b.st.daysLeft);
    const overdueCount = dueItems.filter(i => i.st.isOverdue).length;

    const nearGoals = goals.filter(g => !g.isCompleted && g.targetAmount > 0)
      .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')).slice(0, 2);

    const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || Number(b.createdAt) - Number(a.createdAt)).slice(0, 5);
    const score = healthScore(savingsRatio, overdueCount, totalAssets, liabilities);
    return { netBalance, income, expense, savingsRatio, netWorth: netBalance - debtLeft, dueItems, nearGoals, recent, score };
  }, [accounts, transactions, goals, bills, debts, ym]);

  const accName = (id: string) => accounts.find(a => a.id === id)?.name ?? '-';
  const meta = scoreMeta(d.score);
  const due = d.dueItems.filter(i => i.st.daysLeft <= windowDays);
  const R = 26, C = 2 * Math.PI * R;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-2xl text-[var(--text-primary)]">{greeting(now.getHours())}!</h2>
        <p className="text-sm text-[var(--text-secondary)]">Ringkasan hari ini untuk buku kas <b>{ledgerName}</b>.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Metric icon={Wallet} label="Total saldo" hint="Aset kas & bank dikurangi tagihan kartu kredit"><Money value={d.netBalance} /></Metric>
        <Metric icon={TrendingUp} label="Pemasukan bulan ini" hint="Transfer antar akun tidak dihitung"><Money value={d.income} tone="income" /></Metric>
        <Metric icon={TrendingDown} label="Pengeluaran bulan ini" hint="Transfer antar akun tidak dihitung"><Money value={d.expense} tone="expense" /></Metric>
        <Metric icon={PiggyBank} label="Rasio tabungan" hint="(Pemasukan - Pengeluaran) / Pemasukan bulan ini">
          <span className="font-num">{d.income > 0 ? `${d.savingsRatio.toFixed(1)}%` : '-'}</span>
        </Metric>
        <Metric icon={Landmark} label="Nilai kekayaan" hint="Total saldo dikurangi sisa utang"><Money value={d.netWorth} tone="auto" /></Metric>
        <NeoCard className="p-4 flex items-center gap-3" title="Skor = tabungan (40) + tagihan tidak telat (30) + beban utang terhadap aset (30)">
          <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0 -rotate-90" aria-hidden="true">
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--bg-muted)" strokeWidth="8" />
            <circle cx="32" cy="32" r={R} fill="none" stroke={meta.color} strokeWidth="8" strokeDasharray={C} strokeDashoffset={C * (1 - d.score / 100)} />
          </svg>
          <div>
            <div className="flex items-center gap-1.5 text-[var(--text-secondary)]"><Activity className="w-4 h-4" /><span className="font-mono text-[11px] font-bold uppercase">Status keuangan</span></div>
            <div className="font-heading font-bold text-xl text-[var(--text-primary)]">{d.score}<span className="text-sm text-[var(--text-secondary)]"> / 100</span></div>
            <div className="text-xs font-bold" style={{ color: meta.color }}>{meta.label}</div>
          </div>
        </NeoCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <NeoCard className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-heading font-bold flex items-center gap-2 text-[var(--text-primary)]"><CalendarClock className="w-4 h-4" />Jatuh tempo dalam {windowDays} hari</h3>
            <div className="flex gap-1">
              {WINDOWS.map(w => (
                <button key={w} type="button" onClick={() => setWindowDays(w)} className="brutal-badge" style={windowDays === w ? { background: 'var(--accent-sand)', color: '#111' } : undefined}>{w}h</button>
              ))}
            </div>
          </div>
          {due.length === 0 && <p className="text-sm text-[var(--text-secondary)]">Tidak ada tagihan atau cicilan yang jatuh tempo dalam {windowDays} hari ke depan.</p>}
          {due.slice(0, 5).map(i => (
            <button key={i.key} type="button" onClick={() => onNavigate('module3')} className="w-full flex items-center justify-between gap-3 text-left border-t-2 border-[var(--border-subtle)] pt-2">
              <span className="min-w-0">
                <span className="block font-bold text-sm truncate text-[var(--text-primary)]">{i.name}</span>
                <span className={`block text-xs font-bold ${i.st.isOverdue ? 'text-[#c2334d]' : 'text-[var(--text-secondary)]'}`}>{i.st.label}</span>
              </span>
              <span className="text-right shrink-0">
                <Money value={i.amount} className="text-sm font-bold" />
                <span className="block text-[10px] text-[var(--text-muted)]">{i.kind}</span>
              </span>
            </button>
          ))}
          {due.length > 5 && <button type="button" onClick={() => onNavigate('module3')} className="text-xs font-bold underline text-[var(--text-secondary)]">Lihat {due.length - 5} lainnya</button>}
        </NeoCard>

        <NeoCard className="p-4 space-y-3">
          <h3 className="font-heading font-bold flex items-center gap-2 text-[var(--text-primary)]"><Target className="w-4 h-4" />Progres tabungan terdekat</h3>
          {d.nearGoals.length === 0 && <p className="text-sm text-[var(--text-secondary)]">Belum ada target aktif. Buat di Sinking Funds.</p>}
          {d.nearGoals.map(g => {
            const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
            return (
              <button key={g.id} type="button" onClick={() => onNavigate('module2')} className="w-full text-left space-y-1.5">
                <div className="flex justify-between text-sm"><b className="text-[var(--text-primary)]">{g.name}</b><span className="font-num font-bold text-[var(--text-primary)]">{pct}%</span></div>
                <div className="brutal-progress-container"><div className="brutal-progress-bar" style={{ width: `${pct}%` }} /></div>
                <div className="text-xs text-[var(--text-secondary)]"><Money value={g.currentAmount} /> / <Money value={g.targetAmount} />{g.deadline ? ` • target ${g.deadline}` : ''}</div>
              </button>
            );
          })}
        </NeoCard>
      </div>

      <NeoCard className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-[var(--text-primary)]">5 transaksi terakhir</h3>
          <button type="button" onClick={() => onNavigate('module1')} className="text-xs font-bold underline text-[var(--text-secondary)]">Lihat semua</button>
        </div>
        {d.recent.length === 0 && <p className="text-sm text-[var(--text-secondary)]">Belum ada transaksi. Tekan tombol (+) untuk mencatat yang pertama.</p>}
        {d.recent.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-3 border-t-2 border-[var(--border-subtle)] pt-2">
            <div className="min-w-0">
              <div className="font-bold text-sm truncate text-[var(--text-primary)]">{t.category || (t.type === 'transfer' ? 'Transfer' : '-')}</div>
              <div className="text-xs text-[var(--text-secondary)] truncate">{t.date} • {accName(t.accountId)}{t.note ? ` • ${t.note}` : ''}</div>
            </div>
            <Money value={t.type === 'expense' ? -t.amount : t.amount} tone={t.type === 'income' ? 'income' : t.type === 'expense' ? 'expense' : undefined} className="text-sm font-bold shrink-0" />
          </div>
        ))}
      </NeoCard>
    </div>
  );
}
