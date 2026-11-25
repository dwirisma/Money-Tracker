import type { FormEvent } from 'react';
import { ArrowRightLeft, Calculator, Info, Pencil, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import type { Account, Transaction } from '../types';
import { formatRupiah, freeBalanceText } from '../utils/financeUtils';
import { ModalFrame, NominalPreview } from './ui/BaseUI';

interface EditProps {
  tx: Transaction;
  ledgerName: string;
  accounts: Account[];
  type: 'income' | 'expense' | 'transfer';
  onTypeChange: (t: 'income' | 'expense') => void;
  amount: string;
  onAmountChange: (v: string) => void;
  onAmountBlur: () => void;
  calcNotice: string | null;
  accountId: string;
  onAccountChange: (id: string) => void;
  toAccountId: string;
  onToAccountChange: (id: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  date: string;
  onDateChange: (v: string) => void;
  note: string;
  onNoteChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

const FORM_ID = 'edit-transaction-form';

export function EditTransactionModal(p: EditProps) {
  const isTransfer = p.tx.type === 'transfer';
  const kind = isTransfer ? 'transfer' : p.type;
  const tint = kind === 'transfer' ? 'var(--accent-blue)' : kind === 'income' ? 'var(--accent-sage)' : 'var(--accent-terracotta)';

  return (
    <ModalFrame
      top
      title={isTransfer ? 'Ubah Transfer Saldo' : p.tx.goalId ? 'Ubah Alokasi Target' : 'Ubah Transaksi'}
      subtitle={p.tx.goalId ? 'Perubahan nominal akan memperbarui saldo kas dan dana target sekaligus' : `${p.tx.date} · Buku kas ${p.ledgerName}`}
      icon={isTransfer ? <ArrowRightLeft className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
      tint={tint}
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form={FORM_ID} className={`brutal-btn ${isTransfer ? 'brutal-btn-blue' : 'brutal-btn-sage'}`}>Simpan perubahan</button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={p.onSubmit} className="ax-form">
        {!isTransfer && (
          <div className="ax-seg" role="tablist" aria-label="Jenis transaksi" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" role="tab" aria-selected={p.type === 'expense'} data-on={p.type === 'expense'} data-k="expense" onClick={() => p.onTypeChange('expense')}>
              <TrendingDown className="w-4 h-4" />Pengeluaran
            </button>
            <button type="button" role="tab" aria-selected={p.type === 'income'} data-on={p.type === 'income'} data-k="income" onClick={() => p.onTypeChange('income')}>
              <TrendingUp className="w-4 h-4" />Pemasukan
            </button>
          </div>
        )}

        {/* NOMINAL */}
        <div className="ax-amt" data-kind={kind}>
          <label className="ax-fl" htmlFor="edit-tx-amount">
            <span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />{isTransfer ? 'Nominal transfer baru' : 'Nominal baru'}</span>
          </label>
          <div className="ax-amt-row">
            <span>Rp</span>
            <input id="edit-tx-amount" type="text" inputMode="text" autoComplete="off" value={p.amount} onChange={e => p.onAmountChange(e.target.value)} onBlur={p.onAmountBlur} required />
          </div>
          <NominalPreview amount={p.amount} />
          {p.calcNotice && <p className="ax-hint" style={{ marginTop: 4 }}>{p.calcNotice}</p>}
        </div>

        {/* AKUN */}
        {isTransfer ? (
          <div className="ax-xfer">
            <div>
              <label className="brutal-label" htmlFor="edit-tx-src">Akun asal (pengirim)</label>
              <select id="edit-tx-src" className="brutal-select" value={p.accountId} onChange={e => p.onAccountChange(e.target.value)} required>
                {p.accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} — {freeBalanceText(acc)}</option>)}
              </select>
            </div>
            <button type="button" className="ax-swap" title="Tukar akun asal dan tujuan" aria-label="Tukar akun asal dan tujuan"
              onClick={() => { const a = p.accountId; p.onAccountChange(p.toAccountId); p.onToAccountChange(a); }}>
              <ArrowRightLeft className="w-4 h-4" />
            </button>
            <div>
              <label className="brutal-label" htmlFor="edit-tx-dst">Akun tujuan (penerima)</label>
              <select id="edit-tx-dst" className="brutal-select" value={p.toAccountId} onChange={e => p.onToAccountChange(e.target.value)} required>
                {p.accounts.map(acc => (
                  <option key={acc.id} value={acc.id} disabled={acc.id === p.accountId}>
                    {acc.name} {acc.id === p.accountId ? '(tidak boleh sama)' : `— ${freeBalanceText(acc)}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <>
            <div>
              <div className="ax-fl"><span>Akun sumber</span></div>
              <div className="ax-accs" role="radiogroup" aria-label="Akun sumber">
                {p.accounts.map(acc => (
                  <button key={acc.id} type="button" role="radio" aria-checked={p.accountId === acc.id} className="ax-acc" onClick={() => p.onAccountChange(acc.id)}>
                    <b>{acc.name}</b><small>{freeBalanceText(acc)}</small>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="brutal-label" htmlFor="edit-tx-cat">Kategori</label>
              <input id="edit-tx-cat" type="text" className="brutal-input" value={p.category} onChange={e => p.onCategoryChange(e.target.value)} required />
            </div>
          </>
        )}

        {/* TANGGAL + CATATAN */}
        <div className="ax-two">
          <div>
            <label className="brutal-label" htmlFor="edit-tx-date">Tanggal</label>
            <input id="edit-tx-date" type="date" className="brutal-input" value={p.date} onChange={e => p.onDateChange(e.target.value)} required />
          </div>
          <div>
            <label className="brutal-label" htmlFor="edit-tx-note">Catatan</label>
            <input id="edit-tx-note" type="text" className="brutal-input" value={p.note} onChange={e => p.onNoteChange(e.target.value)} placeholder="Opsional" />
          </div>
        </div>

        <p className="ax-warn" style={{ margin: 0 }}>
          <Info className="w-4 h-4" />
          <span>Sistem menghitung <b>selisih nominal</b> dan menyesuaikan saldo akun secara otomatis lewat transaksi atomik.</span>
        </p>
      </form>
    </ModalFrame>
  );
}

interface DeleteProps {
  tx: Transaction;
  accountName?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteTransactionModal({ tx, accountName, onClose, onConfirm }: DeleteProps) {
  const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '⇄ ';
  return (
    <ModalFrame
      top
      title="Hapus Transaksi?"
      subtitle="Tindakan ini tidak dapat dibatalkan"
      icon={<Trash2 className="w-4 h-4" />}
      tint="var(--accent-terracotta)"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={onClose}>Batal</button>
          <button type="button" className="brutal-btn brutal-btn-terracotta" onClick={onConfirm}><Trash2 className="w-4 h-4" />Ya, hapus</button>
        </>
      }
    >
      <div className="ax-sum">
        <div>
          <small>{tx.date}{accountName ? ` · ${accountName}` : ''}</small>
          <b>{tx.category || (tx.type === 'transfer' ? 'Transfer saldo' : tx.type)}</b>
        </div>
        <div><small>Nominal</small><b>{sign}{formatRupiah(tx.amount)}</b></div>
      </div>

      <div className="ax-warn">
        <Info className="w-4 h-4" />
        <span>
          <b>Pengembalian saldo otomatis: </b>
          {tx.type === 'expense' && `saldo akun sumber akan bertambah kembali (+${formatRupiah(tx.amount)}).`}
          {tx.type === 'income' && `saldo akun akan dikurangi kembali (-${formatRupiah(tx.amount)}).`}
          {tx.type === 'transfer' && 'saldo akun asal dikembalikan dan saldo akun tujuan dikurangi.'}
        </span>
      </div>

      {tx.goalId && (
        <div className="ax-warn t">
          <Info className="w-4 h-4" />
          <span><b>Sinkronisasi target: </b>transaksi ini adalah alokasi target. Dana terkumpul pada target terkait akan dikurangi {formatRupiah(tx.amount)}.</span>
        </div>
      )}
    </ModalFrame>
  );
}
