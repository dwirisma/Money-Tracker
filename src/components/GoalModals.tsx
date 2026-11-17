import type { FormEvent } from 'react';
import { AlertTriangle, Calculator, Check, Coins, Info } from 'lucide-react';
import type { Account, Goal } from '../types';
import { evaluateMathExpression, formatRupiah } from '../utils/calculator';
import { ModalFrame } from './ui/ModalFrame';

const ACC_TYPE: Record<string, string> = { cash: 'Dompet', bank: 'Bank', ewallet: 'E-Wallet', credit_card: 'Kartu Kredit' };

interface AllocateProps {
  goal: Goal;
  accounts: Account[];
  sourceAccount: string;
  onSourceChange: (id: string) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  onAmountBlur: () => void;
  /** Mengatur nilai langsung (dipakai chip nominal cepat). */
  onSetAmount: (v: string) => void;
  calcNotice: string | null;
  date: string;
  onDateChange: (v: string) => void;
  note: string;
  onNoteChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

const FORM_ID = 'allocate-goal-form';

export function AllocateGoalModal(p: AllocateProps) {
  const g = p.goal;
  const isSinking = g.type === 'sinking_fund';
  const remaining = Math.max(0, g.targetAmount - g.currentAmount);
  const pct = (v: number) => (g.targetAmount > 0 ? Math.min(100, Math.round((v / g.targetAmount) * 100)) : 0);
  const alloc = evaluateMathExpression(p.amount).result;
  const afterSaved = g.currentAmount + Math.max(0, alloc);
  const reaches = alloc > 0 && afterSaved >= g.targetAmount;
  const selected = p.accounts.find(a => a.id === p.sourceAccount);
  const short = !!selected && selected.type !== 'credit_card' && alloc > 0 && selected.balance < alloc;
  const noSource = !p.sourceAccount;
  const blocked = isSinking && noSource;

  return (
    <ModalFrame
      title="Alokasikan Dana"
      subtitle={`${isSinking ? 'Sinking Fund' : 'Wishlist'} · ${g.name}`}
      icon={<Coins className="w-4 h-4" />}
      tint="var(--accent-sand)"
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form={FORM_ID} className="brutal-btn brutal-btn-sand" disabled={blocked}>
            {noSource ? 'Catat' : 'Alokasikan'}{alloc > 0 ? ` · ${formatRupiah(alloc)}` : ''}
          </button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={p.onSubmit} className="ax-form">
        {/* PROGRES TARGET */}
        <div>
          <div className="ax-sum">
            <div><small>Terkumpul</small><b style={{ fontSize: 18 }}>{formatRupiah(g.currentAmount)}</b></div>
            <div><small>Target</small><b>{formatRupiah(g.targetAmount)}</b></div>
          </div>
          <div className="ax-share" aria-hidden="true" style={{ marginTop: 8 }}>
            <i style={{ width: `${pct(g.currentAmount)}%`, background: 'var(--accent-sand)' }} />
          </div>
          <div className="ax-ob-row" style={{ marginTop: 4 }}><span>{pct(g.currentAmount)}% tercapai</span><b>Sisa {formatRupiah(remaining)}</b></div>
        </div>

        {/* NOMINAL */}
        <div className="ax-amt" data-kind="goal">
          <label className="ax-fl" htmlFor="alloc-amount">
            <span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Nominal yang disisihkan</span>
          </label>
          <div className="ax-amt-row">
            <span>Rp</span>
            <input id="alloc-amount" type="text" inputMode="text" autoComplete="off" value={p.amount} onChange={e => p.onAmountChange(e.target.value)} onBlur={p.onAmountBlur} placeholder="0 atau hitung ekspresi" required />
          </div>
          {p.calcNotice && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{p.calcNotice}</div>}
          <div className="ax-qs" aria-label="Tambah nominal cepat">
            {[50000, 100000, 250000, 500000, 1000000].map(amt => (
              <button key={amt} type="button" onClick={() => {
                const cur = parseInt(p.amount.replace(/[^\d]/g, '') || '0', 10);
                p.onSetAmount((cur + amt).toString());
              }}>+{amt >= 1000000 ? `${amt / 1000000}jt` : `${amt / 1000}k`}</button>
            ))}
            <button type="button" onClick={() => p.onSetAmount(remaining.toString())} style={{ background: '#14141a', color: '#fff' }}>Isi sisa</button>
          </div>
          <p className="ax-hint">Mendukung kalkulator, contoh: 100000*3</p>
        </div>

        {/* PRATINJAU */}
        {alloc > 0 && (
          <div className="ax-sum" style={{ background: reaches ? 'var(--accent-sage-dark)' : undefined }}>
            <div><small>Terkumpul setelah alokasi</small><b>{formatRupiah(afterSaved)} · {pct(afterSaved)}%</b></div>
            <div><small>{reaches ? 'Status' : 'Sisa target'}</small><b>{reaches ? 'TERCAPAI 🎉' : formatRupiah(Math.max(0, g.targetAmount - afterSaved))}</b></div>
          </div>
        )}

        {/* AKUN SUMBER */}
        <div>
          <div className="ax-fl"><span>Akun sumber dana</span><span style={{ letterSpacing: 0, textTransform: 'none', fontFamily: 'var(--font-heading)' }}>{isSinking ? 'wajib dipotong' : 'opsional'}</span></div>
          <div className="ax-accs" role="radiogroup" aria-label="Akun sumber dana">
            {!isSinking && (
              <button type="button" role="radio" aria-checked={noSource} className="ax-acc" onClick={() => p.onSourceChange('')}>
                <b>Catat progres saja</b><small>Tanpa potong saldo kas</small>
              </button>
            )}
            {p.accounts.map(acc => (
              <button key={acc.id} type="button" role="radio" aria-checked={p.sourceAccount === acc.id} className="ax-acc" onClick={() => p.onSourceChange(acc.id)}>
                <b>{acc.name}</b><small>{ACC_TYPE[acc.type] || acc.type} · {formatRupiah(acc.balance)}</small>
              </button>
            ))}
          </div>
          {blocked && <p className="ax-hint" style={{ color: 'var(--text-secondary)' }}>Sinking Fund wajib memilih akun yang dipotong.</p>}
        </div>
        {short && (
          <div className="ax-warn t" role="alert">
            <AlertTriangle className="w-4 h-4" />
            <span>Saldo <b>{selected?.name}</b> ({formatRupiah(selected?.balance || 0)}) lebih kecil dari alokasi. Saldo akun akan menjadi minus.</span>
          </div>
        )}

        {/* TANGGAL + CATATAN */}
        <div className="ax-two">
          <div>
            <label className="brutal-label" htmlFor="alloc-date">Tanggal</label>
            <input id="alloc-date" type="date" className="brutal-input" value={p.date} onChange={e => p.onDateChange(e.target.value)} required />
          </div>
          <div>
            <label className="brutal-label" htmlFor="alloc-note">Catatan (opsional)</label>
            <input id="alloc-note" type="text" className="brutal-input" value={p.note} onChange={e => p.onNoteChange(e.target.value)} placeholder="Misal: sisihan gaji bulan ini" />
          </div>
        </div>

        <p className="ax-warn" style={{ margin: 0 }}>
          <Info className="w-4 h-4" />
          <span>
            <b>{noSource ? 'Hanya mencatat progres:' : 'Sinkronisasi saldo kas:'}</b>{' '}
            {noSource
              ? 'dana terkumpul pada target bertambah, tetapi saldo akun kas tidak berubah.'
              : 'uang dipotong dari saldo akun dan dicatat sebagai transaksi pengeluaran alokasi agar aset kas tetap akurat.'}
          </span>
        </p>
      </form>
    </ModalFrame>
  );
}
