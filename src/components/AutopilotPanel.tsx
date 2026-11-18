import { freeBalanceText, getFreeBalance } from '../utils/accountBalance';
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { AlertTriangle, Calculator, Check, Clock, Info, Pencil, Play, Rocket, Trash2, Zap } from 'lucide-react';
import type { Account, Bill, BillCycle, Debt, Goal } from '../types';
import { createAutopilotRule, deleteAutopilotRule, getAutopilotRules, toggleAutopilotRule, updateAutopilotRule, type AutopilotKind, type AutopilotResult } from '../services/autopilotService';
import { formatRupiah } from '../utils/calculator';
import { Money } from './ui/Neo';
import { ModalFrame } from './ui/ModalFrame';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { getBillDueStatus } from '../services/cashManagementService';
import { calcNoteOf } from './ObligationForms';

export const KIND_LABEL: Record<AutopilotKind, string> = { goal_topup: 'Top-up Sinking Fund', pay_bill: 'Bayar Tagihan', pay_debt: 'Cicil Utang' };
const CYCLES: { v: BillCycle; l: string }[] = [{ v: 'monthly', l: 'Bulanan' }, { v: 'weekly', l: 'Mingguan' }, { v: 'yearly', l: 'Tahunan' }, { v: 'daily', l: 'Harian' }];
const AP_ACC_TYPE: Record<string, string> = { cash: 'Dompet', bank: 'Bank', ewallet: 'E-Wallet', credit_card: 'Kartu Kredit' };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* ---------- Bagian form: dipakai di dalam modal "Buat Aturan Otomatisasi Baru" ---------- */
export interface ApDraft { targetId: string; sourceId: string; amount: string; cycle: BillCycle; start: string }
export const emptyApDraft = (): ApDraft => ({ targetId: '', sourceId: '', amount: '', cycle: 'monthly', start: today() });

interface Ctx { ledgerId: string; accounts: Account[]; goals: Goal[]; bills: Bill[]; debts: Debt[] }

function targetsFor(kind: AutopilotKind, c: Ctx) {
  return kind === 'goal_topup' ? c.goals.filter(g => !g.isCompleted).map(g => ({ id: g.id, name: g.name, srcId: g.sourceAccountId }))
    : kind === 'pay_bill' ? c.bills.map(b => ({ id: b.id, name: b.name, srcId: b.sourceAccountId }))
    : c.debts.filter(d => !d.isPaidOff).map(d => ({ id: d.id, name: d.name, srcId: d.sourceAccountId }));
}

/** Simpan aturan dari draft modal. Melempar Error berisi pesan yang siap ditampilkan. */
export function submitAutopilot(kind: AutopilotKind, d: ApDraft, c: Ctx) {
  const accs = c.accounts.filter(a => !a.isArchived);
  const target = targetsFor(kind, c).find(t => t.id === d.targetId);
  return createAutopilotRule({
    ledgerId: c.ledgerId, kind, targetId: d.targetId, sourceAccountId: d.sourceId || accs[0]?.id || '',
    name: `${KIND_LABEL[kind]}: ${target?.name ?? ''}`,
    amount: Number(d.amount.replace(/[^\d]/g, '')) || 0,
    ...(kind === 'goal_topup' ? { cycle: d.cycle, nextRunDate: d.start } : {}),
  });
}

export function AutopilotFields({ kind, draft, onChange, hideTarget, ...ctx }: { kind: AutopilotKind; draft: ApDraft; onChange: (d: ApDraft) => void; hideTarget?: boolean } & Omit<Ctx, 'ledgerId'>) {
  const accs = ctx.accounts.filter(a => !a.isArchived);
  const targets = targetsFor(kind, { ...ctx, ledgerId: '' });
  const set = (p: Partial<ApDraft>) => onChange({ ...draft, ...p });
  const pick = (id: string) => {
    const src = targets.find(t => t.id === id)?.srcId;
    set({ targetId: id, ...(src && accs.some(a => a.id === src) ? { sourceId: src } : {}) });
  };
  const word = kind === 'goal_topup' ? 'target tabungan' : kind === 'pay_bill' ? 'tagihan' : 'utang';
  const targetLabel = kind === 'goal_topup' ? 'Target sinking fund' : kind === 'pay_bill' ? 'Tagihan yang dibayar' : 'Utang yang dicicil';
  const sourceValue = draft.sourceId || accs[0]?.id || '';
  const note = draft.amount.trim() ? calcNoteOf(draft.amount) : null;

  return (
    <>
      {!hideTarget && (
        <div>
          <div className="ax-fl"><span>{targetLabel}</span></div>
          {targets.length === 0 ? (
            <p className="ax-fieldhint">Belum ada {word} di buku kas ini.</p>
          ) : (
            <div className="ax-accs" role="radiogroup" aria-label={targetLabel}>
              {targets.map(t => (
                <button key={t.id} type="button" role="radio" aria-checked={draft.targetId === t.id} className="ax-acc" onClick={() => pick(t.id)}>
                  <b>{t.name}</b>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="ax-fl"><span>Akun sumber dana</span></div>
        <div className="ax-accs" role="radiogroup" aria-label="Akun sumber dana">
          {accs.map(a => (
            <button key={a.id} type="button" role="radio" aria-checked={sourceValue === a.id} className="ax-acc" onClick={() => set({ sourceId: a.id })}>
              <b>{a.name}</b><small>{AP_ACC_TYPE[a.type] || a.type} · {freeBalanceText(a)}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="ax-amt" data-kind="transfer">
        <label className="ax-fl" htmlFor="ap-amount">
          <span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />{kind === 'pay_bill' ? 'Nominal (opsional)' : 'Nominal per eksekusi'}</span>
        </label>
        <div className="ax-amt-row">
          <span>Rp</span>
          <input id="ap-amount" inputMode="numeric" autoComplete="off" placeholder={kind === 'pay_bill' ? 'Kosong = ikuti tagihan' : '0'}
            value={draft.amount} onChange={e => set({ amount: e.target.value })} required={kind !== 'pay_bill'} />
        </div>
        {note && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{note}</div>}
        {kind === 'pay_bill' && <p className="ax-hint">Dikosongkan, nominal mengikuti tagihan saat jatuh tempo.</p>}
      </div>

      {kind === 'goal_topup' && (
        <>
          <div>
            <div className="ax-fl"><span>Siklus</span></div>
            <div className="ax-chipset" role="radiogroup" aria-label="Siklus">
              {CYCLES.map(c => (
                <button key={c.v} type="button" role="radio" aria-checked={draft.cycle === c.v} onClick={() => set({ cycle: c.v })}>{c.l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="brutal-label" htmlFor="ap-start">Eksekusi pertama / berikutnya</label>
            <input id="ap-start" type="date" className="brutal-input" value={draft.start} onChange={e => set({ start: e.target.value })} required />
          </div>
        </>
      )}

      <div className="ax-warn">
        <Info className="w-4 h-4" />
        <span>
          <b>Autopilot: </b>
          {kind === 'goal_topup' ? 'disetor ke target sesuai siklus, tidak melebihi sisa target.' : `dibayar saat tanggal jatuh tempo ${word} tiba.`} Dijalankan saat aplikasi dibuka, maksimal satu kali per aturan. Jika saldo akun tidak cukup, tidak ada uang yang keluar.
        </span>
      </div>
    </>
  );
}

/* ---------- Jendela buat/ubah satu aturan Autopilot (dari kartu atau dari daftar) ---------- */
export interface ApRequest { kind: AutopilotKind; targetId: string; ruleId?: string }

const KIND_TONE: Record<AutopilotKind, string> = { goal_topup: 'var(--accent-sand)', pay_bill: '#e3a8f7', pay_debt: 'var(--accent-terracotta)' };

export function AutopilotRuleModal({ request, onClose, onSaved, ...ctx }: { request: ApRequest; onClose: () => void; onSaved: (message: string) => void } & Ctx) {
  const { kind } = request;
  const rule = request.ruleId ? getAutopilotRules().find(r => r.id === request.ruleId) : undefined;
  const accs = ctx.accounts.filter(a => !a.isArchived);
  const targetName = (kind === 'goal_topup' ? ctx.goals.find(g => g.id === request.targetId)
    : kind === 'pay_bill' ? ctx.bills.find(b => b.id === request.targetId)
    : ctx.debts.find(d => d.id === request.targetId))?.name ?? 'target';

  const [draft, setDraft] = useState<ApDraft>(() => {
    if (rule) {
      return { targetId: rule.targetId, sourceId: rule.sourceAccountId, amount: rule.amount > 0 ? String(rule.amount) : '', cycle: rule.cycle ?? 'monthly', start: rule.nextRunDate ?? today() };
    }
    const src = targetsFor(kind, ctx).find(t => t.id === request.targetId)?.srcId;
    return { ...emptyApDraft(), targetId: request.targetId, sourceId: src && accs.some(a => a.id === src) ? src : accs[0]?.id ?? '' };
  });
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      if (rule) {
        updateAutopilotRule(rule.id, {
          sourceAccountId: draft.sourceId || accs[0]?.id || '',
          amount: Number(draft.amount.replace(/[^\d]/g, '')) || 0,
          ...(kind === 'goal_topup' ? { cycle: draft.cycle, nextRunDate: draft.start } : {}),
        });
        onSaved('Aturan Autopilot diperbarui.');
      } else {
        submitAutopilot(kind, draft, ctx);
        onSaved('Aturan Autopilot disimpan.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan aturan Autopilot.');
    }
  };

  return (
    <ModalFrame
      title={rule ? 'Ubah Aturan Autopilot' : 'Otomatiskan'}
      subtitle={`${KIND_LABEL[kind]} · ${targetName}`}
      icon={<Zap className="w-4 h-4" />}
      tint={KIND_TONE[kind]}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={onClose}>Batal</button>
          <button type="submit" form="ap-rule-form" className="brutal-btn brutal-btn-sand"><Check className="w-4 h-4" />{rule ? 'Simpan perubahan' : 'Aktifkan autopilot'}</button>
        </>
      }
    >
      <form id="ap-rule-form" onSubmit={submit} className="ax-form">
        <AutopilotFields kind={kind} draft={draft} onChange={d => { setDraft(d); setError(null); }} hideTarget
          accounts={ctx.accounts} goals={ctx.goals} bills={ctx.bills} debts={ctx.debts} />
        {error && <div className="ax-warn t" role="alert"><AlertTriangle className="w-4 h-4" /><span>{error}</span></div>}
      </form>
    </ModalFrame>
  );
}

/* ---------- Daftar aturan Autopilot (di halaman Otomatisasi, di bawah Aturan Otomatisasi) ---------- */
interface ListProps extends Ctx { version: number; onRun: () => Promise<AutopilotResult>; onChanged?: () => void }

export function AutopilotList({ ledgerId, accounts, goals, bills, debts, version, onRun, onChanged }: ListProps) {
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState<ApRequest | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const rules = useMemo(() => getAutopilotRules().filter(r => r.ledgerId === ledgerId), [ledgerId, version, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => { setTick(t => t + 1); onChanged?.(); };

  const nameOf = (k: AutopilotKind, id: string) => (k === 'goal_topup' ? goals.find(g => g.id === id) : k === 'pay_bill' ? bills.find(b => b.id === id) : debts.find(d => d.id === id))?.name;
  const runNow = async () => { setRunning(true); try { await onRun(); } finally { setRunning(false); refresh(); } };
  const deleting = rules.find(r => r.id === toDelete);

  return (
    <section className="ax-sec">
      <div className="ax-secthead">
        <div>
          <h3><span className="ax-ic" style={{ background: 'var(--accent-sand)' }}><Rocket className="w-3.5 h-3.5" /></span>Aturan Autopilot<em>{rules.length}</em></h3>
          <p className="ax-sec-sub">Membayar tagihan, mencicil utang, dan menyetor ke sinking fund lewat fungsi bayar yang sama dengan tombol manual.</p>
        </div>
        {rules.length > 0 && (
          <button type="button" onClick={runNow} disabled={running} className="brutal-btn brutal-btn-sage">
            <Play className="w-4 h-4" />{running ? 'Menjalankan…' : 'Jalankan semua'}
          </button>
        )}
      </div>

      {rules.length === 0 ? (
        <div className="ax-panel ax-emptyc">
          <p>Belum ada aturan Autopilot</p>
          <small>Ketuk ikon ⚡ pada kartu Tagihan, Utang, atau Target untuk mengotomatiskannya, atau pilih jenis Autopilot saat membuat aturan baru.</small>
        </div>
      ) : (
        <div className="ax-acc-grid">
          {rules.map(r => {
            const target = nameOf(r.kind, r.targetId);
            const src = accounts.find(a => a.id === r.sourceAccountId);
            const dueDate = r.kind === 'goal_topup' ? r.nextRunDate
              : r.kind === 'pay_bill' ? bills.find(b => b.id === r.targetId)?.nextPaymentDate
              : debts.find(d => d.id === r.targetId)?.nextPaymentDate;
            const due = dueDate ? getBillDueStatus(dueDate) : null;
            return (
              <article key={r.id} className={`ax-ac ob ${r.isActive ? '' : 'off'}`} style={{ '--c': KIND_TONE[r.kind] } as CSSProperties}>
                <div className="ax-ac-h">
                  <span className="ax-tag" style={{ background: KIND_TONE[r.kind], color: '#14141a' }}>{KIND_LABEL[r.kind]}</span>
                  <button type="button" role="switch" aria-checked={r.isActive} className="ax-sw"
                    title={r.isActive ? 'Klik untuk menonaktifkan aturan ini' : 'Klik untuk mengaktifkan aturan ini'}
                    onClick={() => { toggleAutopilotRule(r.id); refresh(); }}>
                    <i />{r.isActive ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>

                <div>
                  <span className="ax-ob-name" style={{ display: 'block', fontSize: 15.5 }} title={target}>{target ?? <span style={{ color: 'var(--accent-terracotta-light)' }}>target dihapus</span>}</span>
                  <div className="ax-amt-b">{r.amount > 0 ? <Money value={r.amount} /> : 'Ikuti nominal tagihan'}</div>
                </div>

                <div className="ax-ob-list">
                  <div className="ax-ob-row2">
                    <span>Jadwal</span>
                    <b>{r.kind === 'goal_topup' ? (CYCLES.find(c => c.v === r.cycle)?.l ?? '') : 'Saat jatuh tempo'}</b>
                  </div>
                  <div className="ax-ob-row2">
                    <span>{r.kind === 'goal_topup' ? 'Setoran berikutnya' : 'Jatuh tempo'}</span>
                    <b style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      {dueDate ?? '-'}
                      {r.isActive && due && (due.isOverdue
                        ? <span className="ax-st late"><AlertTriangle className="w-3 h-3" />Eksekusi</span>
                        : due.isToday
                          ? <span className="ax-st late"><Clock className="w-3 h-3" />Hari ini</span>
                          : <span className="ax-st">{due.daysLeft} hari</span>)}
                    </b>
                  </div>
                  <div className="ax-ob-row2"><span>Akun sumber</span><b>{src?.name ?? '-'}</b></div>
                  <div className="ax-ob-row2"><span>Riwayat</span><b>{r.executionCount}x{r.lastRunDate ? ` · ${r.lastRunDate}` : ''}</b></div>
                </div>

                {r.lastError && <div role="alert" className="ax-warn t"><AlertTriangle className="w-4 h-4" /><span>{r.lastError}</span></div>}

                <div className="ax-ob-act">
                  <button type="button" className="brutal-btn brutal-btn-lavender" onClick={() => setEditing({ kind: r.kind, targetId: r.targetId, ruleId: r.id })}>
                    <Pencil className="w-3.5 h-3.5" />Ubah aturan
                  </button>
                  <button type="button" className="ax-iconbtn del" onClick={() => setToDelete(r.id)} title="Hapus aturan" aria-label={`Hapus aturan ${KIND_LABEL[r.kind]}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <AutopilotRuleModal request={editing} ledgerId={ledgerId} accounts={accounts} goals={goals} bills={bills} debts={debts}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
      )}

      {deleting && (
        <ConfirmDeleteModal
          title="Hapus Aturan Autopilot?"
          kind={KIND_LABEL[deleting.kind]}
          name={nameOf(deleting.kind, deleting.targetId) ?? 'Target dihapus'}
          notes={[{ text: 'Aturan ini berhenti dijalankan. Pembayaran yang sudah tercatat tetap tersimpan di riwayat kas Anda.' }]}
          confirmLabel="Ya, hapus aturan"
          onClose={() => setToDelete(null)}
          onConfirm={() => { deleteAutopilotRule(deleting.id); setToDelete(null); refresh(); }}
        />
      )}
    </section>
  );
}
