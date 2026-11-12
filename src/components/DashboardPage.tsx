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
  Receipt
} from 'lucide-react';
import type { Account, Bill, Debt, Goal, Transaction, InvestmentAsset, Ledger } from '../types';
import { calculateNetWorthAccounts, getBillDueStatus } from '../services/cashManagementService';
import { calculateInvestmentSummary } from '../services/investmentService';
import { formatRupiah } from '../utils/calculator';
import { Money } from './ui/Neo';
import type { ModuleId } from './layout/navConfig';
import { AiInsightCard } from './AiInsightCard';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';

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

  const sign = (n: number) => (n >= 0 ? '+' : '-');

  return (
    <div className="ax-dash">
      {/* HERO: kekayaan bersih sebagai satu angka utama */}
      <section className="ax-b s8 ax-panel ax-hero">
        <div className="ax-hero-head">
          <div>
            <h2 className="ax-greet">{greeting(now.getHours())}!</h2>
            <p className="ax-sub">Buku kas <b>{ledgerName}</b></p>
          </div>
          <div className="ax-actions">
            <button type="button" className="brutal-btn ax-btn-ink" onClick={() => onNavigate('add_transaction')}>
              <Plus className="w-4 h-4" />Catat
            </button>
            <button type="button" className="brutal-btn ax-btn-light" onClick={() => onNavigate('history_transaction')}>Riwayat →</button>
          </div>
        </div>
        <div className="ax-eyebrow" title="Total saldo kas + portofolio investasi - sisa utang">
          <Landmark className="w-3.5 h-3.5" />Estimasi kekayaan bersih
        </div>
        <div className="ax-big"><Money value={d.netWorth} /></div>
        <div className="ax-stats">
          <div className="ax-stat" title="Total aset kas & bank dikurangi tagihan kartu kredit">
            <span><Wallet className="w-3 h-3" />Saldo kas</span>
            <b><Money value={d.netBalance} /></b>
          </div>
          <div className="ax-stat" title="Semua uang masuk di periode bulan ini">
            <span><TrendingUp className="w-3 h-3" />Masuk bulan ini</span>
            <b className="ax-pos"><Money value={d.income} /></b>
          </div>
          <div className="ax-stat" title="Semua pengeluaran riil di periode bulan ini">
            <span><TrendingDown className="w-3 h-3" />Keluar bulan ini</span>
            <b className="ax-neg"><Money value={d.expense} /></b>
          </div>
        </div>
      </section>

      {/* SKOR + RASIO TABUNGAN */}
      <section className="ax-b s4 ax-panel ax-score">
        <div className="ax-ph"><h3><span className="ax-ic" style={{ background: 'var(--accent-lavender)' }}><Activity className="w-3.5 h-3.5" /></span>Skor Finansial</h3></div>
        <div className="ax-ring">
          <svg width="104" height="104" viewBox="0 0 64 64" className="-rotate-90" aria-hidden="true">
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--bg-muted)" strokeWidth="8" />
            <circle cx="32" cy="32" r={R} fill="none" stroke={meta.color} strokeWidth="8" strokeDasharray={C} strokeDashoffset={C * (1 - d.score / 100)} strokeLinecap="round" />
          </svg>
          <div className="ax-ring-n"><b>{d.score}</b><small>/ 100</small></div>
        </div>
        <div className="ax-meta" style={{ background: meta.color }}>{meta.label}</div>
        <div className="ax-ratio" title="(Pemasukan - Pengeluaran) / Pemasukan">
          <span><PiggyBank className="w-3.5 h-3.5" />Rasio tabungan</span>
          <b>{d.income > 0 ? `${d.savingsRatio.toFixed(1)}%` : '-'}</b>
        </div>
      </section>

      {/* AI INSIGHT */}
      <div className="ax-b s12">
        <AiInsightCard
          currentLedger={currentLedger || { id: 'active', name: ledgerName, createdAt: Date.now() }}
          transactions={transactions}
          goals={goals}
          bills={bills}
          debts={debts}
          accounts={accounts}
        />
      </div>

      {/* ARUS KAS BULAN INI */}
      <section className="ax-b s4 ax-panel">
        <div className="ax-ph">
          <h3><span className="ax-ic" style={{ background: 'var(--accent-sage)' }}><BarChart2 className="w-3.5 h-3.5" /></span>Arus Kas Bulan Ini</h3>
          <span className={`ax-pill ${d.netCashFlow >= 0 ? 'pos' : 'neg'}`}>{d.netCashFlow >= 0 ? 'Surplus' : 'Defisit'}</span>
        </div>
        <div className="ax-flow-n" style={{ color: d.netCashFlow >= 0 ? 'var(--accent-sage-light)' : 'var(--accent-terracotta-light)' }}>
          {sign(d.netCashFlow)}{formatRupiah(Math.abs(d.netCashFlow))}
        </div>
        <div className="ax-flowbar">
          {d.income + d.expense > 0 ? (
            <>
              <i title="Pemasukan" style={{ width: `${(d.income / (d.income + d.expense)) * 100}%`, background: 'var(--accent-sage)' }} />
              <i title="Pengeluaran" style={{ width: `${(d.expense / (d.income + d.expense)) * 100}%`, background: 'var(--accent-terracotta)' }} />
            </>
          ) : null}
        </div>
        <div className="ax-flow-l">
          <span><i style={{ background: 'var(--accent-sage)' }} />Masuk {formatRupiah(d.income)}</span>
          <span><i style={{ background: 'var(--accent-terracotta)' }} />Keluar {formatRupiah(d.expense)}</span>
        </div>
        <div className="ax-foot">
          <span>Rata-rata keluar/hari <b>{formatRupiah(Math.round(d.expense / Math.max(1, now.getDate())))}</b></span>
          <button type="button" className="ax-link" onClick={() => onNavigate('module5')}>Analisis →</button>
        </div>
      </section>

      {/* TREN 6 BULAN */}
      <section className="ax-b s8 ax-panel">
        <div className="ax-ph">
          <h3><span className="ax-ic" style={{ background: 'var(--accent-blue)' }}><TrendingUp className="w-3.5 h-3.5" /></span>Tren 6 Bulan</h3>
          <div className="ax-leg">
            <span><i style={{ background: 'var(--accent-sage)' }} />Masuk</span>
            <span><i style={{ background: 'var(--accent-terracotta)' }} />Keluar</span>
            <span><i style={{ background: 'var(--accent-blue)' }} />Net</span>
          </div>
        </div>
        <div className="ax-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={d.monthsData} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={10} tickLine={false} fontFamily="var(--font-mono)" />
              <YAxis
                stroke="var(--text-muted)"
                fontSize={9}
                tickLine={false}
                fontFamily="var(--font-mono)"
                tickFormatter={(v) => {
                  if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(0)}jt`;
                  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}rb`;
                  return String(v);
                }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="ax-tip">
                        <p>Bulan {label}</p>
                        {payload.map((entry: any, index: number) => (
                          <div key={`item-${index}`}>
                            <span style={{ color: entry.color }}>{entry.name}:</span>
                            <b>{entry.value < 0 ? '-' : ''}{formatRupiah(Math.abs(Number(entry.value)))}</b>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line type="monotone" dataKey="income" name="Pemasukan" stroke="var(--accent-sage)" strokeWidth={3} dot={{ r: 3, fill: 'var(--accent-sage)', strokeWidth: 1.5, stroke: 'var(--ink)' }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="expense" name="Pengeluaran" stroke="var(--accent-terracotta)" strokeWidth={3} dot={{ r: 3, fill: 'var(--accent-terracotta)', strokeWidth: 1.5, stroke: 'var(--ink)' }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="net" name="Arus Kas Bersih" stroke="var(--accent-blue)" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3, fill: 'var(--accent-blue)', strokeWidth: 1.5, stroke: 'var(--ink)' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="ax-foot">
          <span>Komparasi bulan ke bulan</span>
          <button type="button" className="ax-link" onClick={() => onNavigate('module5')}>Laporan & Analitik →</button>
        </div>
      </section>

      {/* TAGIHAN MENDATANG */}
      <section className="ax-b s6 ax-panel">
        <div className="ax-ph">
          <h3><span className="ax-ic" style={{ background: 'var(--accent-terracotta)' }}><CalendarClock className="w-3.5 h-3.5" /></span>Tagihan & Cicilan</h3>
          <div className="ax-chips">
            {WINDOWS.map(w => (
              <button key={w} type="button" onClick={() => setWindowDays(w)} data-on={windowDays === w}>{w}H</button>
            ))}
          </div>
        </div>
        <p className="ax-note">Kewajiban {windowDays} hari ke depan: <b>{formatRupiah(totalDueAmount)}</b></p>
        {due.length === 0 ? (
          <p className="ax-empty">Tidak ada tagihan atau cicilan jatuh tempo dalam {windowDays} hari ke depan. Semua aman terkendali!</p>
        ) : (
          <ul className="ax-list">
            {due.slice(0, 6).map(item => (
              <li key={item.key}>
                <button type="button" className="ax-row" onClick={() => onNavigate('module3')}>
                  <span className={`ax-due ${item.st.isOverdue ? 'late' : item.st.daysLeft === 0 ? 'today' : ''}`}>{item.st.label}</span>
                  <span className="ax-row-t"><b>{item.name}</b><small>{item.kind}</small></span>
                  <span className="ax-row-v neg">{formatRupiah(item.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="ax-foot">
          <button type="button" className="ax-link" onClick={() => onNavigate('module3')}>Buka Tagihan & Utang →</button>
          {due.length > 6 && <span>+{due.length - 6} lainnya</span>}
        </div>
      </section>

      {/* 5 TRANSAKSI TERAKHIR */}
      <section className="ax-b s6 ax-panel">
        <div className="ax-ph">
          <h3><span className="ax-ic" style={{ background: 'var(--accent-blue)' }}><Receipt className="w-3.5 h-3.5" /></span>5 Transaksi Terakhir</h3>
          <button type="button" className="ax-link" onClick={() => onNavigate('history_transaction')}>Semua riwayat →</button>
        </div>
        {d.recent.length === 0 ? (
          <p className="ax-empty">Belum ada transaksi di buku kas ini. Tekan tombol Catat untuk mulai mencatat.</p>
        ) : (
          <ul className="ax-list">
            {d.recent.map(t => (
              <li key={t.id} className="ax-row static">
                <span className="ax-ic" style={{ background: t.type === 'income' ? 'var(--accent-sage)' : t.type === 'expense' ? 'var(--accent-terracotta)' : 'var(--accent-blue)' }}>
                  {t.type === 'income' ? <TrendingUp className="w-3.5 h-3.5" /> : t.type === 'expense' ? <TrendingDown className="w-3.5 h-3.5" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                </span>
                <span className="ax-row-t">
                  <b>{t.category || (t.type === 'transfer' ? 'Transfer Antar Akun' : 'Lainnya')}</b>
                  <small>{t.date} • {accName(t.accountId)}{t.note ? ` • ${t.note}` : ''}</small>
                </span>
                <span className={`ax-row-v ${t.type === 'income' ? 'pos' : t.type === 'expense' ? 'neg' : 'blu'}`}>
                  {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '⇄'} {formatRupiah(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* SINKING FUNDS */}
      <section className="ax-b s6 ax-panel">
        <div className="ax-ph">
          <h3><span className="ax-ic" style={{ background: 'var(--accent-sand)' }}><Target className="w-3.5 h-3.5" /></span>Sinking Funds Terdekat</h3>
          <button type="button" className="ax-link" onClick={() => onNavigate('module2')}>Lihat semua →</button>
        </div>
        {d.nearGoals.length === 0 ? (
          <p className="ax-empty">Belum ada target aktif di buku ini. Mulai buat di Sinking Funds!</p>
        ) : (
          <ul className="ax-list">
            {d.nearGoals.map(g => {
              const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
              return (
                <li key={g.id}>
                  <button type="button" className="ax-goal" onClick={() => onNavigate('module2')}>
                    <span className="ax-goal-h"><b>{g.name}</b><em>{pct}%</em></span>
                    <span className="brutal-progress-container"><span className="brutal-progress-bar" style={{ width: `${pct}%`, display: 'block' }} /></span>
                    <small>{formatRupiah(g.currentAmount)} / {formatRupiah(g.targetAmount)}{g.deadline ? ` • Deadline: ${g.deadline}` : ''}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* PORTOFOLIO INVESTASI */}
      <section className="ax-b s6 ax-panel ax-inv">
        <div className="ax-ph">
          <h3><span className="ax-ic" style={{ background: 'var(--accent-lavender)' }}><Coins className="w-3.5 h-3.5" /></span>Portofolio Investasi</h3>
          <button type="button" className="ax-link" onClick={() => onNavigate('investments')}>Detail →</button>
        </div>
        <div className="ax-eyebrow dim">Nilai pasar portofolio</div>
        <div className="ax-inv-n"><Money value={d.invSummary.totalCurrentValue} /></div>
        <div className="ax-kv"><span>Total modal beli</span><b>{formatRupiah(d.invSummary.totalCapital)}</b></div>
        <div className="ax-kv"><span>Return investasi</span>
          <b className={d.invSummary.netGainLoss >= 0 ? 'pos' : 'neg'}>
            {d.invSummary.netGainLoss >= 0 ? '+' : ''}{formatRupiah(d.invSummary.netGainLoss)} ({d.invSummary.netGainLossPercent.toFixed(2)}%)
          </b>
        </div>
        <button type="button" className="brutal-btn brutal-btn-sand ax-wide" onClick={() => onNavigate('investments')}>
          Buka Portofolio Investasi<ArrowRight className="w-3.5 h-3.5" />
        </button>
      </section>
    </div>
  );
}
