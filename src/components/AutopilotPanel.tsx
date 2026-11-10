import { useMemo, useState } from 'react';
import { Play, Power, Rocket, Trash2 } from 'lucide-react';
import type { Account, Bill, BillCycle, Debt, Goal } from '../types';
import { createAutopilotRule, deleteAutopilotRule, getAutopilotRules, toggleAutopilotRule, type AutopilotKind, type AutopilotResult } from '../services/autopilotService';
import { Money, NeoButton, NeoCard } from './ui/Neo';

export const KIND_LABEL: Record<AutopilotKind, string> = { goal_topup: 'Top-up Sinking Fund', pay_bill: 'Bayar Tagihan', pay_debt: 'Cicil Utang' };
const CYCLES: { v: BillCycle; l: string }[] = [{ v: 'monthly', l: 'Bulanan' }, { v: 'weekly', l: 'Mingguan' }, { v: 'yearly', l: 'Tahunan' }, { v: 'daily', l: 'Harian' }];
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

  return (
    <div className="space-y-4">
      <div>
        <label className="brutal-label">{kind === 'goal_topup' ? 'Target Sinking Fund' : kind === 'pay_bill' ? 'Tagihan yang dibayar' : 'Utang yang dicicil'}</label>
        <select className="brutal-select text-sm" value={draft.targetId} onChange={e => pick(e.target.value)} required>
          <option value="">{targets.length ? 'Pilih…' : `Belum ada ${word} di buku kas ini`}</option>
          {targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="brutal-label">Akun sumber dana</label>
          <select className="brutal-select text-sm" value={draft.sourceId || accs[0]?.id || ''} onChange={e => set({ sourceId: e.target.value })}>
            {accs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="brutal-label">{kind === 'pay_bill' ? 'Nominal (opsional)' : 'Nominal per eksekusi'}</label>
          <input className="brutal-input brutal-input-num text-sm" inputMode="numeric" placeholder={kind === 'pay_bill' ? 'Kosong = ikuti tagihan' : '0'}
            value={draft.amount} onChange={e => set({ amount: e.target.value })} required={kind !== 'pay_bill'} />
        </div>
      </div>
      {kind === 'goal_topup' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="brutal-label">Siklus</label>
            <select className="brutal-select text-sm" value={draft.cycle} onChange={e => set({ cycle: e.target.value as BillCycle })}>
              {CYCLES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
          <div>
            <label className="brutal-label">Eksekusi pertama</label>
            <input type="date" className="brutal-input text-sm" value={draft.start} onChange={e => set({ start: e.target.value })} required />
          </div>
        </div>
      )}
      <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--text-secondary)] font-mono space-y-1">
        <p className="text-[var(--accent-sand-light)] font-bold">ℹ️ Autopilot:</p>
        <p>{kind === 'goal_topup' ? 'Disetor ke target sesuai siklus, tidak melebihi sisa target.' : `Dibayar saat tanggal jatuh tempo ${word} tiba.`} Dijalankan saat aplikasi dibuka, maksimal satu kali per aturan. Jika saldo akun tidak cukup, tidak ada uang yang keluar.</p>
      </div>
    </div>
  );
}

/* ---------- Daftar aturan Autopilot (di halaman Otomatisasi) ---------- */
interface ListProps extends Ctx { version: number; onRun: () => Promise<AutopilotResult> }

export function AutopilotList({ ledgerId, accounts, goals, bills, debts, version, onRun }: ListProps) {
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const rules = useMemo(() => getAutopilotRules().filter(r => r.ledgerId === ledgerId), [ledgerId, version, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  if (rules.length === 0) return null;

  const nameOf = (k: AutopilotKind, id: string) => (k === 'goal_topup' ? goals.find(g => g.id === id) : k === 'pay_bill' ? bills.find(b => b.id === id) : debts.find(d => d.id === id))?.name;
  const runNow = async () => { setRunning(true); try { await onRun(); } finally { setRunning(false); setTick(t => t + 1); } };

  return (
    <NeoCard className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-heading font-bold flex items-center gap-2 text-[var(--text-primary)]"><Rocket className="w-5 h-5" />Aturan Autopilot ({rules.length})</h3>
        <NeoButton accent="sage" onClick={runNow} disabled={running} className="flex items-center gap-1 text-xs"><Play className="w-4 h-4" />{running ? 'Menjalankan…' : 'Jalankan sekarang'}</NeoButton>
      </div>
      <ul className="space-y-2">
        {rules.map(r => (
          <li key={r.id} className="border-2 border-[var(--border-color)] rounded-md px-3 py-2 bg-[var(--bg-elevated)] flex items-start justify-between gap-3" style={{ opacity: r.isActive ? 1 : 0.6 }}>
            <div className="min-w-0 space-y-0.5">
              <div className="font-bold text-sm text-[var(--text-primary)] truncate">{KIND_LABEL[r.kind]}: {nameOf(r.kind, r.targetId) ?? <span className="text-[#c2334d]">target dihapus</span>}</div>
              <div className="text-xs text-[var(--text-secondary)]">
                {r.amount > 0 ? <Money value={r.amount} /> : 'Mengikuti nominal tagihan'} dari {accounts.find(a => a.id === r.sourceAccountId)?.name ?? '-'}
                {r.kind === 'goal_topup' ? ` • ${CYCLES.find(c => c.v === r.cycle)?.l.toLowerCase()}, berikutnya ${r.nextRunDate}` : ' • saat jatuh tempo'}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">{r.executionCount}x dijalankan{r.lastRunDate ? ` • terakhir ${r.lastRunDate}` : ''}</div>
              {r.lastError && <div role="alert" className="text-xs font-bold text-[#c2334d]">{r.lastError}</div>}
            </div>
            <div className="flex gap-1 shrink-0">
              <NeoButton onClick={() => { toggleAutopilotRule(r.id); setTick(t => t + 1); }} aria-pressed={r.isActive} aria-label={r.isActive ? 'Nonaktifkan' : 'Aktifkan'} className="!p-2"><Power className="w-4 h-4" /></NeoButton>
              <NeoButton onClick={() => { if (window.confirm('Hapus aturan Autopilot ini?')) { deleteAutopilotRule(r.id); setTick(t => t + 1); } }} aria-label="Hapus aturan" className="!p-2"><Trash2 className="w-4 h-4" /></NeoButton>
            </div>
          </li>
        ))}
      </ul>
    </NeoCard>
  );
}
