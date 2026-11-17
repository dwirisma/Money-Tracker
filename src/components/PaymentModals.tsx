import type { FormEvent } from 'react';
import { Banknote, Calculator, Check, CreditCard, Info, RotateCw, AlertTriangle } from 'lucide-react';
import type { Account, Bill, Debt } from '../types';
import { evaluateMathExpression, formatRupiah } from '../utils/calculator';
import { ModalFrame } from './ui/ModalFrame';

const ACC_TYPE: Record<string, string> = { cash: 'Dompet', bank: 'Bank', ewallet: 'E-Wallet', credit_card: 'Kartu Kredit' };
const CYCLE_LABEL: Record<string, string> = { daily: 'harian', weekly: 'mingguan', monthly: 'bulanan', yearly: 'tahunan', custom: 'kustom' };
const CYCLE_NEXT: Record<string, string> = { daily: '1 hari', weekly: '1 minggu', monthly: '1 bulan', yearly: '1 tahun', custom: 'satu siklus' };

interface PayBillProps {
  bill: Bill;
  accounts: Account[];
  amount: string;
  onAmountChange: (v: string) => void;
  calcNotice: string | null;
  sourceAccount: string;
  onSourceChange: (id: string) => void;
  date: string;
  onDateChange: (v: string) => void;
  note: string;
  onNoteChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

const FORM_ID = 'pay-bill-form';

export function PayBillModal(p: PayBillProps) {
  const b = p.bill;
  const isVariable = b.pricingType === 'variable';
  const parsed = evaluateMathExpression(p.amount).result;
  const payAmount = isVariable ? parsed : (parsed > 0 ? parsed : b.fixedAmount || 0);
  const selected = p.accounts.find(a => a.id === p.sourceAccount);
  const short = !!selected && selected.type !== 'credit_card' && payAmount > 0 && selected.balance < payAmount;
  const suggest = isVariable ? (b.lastNominal || 0) : (b.fixedAmount || 0);
  const cycle = b.cycle as string;

  return (
    <ModalFrame
      title="Bayar Tagihan"
      subtitle={`${b.name} · jatuh tempo ${b.nextPaymentDate}`}
      icon={<CreditCard className="w-4 h-4" />}
      tint="var(--accent-blue)"
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form={FORM_ID} className="brutal-btn brutal-btn-blue" disabled={!p.sourceAccount}>
            Bayar{payAmount > 0 ? ` · ${formatRupiah(payAmount)}` : ' sekarang'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={p.onSubmit} className="ax-form">
        <div className="ax-sum">
          <div><small>Pembayaran {CYCLE_LABEL[cycle] || cycle}</small><b>{b.name}</b></div>
          <div><small>Jatuh tempo</small><b>{b.nextPaymentDate}</b></div>
        </div>

        {/* NOMINAL */}
        <div className="ax-amt" data-kind="transfer">
          <label className="ax-fl" htmlFor="pay-bill-amount">
            <span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />{isVariable ? 'Nominal tagihan periode ini' : 'Konfirmasi nominal pembayaran'}</span>
          </label>
          <div className="ax-amt-row">
            <span>Rp</span>
            <input id="pay-bill-amount" type="text" inputMode="text" autoComplete="off" value={p.amount} onChange={e => p.onAmountChange(e.target.value)} placeholder="150000 atau 75000+2500" required />
          </div>
          {p.calcNotice && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{p.calcNotice}</div>}
          {suggest > 0 && (
            <div className="ax-qs" aria-label="Nominal cepat">
              <button type="button" onClick={() => p.onAmountChange(String(suggest))}>
                {isVariable ? `Bulan lalu · ${formatRupiah(suggest)}` : `Nominal tetap · ${formatRupiah(suggest)}`}
              </button>
            </div>
          )}
          <p className="ax-hint">Mendukung kalkulator, contoh: 75000+2500</p>
        </div>

        {/* AKUN SUMBER */}
        <div>
          <div className="ax-fl"><span>Bayar dari akun</span></div>
          {p.accounts.length === 0 ? (
            <p className="ax-empty">Belum ada akun di buku kas ini.</p>
          ) : (
            <div className="ax-accs" role="radiogroup" aria-label="Akun sumber dana">
              {p.accounts.map(acc => (
                <button key={acc.id} type="button" role="radio" aria-checked={p.sourceAccount === acc.id} className="ax-acc" onClick={() => p.onSourceChange(acc.id)}>
                  <b>{acc.name}</b>
                  <small>{ACC_TYPE[acc.type] || acc.type} · {formatRupiah(acc.balance)}</small>
                </button>
              ))}
            </div>
          )}
          {!p.sourceAccount && p.accounts.length > 0 && <p className="ax-hint" style={{ color: 'var(--text-secondary)' }}>Pilih akun sumber dana untuk melanjutkan.</p>}
        </div>

        {short && (
          <div className="ax-warn t" role="alert">
            <AlertTriangle className="w-4 h-4" />
            <span>Saldo <b>{selected?.name}</b> ({formatRupiah(selected?.balance || 0)}) lebih kecil dari tagihan. Saldo akun akan menjadi minus.</span>
          </div>
        )}

        {/* TANGGAL + CATATAN */}
        <div className="ax-two">
          <div>
            <label className="brutal-label" htmlFor="pay-bill-date">Tanggal bayar</label>
            <input id="pay-bill-date" type="date" className="brutal-input" value={p.date} onChange={e => p.onDateChange(e.target.value)} required />
          </div>
          <div>
            <label className="brutal-label" htmlFor="pay-bill-note">Catatan</label>
            <input id="pay-bill-note" type="text" className="brutal-input" value={p.note} onChange={e => p.onNoteChange(e.target.value)} />
          </div>
        </div>

        <p className="ax-warn" style={{ margin: 0 }}>
          <RotateCw className="w-4 h-4" />
          <span><b>Perpanjangan otomatis:</b> setelah pembayaran berhasil, jatuh tempo dimajukan <b>{CYCLE_NEXT[cycle] || 'satu siklus'}</b> ke depan dan total pembayaran bertambah.</span>
        </p>
      </form>
    </ModalFrame>
  );
}

interface PayDebtProps {
  debt: Debt;
  accounts: Account[];
  amount: string;
  /** Dipanggil saat mengetik (menjalankan kalkulator & catatan hasil). */
  onAmountChange: (v: string) => void;
  /** Dipanggil oleh chip nominal cepat (mengatur nilai langsung). */
  onSetAmount: (v: string) => void;
  calcNotice: string | null;
  sourceAccount: string;
  onSourceChange: (id: string) => void;
  date: string;
  onDateChange: (v: string) => void;
  note: string;
  onNoteChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

const DEBT_FORM_ID = 'pay-debt-form';

export function PayDebtModal(p: PayDebtProps) {
  const d = p.debt;
  const payAmount = evaluateMathExpression(p.amount).result;
  const paidPct = d.totalDebt > 0 ? Math.min(100, Math.round(((d.totalDebt - d.remainingDebt) / d.totalDebt) * 100)) : 100;
  const after = Math.max(0, d.remainingDebt - payAmount);
  const over = payAmount > d.remainingDebt;
  const settles = payAmount > 0 && after === 0;
  const selected = p.accounts.find(a => a.id === p.sourceAccount);
  const short = !!selected && selected.type !== 'credit_card' && payAmount > 0 && selected.balance < payAmount;

  return (
    <ModalFrame
      title={d.name}
      subtitle={d.lender ? `Pembayaran cicilan · ${d.lender}` : 'Pembayaran cicilan utang'}
      icon={<Banknote className="w-4 h-4" />}
      tint="var(--accent-terracotta)"
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form={DEBT_FORM_ID} className="brutal-btn brutal-btn-terracotta" disabled={!p.sourceAccount}>
            {settles ? 'Lunasi' : 'Bayar'}{payAmount > 0 ? ` · ${formatRupiah(payAmount)}` : ' cicilan'}
          </button>
        </>
      }
    >
      <form id={DEBT_FORM_ID} onSubmit={p.onSubmit} className="ax-form">
        {/* STATUS SISA UTANG */}
        <div>
          <div className="ax-sum">
            <div><small>Sisa utang saat ini</small><b style={{ fontSize: 20, color: 'var(--accent-terracotta-light)' }}>{formatRupiah(d.remainingDebt)}</b></div>
            <div><small>Total awal</small><b>{formatRupiah(d.totalDebt)}</b></div>
          </div>
          <div className="ax-share" aria-hidden="true" style={{ marginTop: 8 }}><i style={{ width: `${paidPct}%`, background: 'var(--accent-sage)' }} /></div>
          <div className="ax-ob-row" style={{ marginTop: 4 }}><span>Progres pelunasan</span><b>{paidPct}% lunas</b></div>
        </div>

        {/* NOMINAL */}
        <div className="ax-amt" data-kind="expense">
          <label className="ax-fl" htmlFor="pay-debt-amount">
            <span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Nominal cicilan yang dibayar</span>
          </label>
          <div className="ax-amt-row">
            <span>Rp</span>
            <input id="pay-debt-amount" type="text" inputMode="text" autoComplete="off" value={p.amount} onChange={e => p.onAmountChange(e.target.value)} placeholder="500000 atau 250000*2" required />
          </div>
          {p.calcNotice && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{p.calcNotice}</div>}
          <div className="ax-qs" aria-label="Tambah nominal cepat">
            {[250000, 500000, 1000000].map(amt => (
              <button key={amt} type="button" onClick={() => {
                const cur = parseInt(p.amount.replace(/[^\d]/g, '') || '0', 10);
                p.onSetAmount((cur + amt).toString());
              }}>+{amt >= 1000000 ? `${amt / 1000000}jt` : `${amt / 1000}k`}</button>
            ))}
            <button type="button" onClick={() => p.onSetAmount(String(d.remainingDebt))} style={{ background: '#14141a', color: '#fff' }}>Lunasi sisa</button>
          </div>
          <p className="ax-hint">Mendukung kalkulator, contoh: 250000*2</p>
        </div>

        {/* PRATINJAU SETELAH BAYAR */}
        {payAmount > 0 && (
          <div className="ax-sum" style={{ background: settles ? 'var(--accent-sage-dark)' : undefined }}>
            <div><small>Sisa setelah dibayar</small><b>{settles ? 'LUNAS 🎉' : formatRupiah(after)}</b></div>
            <div><small>Dibayar</small><b>-{formatRupiah(Math.min(payAmount, d.remainingDebt))}</b></div>
          </div>
        )}
        {over && (
          <div className="ax-warn t" role="alert">
            <AlertTriangle className="w-4 h-4" />
            <span>Nominal melebihi sisa utang ({formatRupiah(d.remainingDebt)}). Gunakan tombol <b>Lunasi sisa</b> untuk melunasi tepat.</span>
          </div>
        )}

        {/* AKUN SUMBER */}
        <div>
          <div className="ax-fl"><span>Potong saldo dari akun</span></div>
          {p.accounts.length === 0 ? (
            <p className="ax-empty">Belum ada akun di buku kas ini.</p>
          ) : (
            <div className="ax-accs" role="radiogroup" aria-label="Akun sumber dana">
              {p.accounts.map(acc => (
                <button key={acc.id} type="button" role="radio" aria-checked={p.sourceAccount === acc.id} className="ax-acc" onClick={() => p.onSourceChange(acc.id)}>
                  <b>{acc.name}</b><small>{ACC_TYPE[acc.type] || acc.type} · {formatRupiah(acc.balance)}</small>
                </button>
              ))}
            </div>
          )}
          {!p.sourceAccount && p.accounts.length > 0 && <p className="ax-hint" style={{ color: 'var(--text-secondary)' }}>Pilih akun untuk melanjutkan.</p>}
        </div>
        {short && (
          <div className="ax-warn t" role="alert">
            <AlertTriangle className="w-4 h-4" />
            <span>Saldo <b>{selected?.name}</b> ({formatRupiah(selected?.balance || 0)}) lebih kecil dari cicilan. Saldo akun akan menjadi minus.</span>
          </div>
        )}

        {/* TANGGAL + CATATAN */}
        <div className="ax-two">
          <div>
            <label className="brutal-label" htmlFor="pay-debt-date">Tanggal bayar</label>
            <input id="pay-debt-date" type="date" className="brutal-input" value={p.date} onChange={e => p.onDateChange(e.target.value)} required />
          </div>
          <div>
            <label className="brutal-label" htmlFor="pay-debt-note">Catatan</label>
            <input id="pay-debt-note" type="text" className="brutal-input" value={p.note} onChange={e => p.onNoteChange(e.target.value)} />
          </div>
        </div>

        <p className="ax-warn" style={{ margin: 0 }}>
          <Info className="w-4 h-4" />
          <span><b>Transaksi atomik:</b> nominal memotong saldo akun, mencatat pengeluaran, dan mengurangi sisa pokok utang secara serentak.</span>
        </p>
      </form>
    </ModalFrame>
  );
}
