import type { CSSProperties, FormEvent } from 'react';
import { Calculator, Check, FolderPlus, Info, Landmark, Pencil, Smartphone, Wallet, CreditCard, Banknote } from 'lucide-react';
import type { AccountType } from '../types';
import { ModalFrame } from './ui/ModalFrame';
import { ColorPicker, calcNoteOf } from './ObligationForms';

const ACCENT_COLORS = [
  { color: '#2dd4a7', label: 'Hijau' },
  { color: '#6c97ff', label: 'Biru' },
  { color: '#ff7a4d', label: 'Oranye' },
  { color: '#ffc933', label: 'Kuning' },
  { color: '#e3a8f7', label: 'Lilac' }
];

/* ============================ BUKU KAS (BUAT / UBAH) ============================ */
interface LedgerFormProps {
  mode: 'create' | 'edit';
  /** Nama buku kas yang sedang diubah (subjudul saat mode edit). */
  ledgerName?: string;
  name: string; onName: (v: string) => void;
  desc: string; onDesc: (v: string) => void;
  color: string; onColor: (c: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export function LedgerFormModal(p: LedgerFormProps) {
  const create = p.mode === 'create';
  const formId = create ? 'add-ledger-form' : 'edit-ledger-form';
  return (
    <ModalFrame
      title={create ? 'Buat Buku Kas Baru' : 'Ubah Buku Kas'}
      subtitle={create ? 'Ruang keuangan terpisah' : p.ledgerName}
      icon={create ? <FolderPlus className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
      tint="var(--accent-sand)"
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form={formId} className="brutal-btn brutal-btn-sand">
            <Check className="w-4 h-4" />{create ? 'Simpan & beralih' : 'Simpan perubahan'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={p.onSubmit} className="ax-form">
        <div>
          <label className="brutal-label" htmlFor={`${formId}-name`}>Nama buku kas</label>
          <input id={`${formId}-name`} type="text" className="brutal-input" value={p.name} onChange={e => p.onName(e.target.value)}
            placeholder="Bisnis Kopi, Proyek Lepas, Dana Liburan" required />
        </div>

        <div>
          <label className="brutal-label" htmlFor={`${formId}-desc`}>Deskripsi / tujuan (opsional)</label>
          <input id={`${formId}-desc`} type="text" className="brutal-input" value={p.desc} onChange={e => p.onDesc(e.target.value)}
            placeholder={create ? 'Rekap operasional usaha warung' : 'Operasional kantor atau tabungan keluarga'} />
        </div>

        <ColorPicker label="Warna identitas buku" value={p.color} onChange={p.onColor} options={ACCENT_COLORS} />

        {create && (
          <div className="ax-warn">
            <Info className="w-4 h-4" />
            <span>Setiap buku kas punya <b>daftar akun, saldo, dan transaksi sendiri</b> yang sepenuhnya terpisah.</span>
          </div>
        )}
      </form>
    </ModalFrame>
  );
}

/* ============================ AKUN (TAMBAH / UBAH) ============================ */
const TYPES: { id: AccountType; label: string; hint: string; c: string; Icon: typeof Landmark }[] = [
  { id: 'bank', label: 'Bank', hint: 'Konvensional / digital', c: 'var(--accent-blue)', Icon: Landmark },
  { id: 'ewallet', label: 'E-Wallet', hint: 'GoPay, OVO, ShopeePay', c: 'var(--accent-sage)', Icon: Smartphone },
  { id: 'cash', label: 'Tunai', hint: 'Dompet fisik', c: 'var(--accent-sand)', Icon: Banknote },
  { id: 'credit_card', label: 'Kartu Kredit', hint: 'Liabilitas', c: 'var(--accent-terracotta)', Icon: CreditCard }
];

interface AccountFormProps {
  mode: 'create' | 'edit';
  ledgerName: string;
  /** Nama akun yang sedang diubah (subjudul saat mode edit). */
  accountName?: string;
  name: string; onName: (v: string) => void;
  type: AccountType; onType: (t: AccountType) => void;
  balance: string; onBalance: (v: string) => void;
  color: string; onColor: (c: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export function AccountFormModal(p: AccountFormProps) {
  const create = p.mode === 'create';
  const formId = create ? 'add-account-form' : 'edit-account-form';
  const isCredit = p.type === 'credit_card';
  const note = calcNoteOf(p.balance);
  return (
    <ModalFrame
      title={create ? 'Tambah Akun Baru' : 'Ubah Akun'}
      subtitle={create ? `Buku kas: ${p.ledgerName}` : p.accountName}
      icon={create ? <Wallet className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
      tint={create ? 'var(--accent-sage)' : 'var(--accent-blue)'}
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form={formId} className={`brutal-btn ${create ? 'brutal-btn-sage' : 'brutal-btn-blue'}`}>
            <Check className="w-4 h-4" />{create ? 'Simpan akun' : 'Simpan perubahan'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={p.onSubmit} className="ax-form">
        <div>
          <label className="brutal-label" htmlFor={`${formId}-name`}>Nama akun</label>
          <input id={`${formId}-name`} type="text" className="brutal-input" value={p.name} onChange={e => p.onName(e.target.value)}
            placeholder={create ? 'BCA Tabungan, GoPay, Kas Tunai' : undefined} required />
        </div>

        <div>
          <div className="ax-fl"><span>Tipe akun</span></div>
          <div className="ax-opts" role="radiogroup" aria-label="Tipe akun">
            {TYPES.map(t => (
              <button key={t.id} type="button" role="radio" aria-checked={p.type === t.id} className="ax-opt"
                style={{ '--c': t.c } as CSSProperties} onClick={() => p.onType(t.id)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><t.Icon className="w-4 h-4" />{t.label}</span>
                <small>{t.hint}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="ax-amt" data-kind={isCredit ? 'expense' : 'income'}>
          <label className="ax-fl" htmlFor={`${formId}-bal`}>
            <span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />{create ? 'Saldo awal' : 'Penyesuaian saldo riil'}</span>
          </label>
          <div className="ax-amt-row">
            <span>Rp</span>
            <input id={`${formId}-bal`} type="text" inputMode="text" autoComplete="off" value={p.balance} onChange={e => p.onBalance(e.target.value)}
              placeholder="0" required />
          </div>
          {note && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{note}</div>}
          <p className="ax-hint">
            {create ? 'Mendukung kalkulator, contoh: 1500000+250000.' : 'Samakan dengan saldo sebenarnya di akun. Mendukung kalkulator.'}
          </p>
        </div>

        <ColorPicker label="Warna aksen" value={p.color} onChange={p.onColor} options={ACCENT_COLORS} />
      </form>
    </ModalFrame>
  );
}
