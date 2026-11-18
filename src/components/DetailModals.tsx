import type { MouseEvent, ReactNode } from 'react';
import { Banknote, Calendar, Coins, CreditCard, History, Pencil, Receipt, Trash2, Zap, ArrowRightLeft, TrendingDown, TrendingUp } from 'lucide-react';
import type { Account, AutomationRule, Bill, Debt, Goal, Transaction } from '../types';
import { formatRupiah } from '../utils/calculator';
import { getBillDueStatus, getCycleLabel } from '../services/cashManagementService';
import { ModalFrame } from './ui/ModalFrame';

type Tone = 's' | 't' | 'b' | 'y' | 'l' | 'n';
interface Fact { label: string; value: ReactNode; wide?: boolean }
interface RowStyle { sign: string; tone: 'pos' | 'neg' | 'blu'; chip: string; icon: ReactNode }

interface Base {
  accounts: Account[];
  onClose: () => void;
  onEditTx: (tx: Transaction) => void;
  onDeleteTx: (tx: Transaction) => void;
}

interface GenericProps extends Base {
  title: string;
  subtitle?: string;
  tint: string;
  icon: ReactNode;
  tags: { label: string; tone: Tone }[];
  heroLabel: string;
  heroValue: string;
  heroTone?: 'neg' | 'pos' | 'blu';
  heroSub?: string;
  sideLabel: string;
  sideValue: string;
  progress?: { label: string; right: string; pct: number; color: string };
  facts: Fact[];
  note?: { label: string; text: string };
  historyTitle: string;
  history: Transaction[];
  rowStyle: (tx: Transaction) => RowStyle;
  rowTitle: (tx: Transaction) => string;
  emptyTitle: string;
  emptyHint: string;
  footer: ReactNode;
}

function DueBadge({ status, ok = 'Aman' }: { status: ReturnType<typeof getBillDueStatus>; ok?: string }) {
  if (status.isOverdue) return <span className="ax-st late">Terlambat {Math.abs(status.daysLeft)} hari</span>;
  if (status.isToday) return <span className="ax-st late">Hari ini!</span>;
  if (status.daysLeft <= 3) return <span className="ax-st soon">Sisa {status.daysLeft} hari</span>;
  return <span className="ax-st done">{ok} · {status.daysLeft} hari</span>;
}

function DetailModal(p: GenericProps) {
  const accName = (id?: string) => p.accounts.find(a => a.id === id)?.name;
  return (
    <ModalFrame title={p.title} subtitle={p.subtitle} icon={p.icon} tint={p.tint} onClose={p.onClose} wide footer={p.footer}>
      {p.tags.length > 0 && <div className="ax-tags">{p.tags.map(t => <span key={t.label} className={`ax-tag ${t.tone}`}>{t.label}</span>)}</div>}

      <div className="ax-dhero">
        <div className="ax-dhero-top">
          <div>
            <small>{p.heroLabel}</small>
            <div className={`ax-dhero-v ${p.heroTone || ''}`}>{p.heroValue}</div>
            {p.heroSub && <p className="ax-dhero-sub">{p.heroSub}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <small>{p.sideLabel}</small>
            <div className="ax-dhero-s">{p.sideValue}</div>
          </div>
        </div>
        {p.progress && (
          <div>
            <div className="ax-ob-row"><span>{p.progress.label}</span><b>{p.progress.right}</b></div>
            <div className="ax-share"><i style={{ width: `${p.progress.pct}%`, background: p.progress.color }} /></div>
          </div>
        )}
      </div>

      <div className="ax-ob-list">
        {p.facts.map(f => (
          <div key={f.label} className="ax-ob-row2"><span>{f.label}</span><b>{f.value}</b></div>
        ))}
        {p.note && <div className="ax-ob-row2" style={{ alignItems: 'flex-start' }}><span>{p.note.label}</span><b style={{ whiteSpace: 'normal', fontFamily: 'var(--font-body)', fontWeight: 600 }}>{p.note.text}</b></div>}
      </div>

      <div>
        <div className="ax-dhead" style={{ marginBottom: 8 }}>
          <h4><History className="w-4 h-4" />{p.historyTitle}</h4>
          <span className="ax-badge-s">{p.history.length} data</span>
        </div>
        {p.history.length === 0 ? (
          <div className="ax-emptyh"><p>{p.emptyTitle}</p><small>{p.emptyHint}</small></div>
        ) : (
          <div className="ax-hist">
            {p.history.map(tx => {
              const st = p.rowStyle(tx);
              const acc = accName(tx.accountId);
              return (
                <article key={tx.id} className="ax-tx flat">
                  <span className="ax-txi" style={{ background: st.chip }}>{st.icon}</span>
                  <div className="ax-txm">
                    <b>{p.rowTitle(tx)}</b>
                    <small>{tx.date}{acc ? ` · ${acc}` : ''}</small>
                  </div>
                  <div className="ax-txr">
                    <span className={st.tone}>{st.sign}{formatRupiah(tx.amount)}</span>
                    <div className="ax-acts">
                      <button type="button" className="ax-iconbtn" onClick={() => p.onEditTx(tx)} title="Edit transaksi ini" aria-label="Edit transaksi ini"><Pencil className="w-3.5 h-3.5" /></button>
                      <button type="button" className="ax-iconbtn del" onClick={() => p.onDeleteTx(tx)} title="Hapus transaksi ini" aria-label="Hapus transaksi ini"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </ModalFrame>
  );
}

/* ========================= TAGIHAN ========================= */
export function BillDetailModal(p: Base & { bill: Bill; transactions: Transaction[]; onPay: (b: Bill) => void }) {
  const b = p.bill;
  const due = getBillDueStatus(b.nextPaymentDate);
  const src = p.accounts.find(a => a.id === b.sourceAccountId);
  const hist = p.transactions.filter(t => t.billId === b.id);
  const fixed = b.pricingType === 'fixed';
  return (
    <DetailModal
      {...p}
      title={b.name}
      subtitle="Detail & riwayat pembayaran tagihan"
      tint="var(--accent-blue)"
      icon={<Receipt className="w-4 h-4" />}
      tags={[
        { label: getCycleLabel(b.cycle, b.customIntervalCount, b.customIntervalUnit).toUpperCase(), tone: 'n' },
        { label: fixed ? 'NOMINAL TETAP' : 'NOMINAL BERVARIASI', tone: fixed ? 'b' : 'y' },
        ...(b.category ? [{ label: b.category, tone: 'n' as Tone }] : [])
      ]}
      heroLabel="Nominal tagihan"
      heroValue={fixed ? formatRupiah(b.fixedAmount || 0) : `Estimasi: ${formatRupiah(b.lastNominal || 0)}`}
      heroTone="blu"
      heroSub={fixed ? undefined : (b.lastNominal ? 'Berdasarkan pembayaran terakhir' : 'Menunggu pembayaran aktual pertama')}
      sideLabel="Total dibayarkan"
      sideValue={formatRupiah(b.totalPaid || 0)}
      facts={[
        { label: 'Jatuh tempo berikutnya', value: <><Calendar className="w-3.5 h-3.5 inline mr-1" />{b.nextPaymentDate}</> },
        { label: 'Status pembayaran', value: <DueBadge status={due} /> },
        ...(src ? [{ label: 'Akun kas sumber', value: `${src.name} (${formatRupiah(src.balance)})` }] : [])
      ]}
      note={b.note ? { label: 'Catatan', text: b.note } : undefined}
      historyTitle="Riwayat pembayaran"
      history={hist}
      rowStyle={() => ({ sign: '-', tone: 'blu', chip: 'var(--accent-blue)', icon: <CreditCard className="w-4 h-4" /> })}
      rowTitle={tx => tx.note || tx.category || 'Pembayaran tagihan'}
      emptyTitle="Belum ada riwayat pembayaran"
      emptyHint='Ketuk "Bayar sekarang" untuk mencatat pembayaran periode ini.'
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost sm" onClick={p.onClose}>Tutup</button>
          <button type="button" className="brutal-btn brutal-btn-blue" onClick={() => p.onPay(b)}><CreditCard className="w-4 h-4" />Bayar sekarang</button>
        </>
      }
    />
  );
}

/* ========================= UTANG ========================= */
export function DebtDetailModal(p: Base & { debt: Debt; transactions: Transaction[]; onPay: (d: Debt) => void }) {
  const d = p.debt;
  const hist = p.transactions.filter(t => t.debtId === d.id);
  const paid = Math.max(0, d.totalDebt - d.remainingDebt);
  const pct = d.totalDebt > 0 ? Math.min(100, Math.round((paid / d.totalDebt) * 100)) : 100;
  const due = getBillDueStatus(d.nextPaymentDate);
  return (
    <DetailModal
      {...p}
      title={d.name}
      subtitle="Detail & riwayat cicilan utang"
      tint="var(--accent-terracotta)"
      icon={<Banknote className="w-4 h-4" />}
      tags={[
        { label: d.isPaidOff ? 'LUNAS SEPENUHNYA' : 'CICILAN BERJALAN', tone: d.isPaidOff ? 's' : 't' },
        { label: `SIKLUS: ${getCycleLabel(d.cycle, d.customIntervalCount, d.customIntervalUnit).toUpperCase()}`, tone: 'n' },
        ...(d.lender ? [{ label: `Lender: ${d.lender}`, tone: 'n' as Tone }] : [])
      ]}
      heroLabel="Sisa pokok utang"
      heroValue={formatRupiah(d.remainingDebt)}
      heroTone="neg"
      sideLabel="Total pinjaman awal"
      sideValue={formatRupiah(d.totalDebt)}
      progress={{ label: 'Telah dilunasi', right: `${pct}% (${formatRupiah(paid)})`, pct, color: d.isPaidOff ? 'var(--accent-sage)' : (d.colorAccent || 'var(--accent-terracotta)') }}
      facts={[
        ...(d.nextPaymentDate ? [{ label: 'Jatuh tempo terdekat', value: <><Calendar className="w-3.5 h-3.5 inline mr-1" />{d.nextPaymentDate}{!d.isPaidOff && <> <DueBadge status={due} /></>}</> }] : []),
        { label: 'Siklus cicilan', value: getCycleLabel(d.cycle, d.customIntervalCount, d.customIntervalUnit) },
        { label: 'Pemberi pinjaman', value: d.lender || 'Tidak disebutkan' },
        { label: 'Target pelunasan akhir', value: d.dueDate || 'Tanpa batas waktu' }
      ]}
      note={d.note ? { label: 'Catatan', text: d.note } : undefined}
      historyTitle="Riwayat pembayaran cicilan"
      history={hist}
      rowStyle={() => ({ sign: '-', tone: 'blu', chip: 'var(--accent-terracotta)', icon: <Banknote className="w-4 h-4" /> })}
      rowTitle={tx => tx.note || 'Pembayaran cicilan utang'}
      emptyTitle="Belum ada riwayat cicilan"
      emptyHint='Ketuk "Bayar cicilan" untuk mencatat pembayaran pokok utang.'
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost sm" onClick={p.onClose}>Tutup</button>
          <button type="button" className="brutal-btn brutal-btn-terracotta" disabled={d.isPaidOff} onClick={() => p.onPay(d)}>
            <Banknote className="w-4 h-4" />{d.isPaidOff ? 'Utang lunas 🎉' : 'Bayar cicilan'}
          </button>
        </>
      }
    />
  );
}

/* ========================= TARGET ========================= */
export function GoalDetailModal(p: Base & { goal: Goal; history: Transaction[]; onAllocate: (g: Goal) => void }) {
  const g = p.goal;
  const pct = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0;
  const remaining = Math.max(0, g.targetAmount - g.currentAmount);
  const src = p.accounts.find(a => a.id === g.sourceAccountId);
  const sinking = g.type === 'sinking_fund';
  return (
    <DetailModal
      {...p}
      title={g.name}
      subtitle="Detail & riwayat alokasi dana"
      tint="var(--accent-sand)"
      icon={<Coins className="w-4 h-4" />}
      tags={[
        { label: sinking ? 'SINKING FUND' : 'WISHLIST', tone: sinking ? 'y' : 'b' },
        ...(g.isCompleted ? [{ label: 'TERCAPAI', tone: 's' as Tone }] : [])
      ]}
      heroLabel="Total dana terkumpul"
      heroValue={formatRupiah(g.currentAmount)}
      sideLabel="Target total"
      sideValue={formatRupiah(g.targetAmount)}
      progress={{ label: 'Pencapaian', right: `${pct}%`, pct, color: g.isCompleted ? 'var(--accent-sage)' : (g.colorAccent || 'var(--accent-sand)') }}
      facts={[
        { label: 'Sisa dana dibutuhkan', value: g.isCompleted ? 'Target selesai 🎉' : formatRupiah(remaining) },
        { label: 'Tenggat waktu', value: g.deadline || 'Tanpa batas waktu' },
        ...(sinking && src ? [{ label: 'Akun sumber potongan', value: src.name }] : [])
      ]}
      note={g.note ? { label: 'Catatan', text: g.note } : undefined}
      historyTitle="Riwayat alokasi dana"
      history={p.history}
      rowStyle={() => ({ sign: '+', tone: 'pos', chip: 'var(--accent-sand)', icon: <Coins className="w-4 h-4" /> })}
      rowTitle={tx => tx.note || tx.category || 'Alokasi tabungan'}
      emptyTitle="Belum ada riwayat alokasi dana"
      emptyHint='Ketuk "Alokasikan dana" untuk mulai menabung ke target ini.'
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost sm" onClick={p.onClose}>Tutup</button>
          <button type="button" className="brutal-btn brutal-btn-sand" disabled={g.isCompleted} onClick={() => p.onAllocate(g)}>
            <Coins className="w-4 h-4" />{g.isCompleted ? 'Target tercapai 🎉' : 'Alokasikan dana'}
          </button>
        </>
      }
    />
  );
}

/* ========================= OTOMATISASI ========================= */
export function AutomationDetailModal(p: Base & {
  rule: AutomationRule;
  transactions: Transaction[];
  onRunNow: (r: AutomationRule, e: MouseEvent) => void;
  onEdit: (r: AutomationRule, e: MouseEvent) => void;
}) {
  const r = p.rule;
  const src = p.accounts.find(a => a.id === r.sourceAccountId);
  const dst = r.toAccountId ? p.accounts.find(a => a.id === r.toAccountId) : null;
  const due = getBillDueStatus(r.nextRunDate);
  const hist = p.transactions.filter(t => t.automationId === r.id);
  const cycle = r.cycle === 'monthly' && r.monthlyDay ? `Setiap tgl ${r.monthlyDay} per bulan` : getCycleLabel(r.cycle, r.customIntervalCount, r.customIntervalUnit);
  const tone: Tone = r.type === 'income' ? 's' : r.type === 'expense' ? 't' : 'b';
  const typeLabel = r.type === 'income' ? 'PEMASUKAN OTOMATIS' : r.type === 'expense' ? 'PENGELUARAN OTOMATIS' : 'TRANSFER OTOMATIS';
  const sign = r.type === 'income' ? '+' : r.type === 'expense' ? '-' : '⇄ ';
  return (
    <DetailModal
      {...p}
      title={r.name}
      subtitle="Detail & riwayat eksekusi aturan"
      tint="var(--accent-lavender)"
      icon={<Zap className="w-4 h-4" />}
      tags={[{ label: typeLabel, tone }, { label: r.isActive ? 'STATUS: AKTIF' : 'STATUS: NONAKTIF', tone: r.isActive ? 's' : 'n' }]}
      heroLabel="Nominal eksekusi"
      heroValue={`${sign}${formatRupiah(r.amount)}`}
      heroTone={r.type === 'income' ? 'pos' : r.type === 'expense' ? 'neg' : 'blu'}
      sideLabel="Total dieksekusi"
      sideValue={`${r.executionCount || 0} kali`}
      facts={[
        { label: 'Siklus penjadwalan', value: cycle },
        { label: 'Jadwal berikutnya', value: <><Calendar className="w-3.5 h-3.5 inline mr-1" />{r.nextRunDate}{r.isActive && <> <DueBadge status={due} ok="Terjadwal" /></>}</> },
        { label: r.type === 'transfer' ? 'Akun sumber' : r.type === 'income' ? 'Rekening masuk' : 'Rekening potong', value: src?.name || 'Akun' },
        ...(r.type === 'transfer' ? [{ label: 'Akun tujuan', value: dst?.name || 'Tujuan' }] : []),
        { label: 'Terakhir dijalankan', value: r.lastRunDate ? r.lastRunDate : 'Belum pernah dieksekusi' }
      ]}
      note={r.note ? { label: 'Catatan', text: r.note } : undefined}
      historyTitle="Transaksi dari aturan ini"
      history={hist}
      rowStyle={tx => tx.type === 'income'
        ? { sign: '+', tone: 'pos', chip: 'var(--accent-sage)', icon: <TrendingUp className="w-4 h-4" /> }
        : tx.type === 'expense'
          ? { sign: '-', tone: 'neg', chip: 'var(--accent-terracotta)', icon: <TrendingDown className="w-4 h-4" /> }
          : { sign: '⇄ ', tone: 'blu', chip: 'var(--accent-blue)', icon: <ArrowRightLeft className="w-4 h-4" /> }}
      rowTitle={tx => {
        if (tx.type === 'transfer' && tx.toAccountId) return `${p.accounts.find(a => a.id === tx.accountId)?.name || 'Sumber'} → ${p.accounts.find(a => a.id === tx.toAccountId)?.name || 'Tujuan'}`;
        return tx.note || tx.category || r.name;
      }}
      emptyTitle="Belum ada riwayat eksekusi"
      emptyHint='Ketuk "Jalankan sekarang" untuk memicu eksekusi manual pertama.'
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost sm" onClick={p.onClose}>Tutup</button>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={e => p.onEdit(r, e)}><Pencil className="w-4 h-4" />Edit</button>
          <button type="button" className="brutal-btn brutal-btn-lavender" onClick={e => p.onRunNow(r, e)}><Zap className="w-4 h-4" />Jalankan</button>
        </>
      }
    />
  );
}

