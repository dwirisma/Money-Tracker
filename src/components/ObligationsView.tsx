import type { CSSProperties } from 'react';
import { AlertTriangle, Banknote, Calendar, CheckCircle2, Clock, CreditCard, Pencil, Plus, Receipt, RotateCw, Trash2 } from 'lucide-react';
import type { Bill, Debt } from '../types';
import { formatRupiah } from '../utils/calculator';
import { getBillDueStatus } from '../services/cashManagementService';

type BillFilter = 'all' | 'monthly' | 'yearly' | 'overdue';
type DebtFilter = 'all' | 'active' | 'paid_off';

interface Metrics {
  totalRemainingDebt: number;
  totalOriginalDebt: number;
  debtPayoffProgress: number;
  estimatedMonthlyBills: number;
  variableBillsCount: number;
  totalBillsPaid: number;
}

interface Props {
  ledgerName: string;
  bills: Bill[];
  debts: Debt[];
  filteredBills: Bill[];
  filteredDebts: Debt[];
  billFilter: BillFilter;
  debtFilter: DebtFilter;
  metrics: Metrics;
  onBillFilter: (f: BillFilter) => void;
  onDebtFilter: (f: DebtFilter) => void;
  onAddBill: () => void;
  onAddDebt: () => void;
  onOpenBill: (b: Bill) => void;
  onPayBill: (b: Bill) => void;
  onEditBill: (b: Bill) => void;
  onDeleteBill: (b: Bill) => void;
  onOpenDebt: (d: Debt) => void;
  onPayDebt: (d: Debt) => void;
  onEditDebt: (d: Debt) => void;
  onDeleteDebt: (d: Debt) => void;
}

type Due = ReturnType<typeof getBillDueStatus>;

function DueBadge({ due, paidOff }: { due: Due; paidOff?: boolean }) {
  if (paidOff) return <span className="ax-st done"><CheckCircle2 className="w-3 h-3" />Lunas 🎉</span>;
  if (due.isOverdue) return <span className="ax-st late animate-pulse"><AlertTriangle className="w-3 h-3" />Terlambat {Math.abs(due.daysLeft)} hari</span>;
  if (due.isToday) return <span className="ax-st late"><Clock className="w-3 h-3" />Hari ini!</span>;
  if (due.daysLeft <= 3) return <span className="ax-st soon"><Clock className="w-3 h-3" />Sisa {due.daysLeft} hari</span>;
  return <span className="ax-st">Sisa {due.daysLeft} hari</span>;
}

export function ObligationsView(p: Props) {
  const { metrics: m } = p;
  const activeDebts = p.debts.filter(d => !d.isPaidOff).length;
  const paidDebts = p.debts.length - activeDebts;
  const needPay = p.bills.filter(b => {
    const s = getBillDueStatus(b.nextPaymentDate);
    return s.isOverdue || s.isToday || (s.daysLeft > 0 && s.daysLeft <= 3);
  }).length;

  const billTabs: { id: BillFilter; label: string }[] = [
    { id: 'all', label: `Semua (${p.bills.length})` },
    { id: 'monthly', label: `Bulanan (${p.bills.filter(b => b.cycle === 'monthly').length})` },
    { id: 'yearly', label: `Tahunan (${p.bills.filter(b => b.cycle === 'yearly').length})` },
    { id: 'overdue', label: `Perlu bayar (${needPay})` }
  ];
  const debtTabs: { id: DebtFilter; label: string }[] = [
    { id: 'all', label: `Semua (${p.debts.length})` },
    { id: 'active', label: `Cicilan aktif (${activeDebts})` },
    { id: 'paid_off', label: `Lunas (${paidDebts})` }
  ];

  return (
    <div className="ax-add">
      {/* RINGKASAN */}
      <section className="ax-dash">
        <div className="ax-b s6 ax-panel ax-hero terra">
          <div className="ax-hero-head">
            <div className="ax-eyebrow" style={{ marginTop: 0 }}><CreditCard className="w-3.5 h-3.5" />Total beban utang berjalan</div>
            <span className="ax-badge-s">{p.ledgerName}</span>
          </div>
          <div className="ax-big" id="total-debts-remaining-display" style={{ marginBottom: 6 }}>{formatRupiah(m.totalRemainingDebt)}</div>
          <p className="ax-note-h">Dari {activeDebts} utang aktif (total pinjaman {formatRupiah(m.totalOriginalDebt)})</p>
        </div>
        <div className="ax-b m6 s3 ax-sc b">
          <span><RotateCw className="w-3 h-3" />Tagihan bulanan</span>
          <b id="total-monthly-bills-display">{formatRupiah(m.estimatedMonthlyBills)}</b>
          <small>{p.bills.length} tagihan · {m.variableBillsCount > 0 ? `+${m.variableBillsCount} fluktuatif` : 'nominal tetap'}</small>
        </div>
        <div className="ax-b m6 s3 ax-sc s">
          <span><CheckCircle2 className="w-3 h-3" />Progres pelunasan · {m.debtPayoffProgress}%</span>
          <div className="ax-prog"><i style={{ width: `${m.debtPayoffProgress}%` }} /></div>
          <small>{paidDebts} dari {p.debts.length} pinjaman lunas</small>
        </div>
      </section>

      {/* TAGIHAN RUTIN */}
      <section className="ax-sec">
        <div className="ax-secthead">
          <div>
            <h3><span className="ax-ic" style={{ background: 'var(--accent-blue)' }}><RotateCw className="w-3.5 h-3.5" /></span>Tagihan rutin & langganan</h3>
            <p className="ax-sec-sub">Siklus otomatis dan pengingat jatuh tempo. Ketuk kartu untuk detail dan riwayat.</p>
          </div>
          <button type="button" className="brutal-btn brutal-btn-blue" onClick={p.onAddBill}><Plus className="w-4 h-4" />Tambah tagihan</button>
        </div>
        <div className="ax-chipset scroll" role="radiogroup" aria-label="Filter tagihan">
          {billTabs.map(f => <button key={f.id} type="button" role="radio" aria-checked={p.billFilter === f.id} onClick={() => p.onBillFilter(f.id)}>{f.label}</button>)}
        </div>

        {p.filteredBills.length === 0 ? (
          <div className="ax-panel ax-emptyc">
            <p>Belum ada tagihan terdaftar</p>
            <small>Catat tagihan rutin bulanan atau tahunan dengan nominal tetap maupun fluktuatif.</small>
            <button type="button" className="brutal-btn brutal-btn-blue" onClick={p.onAddBill}><Receipt className="w-4 h-4" />Tambah tagihan pertama</button>
          </div>
        ) : (
          <div className="ax-acc-grid">
            {p.filteredBills.map(b => {
              const due = getBillDueStatus(b.nextPaymentDate);
              return (
                <article key={b.id} className="ax-ac ob" style={{ '--c': b.colorAccent || 'var(--accent-blue)' } as CSSProperties}
                  role="button" tabIndex={0} aria-label={`Buka detail tagihan ${b.name}`}
                  onClick={() => p.onOpenBill(b)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onOpenBill(b); } }}>
                  <div className="ax-ac-h"><span className="ax-ob-name" title={b.name}>{b.name}</span><DueBadge due={due} /></div>
                  <div className="ax-ob-box">
                    <div>
                      <small>Nominal</small>
                      {b.pricingType === 'fixed'
                        ? <b className="blu">{formatRupiah(b.fixedAmount || 0)}</b>
                        : <b className="est">Estimasi bulan lalu: {formatRupiah(b.lastNominal || 0)}</b>}
                    </div>
                    <div><small>Jatuh tempo</small><b className="d"><Calendar className="w-3 h-3 shrink-0" />{b.nextPaymentDate}</b></div>
                  </div>
                  <div className="ax-ob-act" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                    <button type="button" className="brutal-btn brutal-btn-blue" onClick={() => p.onPayBill(b)}><CreditCard className="w-3.5 h-3.5" />Bayar sekarang</button>
                    <button type="button" className="ax-iconbtn" onClick={() => p.onEditBill(b)} title="Edit tagihan" aria-label={`Edit tagihan ${b.name}`}><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" className="ax-iconbtn del" onClick={() => p.onDeleteBill(b)} title="Hapus tagihan" aria-label={`Hapus tagihan ${b.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* UTANG & CICILAN */}
      <section className="ax-sec">
        <div className="ax-secthead">
          <div>
            <h3><span className="ax-ic" style={{ background: 'var(--accent-terracotta)' }}><CreditCard className="w-3.5 h-3.5" /></span>Utang & cicilan</h3>
            <p className="ax-sec-sub">Lacak pinjaman, sisa pokok, dan pelunasan. Ketuk kartu untuk riwayat cicilan.</p>
          </div>
          <button type="button" className="brutal-btn brutal-btn-terracotta" onClick={p.onAddDebt}><Plus className="w-4 h-4" />Catat pinjaman</button>
        </div>
        <div className="ax-chipset scroll" role="radiogroup" aria-label="Filter utang">
          {debtTabs.map(f => <button key={f.id} type="button" role="radio" aria-checked={p.debtFilter === f.id} onClick={() => p.onDebtFilter(f.id)}>{f.label}</button>)}
        </div>

        {p.filteredDebts.length === 0 ? (
          <div className="ax-panel ax-emptyc">
            <p>Tidak ada utang terdaftar</p>
            <small>Kondisi bebas utang atau belum ada data cicilan tercatat di buku kas ini.</small>
            <button type="button" className="brutal-btn brutal-btn-terracotta" onClick={p.onAddDebt}><Plus className="w-4 h-4" />Catat pinjaman baru</button>
          </div>
        ) : (
          <div className="ax-acc-grid">
            {p.filteredDebts.map(d => {
              const progress = d.totalDebt > 0 ? Math.min(100, Math.round(((d.totalDebt - d.remainingDebt) / d.totalDebt) * 100)) : 100;
              const due = getBillDueStatus(d.nextPaymentDate || d.dueDate || '');
              return (
                <article key={d.id} className={`ax-ac ob ${d.isPaidOff ? 'paid' : ''}`} style={{ '--c': d.colorAccent || 'var(--accent-terracotta)' } as CSSProperties}
                  role="button" tabIndex={0} aria-label={`Buka detail utang ${d.name}`}
                  onClick={() => p.onOpenDebt(d)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onOpenDebt(d); } }}>
                  <div className="ax-ac-h"><span className="ax-ob-name" title={d.name}>{d.name}</span><DueBadge due={due} paidOff={d.isPaidOff} /></div>
                  <div className="ax-ob-box">
                    <div><small>Sisa utang</small><b className="neg">{formatRupiah(d.remainingDebt)}</b></div>
                    <div><small>Jatuh tempo</small><b className="d"><Calendar className="w-3 h-3 shrink-0" />{d.nextPaymentDate || d.dueDate || 'Tanpa jadwal'}</b></div>
                  </div>
                  <div>
                    <div className="ax-ob-row"><span>Pelunasan</span><b>{progress}% lunas</b></div>
                    <div className="ax-share"><i style={{ width: `${progress}%`, background: d.isPaidOff ? 'var(--accent-sage)' : (d.colorAccent || 'var(--accent-sand)') }} /></div>
                  </div>
                  <div className="ax-ob-act" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                    <button type="button" className="brutal-btn brutal-btn-terracotta" disabled={d.isPaidOff} onClick={() => p.onPayDebt(d)}>
                      <Banknote className="w-3.5 h-3.5" />{d.isPaidOff ? 'Utang telah lunas 🎉' : 'Bayar cicilan'}
                    </button>
                    <button type="button" className="ax-iconbtn" onClick={() => p.onEditDebt(d)} title="Edit utang" aria-label={`Edit utang ${d.name}`}><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" className="ax-iconbtn del" onClick={() => p.onDeleteDebt(d)} title="Hapus utang" aria-label={`Hapus utang ${d.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
