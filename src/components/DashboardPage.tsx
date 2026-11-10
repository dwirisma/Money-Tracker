import { useMemo, useState } from 'react';
import { 
  Activity, 
  CalendarClock, 
  Landmark, 
  PiggyBank, 
  Target, 
  TrendingDown, 
  TrendingUp, 
  Wallet, 
  Plus, 
  ArrowRight, 
  ArrowRightLeft, 
  BarChart2, 
  Coins, 
  Receipt,
  type LucideIcon 
} from 'lucide-react';
import type { Account, Bill, Debt, Goal, Transaction, InvestmentAsset, Ledger } from '../types';
import { calculateNetWorthAccounts, getBillDueStatus } from '../services/cashManagementService';
import { calculateInvestmentSummary } from '../services/investmentService';
import { formatRupiah } from '../utils/calculator';
import { Money, NeoCard } from './ui/Neo';
import type { ModuleId } from './layout/navConfig';
import { AiInsightCard } from './AiInsightCard';

interface Props {
  ledgerName: string;
  currentLedger?: Ledger;
  accounts: Account[];
  transactions: Transaction[];
  goals: Goal[];
  bills: Bill[];
  debts: Debt[];
  investments?: InvestmentAsset[];
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
  if (score >= 80) return { label: 'Sehat Prima', color: 'var(--accent-sage)' };
  if (score >= 60) return { label: 'Cukup Baik', color: 'var(--accent-sand)' };
  if (score >= 40) return { label: 'Perlu Perhatian', color: 'var(--accent-terracotta)' };
  return { label: 'Kritis', color: 'var(--accent-terracotta)' };
}

function Metric({ icon: Icon, label, children, hint }: { icon: LucideIcon; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <NeoCard className="p-3.5 sm:p-4 flex flex-col gap-1.5" title={hint}>
      <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
        <Icon className="w-4 h-4 text-[var(--accent-sand)] shrink-0" />
        <span className="font-mono text-[10px] sm:text-[11px] font-bold tracking-wide uppercase truncate">{label}</span>
      </div>
      <div className="font-heading font-bold text-lg sm:text-2xl text-[var(--text-primary)] break-words">{children}</div>
    </NeoCard>
  );
}

export function DashboardPage({ ledgerName, currentLedger, accounts, transactions, goals, bills, debts, investments = [], onNavigate }: Props) {
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
    const netCashFlow = income - expense;
    const savingsRatio = income > 0 ? (netCashFlow / income) * 100 : 0;
    const debtLeft = debts.filter(x => !x.isPaidOff).reduce((n, x) => n + x.remainingDebt, 0);
    const liabilities = totalCreditDebt + debtLeft;

    // Upcoming Due Items
    const dueItems = [
      ...bills.map(b => ({ key: 'b_' + b.id, name: b.name, amount: b.fixedAmount ?? b.lastNominal ?? 0, kind: 'Tagihan Rutin', date: b.nextPaymentDate, st: getBillDueStatus(b.nextPaymentDate) })),
      ...debts.filter(x => !x.isPaidOff && x.nextPaymentDate).map(x => ({ key: 'd_' + x.id, name: x.name, amount: x.remainingDebt, kind: 'Cicilan Utang', date: x.nextPaymentDate!, st: getBillDueStatus(x.nextPaymentDate!) })),
    ].sort((a, b) => a.st.daysLeft - b.st.daysLeft);
    const overdueCount = dueItems.filter(i => i.st.isOverdue).length;

    // Goals
    const nearGoals = goals.filter(g => !g.isCompleted && g.targetAmount > 0)
      .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')).slice(0, 3);

    // Recent Transactions
    const recent = [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '') || Number(b.createdAt) - Number(a.createdAt)).slice(0, 5);

    // Score
    const score = healthScore(savingsRatio, overdueCount, totalAssets, liabilities);

    // 6-Month Cash Flow Trends
    const monthsData: Array<{ label: string; ym: string; income: number; expense: number; net: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const targetYm = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
      const mLabel = targetDate.toLocaleDateString('id-ID', { month: 'short' });

      let mInc = 0, mExp = 0;
      transactions.forEach(t => {
        if (t.date && t.date.startsWith(targetYm)) {
          if (t.type === 'income') mInc += t.amount;
          else if (t.type === 'expense') mExp += t.amount;
        }
      });

      monthsData.push({
        label: mLabel,
        ym: targetYm,
        income: mInc,
        expense: mExp,
        net: mInc - mExp
      });
    }

    // Investment summary
    const invSummary = calculateInvestmentSummary(investments);

    return { 
      netBalance, 
      income, 
      expense, 
      netCashFlow, 
      savingsRatio, 
      netWorth: netBalance - debtLeft + invSummary.totalCurrentValue, 
      dueItems, 
      nearGoals, 
      recent, 
      score,
      monthsData,
      invSummary
    };
  }, [accounts, transactions, goals, bills, debts, investments, ym]);

  const accName = (id: string) => accounts.find(a => a.id === id)?.name ?? '-';
  const meta = scoreMeta(d.score);
  const due = d.dueItems.filter(i => i.st.daysLeft <= windowDays);
  const totalDueAmount = due.reduce((sum, item) => sum + item.amount, 0);

  // Health circle
  const R = 26, C = 2 * Math.PI * R;

  // Max value for trend bars
  const maxTrendVal = Math.max(1, ...d.monthsData.map(m => Math.max(m.income, m.expense)));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Dashboard & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[var(--border-subtle)] pb-4">
        <div>
          <h2 className="font-heading font-bold text-2xl text-[var(--text-primary)]">
            {greeting(now.getHours())}!
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Kondisi keuangan terkini di buku kas <b>{ledgerName}</b>.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => onNavigate('add_transaction')}
            className="brutal-btn brutal-btn-sand text-xs py-2 px-3 flex items-center gap-1.5 font-bold shadow-[2px_2px_0px_#000]"
          >
            <Plus className="w-4 h-4" />
            <span>Catat Transaksi</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('history_transaction')}
            className="brutal-btn brutal-btn-ghost text-xs py-2 px-3 flex items-center gap-1.5"
          >
            <span>Riwayat →</span>
          </button>
        </div>
      </div>

      {/* AI INSIGHT CARD (SEPERTI REFERENSI MOCKUP GAMBAR) */}
      <AiInsightCard
        currentLedger={currentLedger || { id: 'active', name: ledgerName, createdAt: Date.now() }}
        transactions={transactions}
        goals={goals}
        bills={bills}
        debts={debts}
        accounts={accounts}
      />

      {/* 6 SCORECARD METRIK UTAMA */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <Metric icon={Wallet} label="Total Saldo Kas" hint="Total aset kas & bank dikurangi tagihan kartu kredit">
          <Money value={d.netBalance} />
        </Metric>

        <Metric icon={TrendingUp} label="Pemasukan Bulan Ini" hint="Semua uang masuk di periode bulan ini">
          <Money value={d.income} tone="income" />
        </Metric>

        <Metric icon={TrendingDown} label="Pengeluaran Bulan Ini" hint="Semua pengeluaran riil di periode bulan ini">
          <Money value={d.expense} tone="expense" />
        </Metric>

        <Metric icon={PiggyBank} label="Rasio Tabungan" hint="(Pemasukan - Pengeluaran) / Pemasukan">
          <span className="font-num text-[var(--accent-sage-light)]">
            {d.income > 0 ? `${d.savingsRatio.toFixed(1)}%` : '-'}
          </span>
        </Metric>

        <Metric icon={Landmark} label="Estimasi Kekayaan Bersih" hint="Total saldo kas + portofolio investasi - sisa utang">
          <Money value={d.netWorth} tone="auto" />
        </Metric>

        {/* Skor Kesehatan Finansial */}
        <NeoCard className="p-3.5 sm:p-4 flex items-center gap-3">
          <svg width="60" height="60" viewBox="0 0 64 64" className="shrink-0 -rotate-90" aria-hidden="true">
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--bg-muted)" strokeWidth="7" />
            <circle 
              cx="32" 
              cy="32" 
              r={R} 
              fill="none" 
              stroke={meta.color} 
              strokeWidth="7" 
              strokeDasharray={C} 
              strokeDashoffset={C * (1 - d.score / 100)} 
              strokeLinecap="round"
            />
          </svg>
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[var(--text-secondary)]">
              <Activity className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
              <span className="font-mono text-[10px] font-bold uppercase truncate">Skor Finansial</span>
            </div>
            <div className="font-heading font-bold text-xl text-[var(--text-primary)]">
              {d.score}<span className="text-xs text-[var(--text-secondary)]"> / 100</span>
            </div>
            <div className="text-[11px] font-bold truncate" style={{ color: meta.color }}>
              {meta.label}
            </div>
          </div>
        </NeoCard>
      </div>

      {/* =================================================================== */}
      {/* 1. ARUS KAS BULAN INI & TREN BULANAN (FITUR REQUESTED)               */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Kolom Kiri: Arus Kas Bulan Ini (Comparison Breakdown) */}
        <div className="lg:col-span-5 brutal-card p-4 sm:p-5 bg-[var(--bg-surface)] space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 mb-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-[var(--accent-sand)]" />
                <h3 className="font-heading font-bold text-sm sm:text-base text-[var(--text-primary)]">
                  Arus Kas Bulan Ini
                </h3>
              </div>
              <span className={`brutal-badge text-[9px] ${
                d.netCashFlow >= 0 ? 'bg-[var(--accent-sage)] text-[#111]' : 'bg-[var(--accent-terracotta)] text-white'
              }`}>
                {d.netCashFlow >= 0 ? 'Surplus' : 'Defisit'}
              </span>
            </div>

            <div className="space-y-3">
              {/* Visual Income vs Expense Bar */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[var(--accent-sage-light)] font-bold">Masuk: {formatRupiah(d.income)}</span>
                  <span className="text-[var(--accent-terracotta-light)] font-bold">Keluar: {formatRupiah(d.expense)}</span>
                </div>
                <div className="h-4 w-full bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-[var(--radius-xs)] overflow-hidden flex">
                  {d.income + d.expense > 0 ? (
                    <>
                      <div 
                        style={{ width: `${(d.income / (d.income + d.expense)) * 100}%` }} 
                        className="bg-[var(--accent-sage)] h-full" 
                        title="Pemasukan"
                      />
                      <div 
                        style={{ width: `${(d.expense / (d.income + d.expense)) * 100}%` }} 
                        className="bg-[var(--accent-terracotta)] h-full" 
                        title="Pengeluaran"
                      />
                    </>
                  ) : (
                    <div className="w-full bg-[var(--bg-muted)] h-full" />
                  )}
                </div>
              </div>

              {/* Net Cash Flow Box */}
              <div className="p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] block">Selisih Kas Bersih</span>
                  <span className={`font-mono font-bold text-lg ${
                    d.netCashFlow >= 0 ? 'text-[var(--accent-sage-light)]' : 'text-[var(--accent-terracotta-light)]'
                  }`}>
                    {d.netCashFlow >= 0 ? '+' : ''}{formatRupiah(d.netCashFlow)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('module5')}
                  className="text-xs font-mono text-[var(--accent-blue-light)] hover:underline flex items-center gap-1"
                >
                  Analisis Laporan →
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] font-mono flex items-center justify-between">
            <span>Rata-rata pengeluaran/hari:</span>
            <b className="text-[var(--text-secondary)]">
              {formatRupiah(Math.round(d.expense / Math.max(1, now.getDate())))}
            </b>
          </div>
        </div>

        {/* Kolom Kanan: Tren Arus Kas 6 Bulan Terakhir */}
        <div className="lg:col-span-7 brutal-card p-4 sm:p-5 bg-[var(--bg-surface)] space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--accent-blue)]" />
              <h3 className="font-heading font-bold text-sm sm:text-base text-[var(--text-primary)]">
                Tren Bulanan (6 Bulan Terakhir)
              </h3>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-xs bg-[var(--accent-sage)] inline-block" /> Masuk</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-xs bg-[var(--accent-terracotta)] inline-block" /> Keluar</span>
            </div>
          </div>

          {/* Bar Chart 6 Bulan */}
          <div className="grid grid-cols-6 gap-2 items-end h-36 pt-4 pb-1">
            {d.monthsData.map(m => {
              const incPct = maxTrendVal > 0 ? (m.income / maxTrendVal) * 100 : 0;
              const expPct = maxTrendVal > 0 ? (m.expense / maxTrendVal) * 100 : 0;
              const isCurrent = m.ym === ym;

              return (
                <div key={m.ym} className="flex flex-col items-center h-full justify-end gap-1">
                  <div className="flex items-end gap-1 w-full justify-center h-24">
                    {/* Income Bar */}
                    <div 
                      style={{ height: `${Math.max(4, incPct)}%` }} 
                      className="w-2.5 sm:w-3.5 bg-[var(--accent-sage)] rounded-t-xs transition-all hover:opacity-80"
                      title={`${m.label} Masuk: ${formatRupiah(m.income)}`}
                    />
                    {/* Expense Bar */}
                    <div 
                      style={{ height: `${Math.max(4, expPct)}%` }} 
                      className="w-2.5 sm:w-3.5 bg-[var(--accent-terracotta)] rounded-t-xs transition-all hover:opacity-80"
                      title={`${m.label} Keluar: ${formatRupiah(m.expense)}`}
                    />
                  </div>
                  <span className={`text-[10px] font-mono truncate ${isCurrent ? 'font-bold text-[var(--accent-sand)] underline' : 'text-[var(--text-muted)]'}`}>
                    {m.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="text-[11px] text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-2 flex items-center justify-between">
            <span>Lihat laporan komprehensif & ekspor Excel:</span>
            <button
              type="button"
              onClick={() => onNavigate('module5')}
              className="font-bold underline text-[var(--accent-sand)] hover:text-white"
            >
              Laporan & Analitik →
            </button>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 2. RINCIAN PENGELUARAN TAGIHAN MENDATANG (REQUESTED)                */}
      {/* =================================================================== */}
      <div className="brutal-card p-4 sm:p-5 bg-[var(--bg-surface)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-[var(--accent-terracotta)]" />
            <div>
              <h3 className="font-heading font-bold text-base text-[var(--text-primary)]">
                Rincian Tagihan & Cicilan Mendatang
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Kewajiban dalam {windowDays} hari: <b>{formatRupiah(totalDueAmount)}</b>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            {WINDOWS.map(w => (
              <button 
                key={w} 
                type="button" 
                onClick={() => setWindowDays(w)} 
                className={`brutal-badge text-xs px-2.5 py-1 ${
                  windowDays === w ? 'bg-[var(--accent-sand)] text-[#111] font-bold' : ''
                }`}
              >
                {w} Hari
              </button>
            ))}
          </div>
        </div>

        {due.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)] italic py-2">
            Tidak ada tagihan atau cicilan jatuh tempo dalam {windowDays} hari ke depan. Semua aman terkendali!
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {due.slice(0, 6).map(item => (
              <div 
                key={item.key}
                onClick={() => onNavigate('module3')}
                className="p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-color)] hover:border-[var(--accent-sand)] cursor-pointer transition-all space-y-1.5"
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="font-heading font-bold text-xs text-[var(--text-primary)] truncate max-w-[130px]">
                    {item.name}
                  </span>
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    item.st.isOverdue 
                      ? 'bg-[var(--accent-terracotta)] text-white' 
                      : item.st.daysLeft === 0 
                      ? 'bg-[var(--accent-sand)] text-[#111]' 
                      : 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'
                  }`}>
                    {item.st.label}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--border-subtle)]">
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">{item.kind}</span>
                  <span className="font-mono font-bold text-[var(--accent-terracotta-light)]">
                    {formatRupiah(item.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center pt-1 text-xs">
          <button 
            type="button" 
            onClick={() => onNavigate('module3')} 
            className="font-bold underline text-[var(--accent-blue-light)] hover:text-white"
          >
            Buka Modul Tagihan & Utang →
          </button>
          {due.length > 6 && (
            <span className="text-xs text-[var(--text-muted)]">
              +{due.length - 6} kewajiban lainnya
            </span>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* 3. DUA KOLOM: PROGRES TABUNGAN & PORTOFOLIO INVESTASI               */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Kolom Kiri: Sinking Funds & Goals */}
        <div className="brutal-card p-4 sm:p-5 bg-[var(--bg-surface)] space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-[var(--accent-sand)]" />
              <h3 className="font-heading font-bold text-sm text-[var(--text-primary)]">
                Progres Sinking Funds Terdekat
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('module2')}
              className="text-[11px] font-mono text-[var(--accent-sand-light)] hover:underline"
            >
              Lihat Semua →
            </button>
          </div>

          {d.nearGoals.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] italic py-2">
              Belum ada target aktif di buku ini. Mulai buat di Sinking Funds!
            </p>
          ) : (
            <div className="space-y-3">
              {d.nearGoals.map(g => {
                const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onNavigate('module2')}
                    className="w-full text-left space-y-1.5 p-2 rounded hover:bg-[var(--bg-elevated)] transition-all"
                  >
                    <div className="flex justify-between text-xs">
                      <b className="text-[var(--text-primary)]">{g.name}</b>
                      <span className="font-mono font-bold text-[var(--accent-sand-light)]">{pct}%</span>
                    </div>
                    <div className="brutal-progress-container">
                      <div className="brutal-progress-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)] font-mono">
                      {formatRupiah(g.currentAmount)} / {formatRupiah(g.targetAmount)}
                      {g.deadline ? ` • Deadline: ${g.deadline}` : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Kolom Kanan: Sekilas Portofolio Investasi */}
        <div className="brutal-card p-4 sm:p-5 bg-[var(--bg-surface)] space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 mb-2">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-[var(--accent-sand)]" />
                <h3 className="font-heading font-bold text-sm text-[var(--text-primary)]">
                  Portofolio Investasi
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('investments')}
                className="text-[11px] font-mono text-[var(--accent-sand-light)] hover:underline"
              >
                Detail Portofolio →
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-[var(--text-secondary)]">Nilai Pasar Portofolio:</span>
                <span className="font-mono font-bold text-base text-[var(--text-primary)]">
                  {formatRupiah(d.invSummary.totalCurrentValue)}
                </span>
              </div>

              <div className="flex justify-between items-baseline">
                <span className="text-xs text-[var(--text-secondary)]">Total Modal Beli:</span>
                <span className="font-mono text-xs text-[var(--text-muted)]">
                  {formatRupiah(d.invSummary.totalCapital)}
                </span>
              </div>

              <div className="p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between text-xs">
                <span className="text-[11px] font-mono text-[var(--text-muted)]">Return Investasi:</span>
                <span className={`font-mono font-bold ${
                  d.invSummary.netGainLoss >= 0 ? 'text-[var(--accent-sage-light)]' : 'text-[var(--accent-terracotta-light)]'
                }`}>
                  {d.invSummary.netGainLoss >= 0 ? '+' : ''}{formatRupiah(d.invSummary.netGainLoss)} ({d.invSummary.netGainLossPercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('investments')}
            className="brutal-btn brutal-btn-sand text-xs py-2 w-full flex items-center justify-center gap-1.5 font-bold"
          >
            <span>Buka Portofolio Investasi</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 4. 5 TRANSAKSI TERAKHIR DENGAN LINK CEPAT KE RIWAYAT TRANSAKSI     */}
      {/* =================================================================== */}
      <div className="brutal-card p-4 sm:p-5 bg-[var(--bg-surface)] space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-[var(--accent-blue)]" />
            <h3 className="font-heading font-bold text-sm sm:text-base text-[var(--text-primary)]">
              5 Transaksi Terakhir
            </h3>
          </div>
          <button 
            type="button" 
            onClick={() => onNavigate('history_transaction')} 
            className="text-xs font-bold underline text-[var(--accent-blue-light)] hover:text-white"
          >
            Lihat Semua Riwayat →
          </button>
        </div>

        {d.recent.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)] italic py-2">
            Belum ada transaksi di buku kas ini. Klik tombol (Catat Transaksi) di atas untuk mulai mencatat.
          </p>
        ) : (
          <div className="space-y-2">
            {d.recent.map(t => (
              <div 
                key={t.id} 
                className="flex items-center justify-between gap-3 p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent-sand)] transition-all"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-xs sm:text-sm truncate text-[var(--text-primary)]">
                    {t.category || (t.type === 'transfer' ? 'Transfer Antar Akun' : 'Lainnya')}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] truncate">
                    {t.date} • {accName(t.accountId)}{t.note ? ` • ${t.note}` : ''}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className={`font-mono font-bold text-xs sm:text-sm ${
                    t.type === 'income' ? 'text-[var(--accent-sage-light)]' : t.type === 'expense' ? 'text-[var(--accent-terracotta-light)]' : 'text-[var(--accent-blue-light)]'
                  }`}>
                    {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '⇄'} {formatRupiah(t.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
