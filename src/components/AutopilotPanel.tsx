import { useMemo, useState, type CSSProperties } from 'react';
import { Calculator, Check, Info, Play, Rocket, Trash2 } from 'lucide-react';
import type { Account, Bill, BillCycle, Debt, Goal } from '../types';
import { createAutopilotRule, deleteAutopilotRule, getAutopilotRules, toggleAutopilotRule, type AutopilotKind, type AutopilotResult } from '../services/autopilotService';
import { formatRupiah } from '../utils/calculator';
import { Money } from './ui/Neo';
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

export function AutopilotFields({ kind, draft, onChange, ...ctx }: { kind: AutopilotKind; draft: ApDraft; onChange: (d: ApDraft) => void } & Omit<Ctx, 'ledgerId'>) {
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

      <div>
        <div className="ax-fl"><span>Akun sumber dana</span></div>
        <div className="ax-accs" role="radiogroup" aria-label="Akun sumber dana">
          {accs.map(a => (
            <button key={a.id} type="button" role="radio" aria-checked={sourceValue === a.id} className="ax-acc" onClick={() => set({ sourceId: a.id })}>
              <b>{a.name}</b><small>{AP_ACC_TYPE[a.type] || a.type} · {formatRupiah(a.balance)}</small>
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
            <label className="brutal-label" htmlFor="ap-start">Eksekusi pertama</label>
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

/* ---------- Daftar aturan Autopilot (di halaman Otomatisasi) ---------- */
interface ListProps extends Ctx { version: number; onRun: () => Promise<AutopilotResult> }

const KIND_TONE: Record<AutopilotKind, string> = { goal_topup: 'var(--accent-sand)', pay_bill: '#e3a8f7', pay_debt: 'var(--accent-terracotta)' };

export function AutopilotList({ ledgerId, accounts, goals, bills, debts, version, onRun }: ListProps) {
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const rules = useMemo(() => getAutopilotRules().filter(r => r.ledgerId === ledgerId), [ledgerId, version, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  if (rules.length === 0) return null;

  const nameOf = (k: AutopilotKind, id: string) => (k === 'goal_topup' ? goals.find(g => g.id === id) : k === 'pay_bill' ? bills.find(b => b.id === id) : debts.find(d => d.id === id))?.name;
  const runNow = async () => { setRunning(true); try { await onRun(); } finally { setRunning(false); setTick(t => t + 1); } };

  return (
    <section className="ax-panel ax-sec">
      <div className="ax-secthead">
        <div>
          <h3><Rocket className="w-5 h-5" style={{ color: 'var(--accent-sand)' }} />Aturan Autopilot<em>{rules.length}</em></h3>
          <p className="ax-sec-sub">Top-up tabungan, bayar tagihan, dan cicil utang otomatis.</p>
        </div>
        <button type="button" onClick={runNow} disabled={running} className="brutal-btn brutal-btn-sage">
          <Play className="w-4 h-4" />{running ? 'Menjalankan…' : 'Jalankan sekarang'}
        </button>
      </div>

      <ul className="ax-aplist">
        {rules.map(r => {
          const target = nameOf(r.kind, r.targetId);
          return (
            <li key={r.id} className={`ax-ap ${r.isActive ? '' : 'off'}`} style={{ '--c': KIND_TONE[r.kind] } as CSSProperties}>
              <div className="ax-ap-b">
                <div className="ax-ap-t">
                  <span className="ax-ap-k">{KIND_LABEL[r.kind]}</span>
                  <b>{target ?? <span className="ax-ap-gone">target dihapus</span>}</b>
                </div>
                <div className="ax-ap-m">
                  {r.amount > 0 ? <Money value={r.amount} /> : 'Mengikuti nominal tagihan'} dari {accounts.find(a => a.id === r.sourceAccountId)?.name ?? '-'}
                </div>
                <div className="ax-ap-m">
                  {r.kind === 'goal_topup' ? `${CYCLES.find(c => c.v === r.cycle)?.l ?? ''} · berikutnya ${r.nextRunDate}` : 'Saat jatuh tempo'}
                  {' · '}{r.executionCount}x dijalankan{r.lastRunDate ? ` · terakhir ${r.lastRunDate}` : ''}
                </div>
                {r.lastError && <div role="alert" className="ax-ap-err">{r.lastError}</div>}
              </div>
              <div className="ax-ap-a">
                <button type="button" role="switch" aria-checked={r.isActive} className="ax-tg" onClick={() => { toggleAutopilotRule(r.id); setTick(t => t + 1); }}
                  aria-label={r.isActive ? 'Nonaktifkan aturan' : 'Aktifkan aturan'} title={r.isActive ? 'Aktif' : 'Nonaktif'}><i /></button>
                <button type="button" className="ax-ib del" aria-label="Hapus aturan" title="Hapus aturan"
                  onClick={() => { if (window.confirm('Hapus aturan Autopilot ini?')) { deleteAutopilotRule(r.id); setTick(t => t + 1); } }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
