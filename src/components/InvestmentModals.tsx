import { toLocalDateStr } from '../utils/dateUtils';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowDownToLine, Calculator, Check, Coins, Info, Lock, Pencil, Plus, Sprout, Trash2 } from 'lucide-react';
import type { Account, InvestmentAsset, InvestmentEntry, InvestmentEntryKind } from '../types';
import { evaluateMathExpression, formatRupiah } from '../utils/financeUtils';
import { freeBalanceText } from '../utils/financeUtils';
import { suggestCapitalReduced, type AssetReturn } from '../services/investmentService';
import { ModalFrame, NominalPreview } from './ui/BaseUI';

const ACC_TYPE: Record<string, string> = { cash: 'Dompet', bank: 'Bank', ewallet: 'E-Wallet', credit_card: 'Kartu Kredit' };
const today = () => toLocalDateStr(new Date());
const signed = (n: number) => `${n >= 0 ? '+' : '-'}${formatRupiah(Math.abs(n))}`;

export const KIND_META: Record<InvestmentEntryKind, { label: string; short: string; tint: string; Icon: typeof Plus; hint: string }> = {
  topup: { label: 'Tambah dana', short: 'Tambah dana', tint: 'var(--accent-blue)', Icon: Plus, hint: 'Modal bertambah dan saldo akun berkurang (tercatat sebagai pengeluaran).' },
  yield: { label: 'Hasil / panen', short: 'Hasil', tint: 'var(--accent-sage)', Icon: Sprout, hint: 'Pemasukan dari aset tanpa mengurangi aset (panen, dividen, bagi hasil). Modal dan nilai pasar tidak berubah.' },
  withdraw: { label: 'Tarik sebagian', short: 'Penarikan', tint: 'var(--accent-sand)', Icon: ArrowDownToLine, hint: 'Mencairkan sebagian aset: modal dan nilai pasar berkurang, saldo akun bertambah.' },
  close: { label: 'Tutup aset', short: 'Tutup aset', tint: 'var(--accent-terracotta)', Icon: Lock, hint: 'Mencairkan seluruh aset. Aset ditandai selesai dan tidak dihitung lagi di total portofolio.' }
};

/* ============================ DETAIL ASET + RIWAYAT ============================ */
interface DetailProps {
  asset: InvestmentAsset;
  entries: InvestmentEntry[];
  accounts: Account[];
  ret: AssetReturn;
  typeLabel: string;
  color: string;
  onAction: (kind: InvestmentEntryKind) => void;
  onEditEntry: (e: InvestmentEntry) => void;
  onDeleteEntry: (e: InvestmentEntry) => void;
  onClose: () => void;
}

export function AssetDetailModal(p: DetailProps) {
  const closed = p.asset.status === 'closed';
  const sorted = [...p.entries].sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt - a.createdAt));
  const accName = (id: string) => p.accounts.find(a => a.id === id)?.name ?? 'Akun';
  const tone = (n: number) => ({ color: n >= 0 ? 'var(--accent-sage-light)' : 'var(--accent-terracotta-light)' } as CSSProperties);

  return (
    <ModalFrame
      wide
      title={p.asset.name}
      subtitle={`${p.typeLabel}${p.asset.platform ? ` · ${p.asset.platform}` : ''}${closed ? ' · Selesai' : ''}`}
      icon={<Coins className="w-4 h-4" />}
      tint={p.color}
      onClose={p.onClose}
      footer={<button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Tutup</button>}
    >
      <div className="ax-form">
        <div className="ax-gstats">
          <div><small>Modal</small><b>{formatRupiah(p.asset.initialCapital)}</b></div>
          <div><small>Nilai pasar</small><b style={{ color: 'var(--accent-blue-light)' }}>{closed ? '-' : formatRupiah(p.asset.currentValue)}</b></div>
          <div><small>Belum terealisasi</small><b style={tone(p.ret.unrealized)}>{closed ? '-' : signed(p.ret.unrealized)}</b></div>
          <div><small>ROI total</small><b style={tone(p.ret.roiTotal)}>{p.ret.roiTotal >= 0 ? '+' : ''}{p.ret.roiTotal.toFixed(1)}%</b></div>
        </div>
        <div className="ax-gstats">
          <div><small>Dana tambahan</small><b>{formatRupiah(p.ret.topupTotal)}</b></div>
          <div><small>Hasil terkumpul</small><b style={{ color: 'var(--accent-sage-light)' }}>{formatRupiah(p.ret.yieldTotal)}</b></div>
          <div><small>Dicairkan</small><b>{formatRupiah(p.ret.cashedOut)}</b></div>
          <div><small>Terealisasi</small><b style={tone(p.ret.realizedTotal)}>{signed(p.ret.realizedTotal)}</b></div>
        </div>

        {closed ? (
          <div className="ax-warn">
            <Lock className="w-4 h-4" />
            <span><b>Aset ini sudah ditutup{p.asset.closedAt ? ` pada ${p.asset.closedAt}` : ''}. </b>Untuk membukanya kembali, hapus catatan "Tutup aset" di riwayat.</span>
          </div>
        ) : (
          <div className="ax-invact" role="group" aria-label="Aksi dana">
            {(['topup', 'yield', 'withdraw', 'close'] as InvestmentEntryKind[]).map(k => {
              const m = KIND_META[k];
              return (
                <button key={k} type="button" style={{ '--c': m.tint } as CSSProperties} onClick={() => p.onAction(k)}>
                  <m.Icon className="w-4 h-4" />{m.label}
                </button>
              );
            })}
          </div>
        )}

        <div>
          <div className="ax-fl"><span>Riwayat dana ({sorted.length})</span></div>
          {sorted.length === 0 ? (
            <div className="ax-emptyh"><p>Belum ada riwayat</p><small>Catat tambah dana (mis. beli pupuk), hasil panen, atau penarikan di sini.</small></div>
          ) : (
            <div className="ax-rlist" style={{ maxHeight: 340, overflowY: 'auto' }}>
              {sorted.map(e => {
                const m = KIND_META[e.kind];
                const inflow = e.kind !== 'topup';
                return (
                  <div key={e.id} className="ax-ent" style={{ '--c': m.tint } as CSSProperties}>
                    <span className="ax-ic"><m.Icon className="w-4 h-4" /></span>
                    <div className="b">
                      <b>{m.short}</b>
                      <small>{e.date} · {accName(e.accountId)}{e.note ? ` · ${e.note}` : ''}</small>
                      {(e.kind === 'topup' || e.kind === 'withdraw' || e.kind === 'close') && (
                        <small>
                          {e.kind === 'topup' && `Modal +${formatRupiah(e.amount)}`}
                          {e.kind === 'withdraw' && `Modal −${formatRupiah(e.capitalReduced || 0)} · terealisasi ${signed(e.realized || 0)}`}
                          {e.kind === 'close' && `Terealisasi ${signed(e.realized || 0)}`}
                        </small>
                      )}
                    </div>
                    <span className="v" style={{ color: inflow ? 'var(--accent-sage-light)' : 'var(--accent-terracotta-light)' }}>{inflow ? '+' : '-'}{formatRupiah(e.amount)}</span>
                    <span className="a">
                      <button type="button" className="ax-ib" onClick={() => p.onEditEntry(e)} title="Ubah catatan" aria-label={`Ubah catatan ${m.short} ${e.date}`}><Pencil className="w-3.5 h-3.5" /></button>
                      <button type="button" className="ax-ib del" onClick={() => p.onDeleteEntry(e)} title="Hapus catatan" aria-label={`Hapus catatan ${m.short} ${e.date}`}><Trash2 className="w-3.5 h-3.5" /></button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}

/* ============================ FORM CATATAN (TAMBAH / HASIL / TARIK / TUTUP) ============================ */
export interface EntryValues { date: string; amount: number; accountId: string; note: string; capitalReduced?: number }

interface EntryProps {
  kind: InvestmentEntryKind;
  asset: InvestmentAsset;
  accounts: Account[];
  /** Ada = mode ubah. */
  initial?: InvestmentEntry;
  busy?: boolean;
  error?: string | null;
  onSubmit: (v: EntryValues) => void;
  onClose: () => void;
}

const num = (v: string) => { const r = evaluateMathExpression(v); return r.success && !isNaN(r.result) ? r.result : parseFloat(v.replace(/[^\d.]/g, '')) || 0; };

export function AssetEntryModal(p: EntryProps) {
  const m = KIND_META[p.kind];
  const editing = !!p.initial;
  const accs = p.accounts.filter(a => !a.isArchived && a.type !== 'credit_card');
  const [date, setDate] = useState(p.initial?.date ?? today());
  const [amount, setAmount] = useState(p.initial ? String(p.initial.amount) : p.kind === 'close' ? String(p.asset.currentValue) : '');
  const [accountId, setAccountId] = useState(p.initial?.accountId ?? accs[0]?.id ?? '');
  const [note, setNote] = useState(p.initial?.note ?? '');
  const [capText, setCapText] = useState(p.initial?.capitalReduced !== undefined ? String(p.initial.capitalReduced) : '');
  const [capTouched, setCapTouched] = useState(p.initial?.capitalReduced !== undefined);

  const amt = Math.round(num(amount));
  // Saat mengubah, nilai aset yang dipakai untuk usulan adalah kondisi SETELAH catatan lama dibatalkan.
  const base = p.initial
    ? { initialCapital: p.asset.initialCapital - p.initial.capitalDelta, currentValue: p.asset.currentValue - p.initial.valueDelta }
    : { initialCapital: p.asset.initialCapital, currentValue: p.asset.currentValue };
  const suggested = suggestCapitalReduced(base, amt);

  useEffect(() => {
    if (p.kind === 'withdraw' && !capTouched) setCapText(amt > 0 ? String(suggested) : '');
  }, [amt, capTouched, p.kind, suggested]);

  const cap = Math.min(base.initialCapital, Math.max(0, Math.round(num(capText))));
  const formId = 'asset-entry-form';
  const over = p.kind === 'withdraw' && amt > base.currentValue;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    p.onSubmit({ date, amount: amt, accountId, note, capitalReduced: p.kind === 'withdraw' ? cap : undefined });
  };

  return (
    <ModalFrame
      wide
      title={`${editing ? 'Ubah ' : ''}${m.label}`}
      subtitle={p.asset.name}
      icon={<m.Icon className="w-4 h-4" />}
      tint={m.tint}
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form={formId} disabled={p.busy || !accountId || amt <= 0 || over} className="brutal-btn brutal-btn-sand">
            <Check className="w-4 h-4" />{p.busy ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="ax-form">
        <div className="ax-warn"><Info className="w-4 h-4" /><span>{m.hint}</span></div>

        <div className="ax-amt" data-kind={p.kind === 'topup' ? 'expense' : 'income'}>
          <label className="ax-fl" htmlFor="ie-amount">
            <span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />{p.kind === 'topup' ? 'Nominal dana tambahan' : p.kind === 'yield' ? 'Nominal hasil' : p.kind === 'withdraw' ? 'Nominal yang ditarik' : 'Nominal hasil penjualan / pencairan'}</span>
          </label>
          <div className="ax-amt-row">
            <span>Rp</span>
            <input id="ie-amount" type="text" inputMode="text" autoComplete="off" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" required autoFocus />
          </div>
          <NominalPreview amount={amount} />
          {p.kind === 'close' && !editing && <p className="ax-hint">Terisi nilai pasar saat ini. Ubah bila hasil penjualan berbeda.</p>}
        </div>

        <div>
          <div className="ax-fl"><span>{p.kind === 'topup' ? 'Dipotong dari akun' : 'Masuk ke akun'}</span></div>
          <div className="ax-accs" role="radiogroup" aria-label="Akun">
            {accs.map(a => (
              <button key={a.id} type="button" role="radio" aria-checked={accountId === a.id} className="ax-acc" onClick={() => setAccountId(a.id)}>
                <b>{a.name}</b><small>{ACC_TYPE[a.type] || a.type} · {freeBalanceText(a)}</small>
              </button>
            ))}
          </div>
        </div>

        {p.kind === 'withdraw' && (
          <div>
            <label className="brutal-label" htmlFor="ie-cap">Modal yang dikurangi</label>
            <div className="ax-plain-amt">
              <span>Rp</span>
              <input id="ie-cap" type="text" inputMode="text" autoComplete="off" className="brutal-input" value={capText}
                onChange={e => { setCapText(e.target.value); setCapTouched(true); }} />
            </div>
            <NominalPreview amount={capText} />
            <p className="ax-fieldhint">
              Terisi otomatis secara proporsional ({formatRupiah(suggested)}). Ubah bila Anda punya cara hitung sendiri.
              {capTouched && <> <button type="button" className="ax-link" onClick={() => { setCapTouched(false); setCapText(String(suggested)); }}>Kembalikan proporsional</button></>}
            </p>
          </div>
        )}

        {/* Pratinjau dampak */}
        {amt > 0 && (
          <div className="ax-sum" style={{ flexWrap: 'wrap' }}>
            {p.kind === 'topup' && (<>
              <div><small>Modal setelah</small><b>{formatRupiah(base.initialCapital + amt)}</b></div>
              <div><small>Nilai pasar</small><b>{formatRupiah(base.currentValue)}</b></div>
            </>)}
            {p.kind === 'yield' && (<>
              <div><small>Pemasukan tercatat</small><b style={{ color: 'var(--accent-sage-light)' }}>+{formatRupiah(amt)}</b></div>
              <div><small>Kategori</small><b>Hasil Investasi</b></div>
            </>)}
            {p.kind === 'withdraw' && (<>
              <div><small>Modal sisa</small><b>{formatRupiah(Math.max(0, base.initialCapital - cap))}</b></div>
              <div><small>Nilai sisa</small><b>{formatRupiah(Math.max(0, base.currentValue - amt))}</b></div>
              <div><small>Terealisasi</small><b style={{ color: amt - cap >= 0 ? 'var(--accent-sage-light)' : 'var(--accent-terracotta-light)' }}>{signed(amt - cap)}</b></div>
            </>)}
            {p.kind === 'close' && (<>
              <div><small>Modal ditutup</small><b>{formatRupiah(base.initialCapital)}</b></div>
              <div><small>Terealisasi</small><b style={{ color: amt - base.initialCapital >= 0 ? 'var(--accent-sage-light)' : 'var(--accent-terracotta-light)' }}>{signed(amt - base.initialCapital)}</b></div>
            </>)}
          </div>
        )}

        {over && <div className="ax-warn t" role="alert"><Info className="w-4 h-4" /><span>Penarikan melebihi nilai pasar ({formatRupiah(base.currentValue)}). Gunakan "Tutup aset" untuk mencairkan seluruhnya.</span></div>}

        <div className="ax-two">
          <div>
            <label className="brutal-label" htmlFor="ie-date">Tanggal</label>
            <input id="ie-date" type="date" className="brutal-input" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="brutal-label" htmlFor="ie-note">Catatan (opsional)</label>
            <input id="ie-note" type="text" className="brutal-input" value={note} onChange={e => setNote(e.target.value)}
              placeholder={p.kind === 'topup' ? 'Beli pupuk, perawatan, bibit' : p.kind === 'yield' ? 'Panen musim ini' : ''} />
          </div>
        </div>

        {p.error && <div className="ax-warn t" role="alert"><Info className="w-4 h-4" /><span>{p.error}</span></div>}
      </form>
    </ModalFrame>
  );
}
