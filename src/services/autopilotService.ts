/**
 * AUTOPILOT KEUANGAN (lapisan di atas cashManagementService)
 * Aturan di sini TIDAK memakai engine otomatisasi lama; setiap eksekusi memanggil fungsi
 * yang sudah ada (payBill, payDebtInstallment, allocateFundsToGoal) sehingga saldo,
 * transaksi, dan sinkronisasi tetap lewat logic inti yang sama.
 */
import { advancePaymentDate, allocateFundsToGoal, getLocalAccounts, getLocalBills, getLocalDebts, getLocalGoals, payBill, payDebtInstallment } from './cashManagementService';
import type { BillCycle } from '../types';

export type AutopilotKind = 'goal_topup' | 'pay_bill' | 'pay_debt';

export interface AutopilotRule {
  id: string;
  ledgerId: string;
  name: string;
  kind: AutopilotKind;
  targetId: string;          // id goal / tagihan / utang
  sourceAccountId: string;
  amount: number;            // goal_topup & pay_debt: nominal. pay_bill: 0 = ikuti nominal tagihan
  cycle?: BillCycle;         // hanya goal_topup (tagihan & utang mengikuti jatuh tempo masing-masing)
  nextRunDate?: string;      // hanya goal_topup (YYYY-MM-DD)
  isActive: boolean;
  lastRunDate?: string | null;
  executionCount: number;
  lastError?: string | null;
  createdAt: number;
}

export interface AutopilotResult {
  executed: { rule: AutopilotRule; message: string }[];
  failed: { rule: AutopilotRule; error: string }[];
}

const KEY = 'artha_offline_autopilot';

export function getAutopilotRules(): AutopilotRule[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(rules: AutopilotRule[]) {
  try { localStorage.setItem(KEY, JSON.stringify(rules)); } catch (e) { console.warn('Autopilot: gagal menyimpan aturan', e); }
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function createAutopilotRule(input: Omit<AutopilotRule, 'id' | 'isActive' | 'executionCount' | 'createdAt' | 'lastRunDate' | 'lastError'>): AutopilotRule {
  if (!input.targetId) throw new Error('Pilih target terlebih dahulu.');
  if (!input.sourceAccountId) throw new Error('Pilih akun sumber dana.');
  if (input.kind !== 'pay_bill' && !(input.amount > 0)) throw new Error('Nominal harus lebih dari 0.');
  if (input.kind === 'goal_topup' && !input.nextRunDate) throw new Error('Tanggal eksekusi pertama wajib diisi.');
  const rule: AutopilotRule = {
    ...input,
    id: `ap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    isActive: true,
    executionCount: 0,
    lastRunDate: null,
    lastError: null,
    createdAt: Date.now(),
  };
  save([rule, ...getAutopilotRules()]);
  return rule;
}

export function toggleAutopilotRule(id: string) {
  save(getAutopilotRules().map(r => (r.id === id ? { ...r, isActive: !r.isActive, lastError: null } : r)));
}

export function deleteAutopilotRule(id: string) {
  save(getAutopilotRules().filter(r => r.id !== id));
}

function patchRule(id: string, patch: Partial<AutopilotRule>) {
  save(getAutopilotRules().map(r => (r.id === id ? { ...r, ...patch } : r)));
}

/** Kembalikan jumlah yang bisa dipakai akun (saldo + limit kredit jika ada). */
function available(accId: string): number | null {
  const acc = getLocalAccounts().find(a => a.id === accId);
  return acc ? acc.balance + (acc.creditLimit ?? 0) : null;
}

/** Satu rule per panggilan; return pesan sukses, string kosong jika belum waktunya, atau lempar Error. */
async function runOne(rule: AutopilotRule, today: string): Promise<string> {
  const avail = available(rule.sourceAccountId);
  if (avail === null) throw new Error('Akun sumber tidak ditemukan.');

  if (rule.kind === 'goal_topup') {
    if (!rule.nextRunDate || rule.nextRunDate > today) return '';
    const goal = getLocalGoals().find(g => g.id === rule.targetId);
    if (!goal) throw new Error('Target tabungan tidak ditemukan.');
    const remaining = goal.targetAmount - goal.currentAmount;
    if (goal.isCompleted || remaining <= 0) { patchRule(rule.id, { isActive: false, lastError: 'Target sudah tercapai, aturan dinonaktifkan.' }); return ''; }
    const amount = Math.min(rule.amount, remaining);
    if (avail < amount) throw new Error('Saldo akun sumber tidak cukup.');
    await allocateFundsToGoal(undefined, { goalId: goal.id, amount, sourceAccountId: rule.sourceAccountId, date: today, note: `[Autopilot] ${rule.name}` });
    patchRule(rule.id, { nextRunDate: advancePaymentDate(rule.nextRunDate, rule.cycle ?? 'monthly') });
    return `Top-up ${goal.name}`;
  }

  if (rule.kind === 'pay_bill') {
    const bill = getLocalBills().find(b => b.id === rule.targetId);
    if (!bill) throw new Error('Tagihan tidak ditemukan.');
    if (bill.nextPaymentDate > today) return '';
    const amount = rule.amount > 0 ? rule.amount : bill.pricingType === 'fixed' ? bill.fixedAmount ?? 0 : bill.lastNominal ?? 0;
    if (!(amount > 0)) throw new Error('Nominal tagihan belum diketahui. Isi nominal di aturan atau bayar manual sekali.');
    if (avail < amount) throw new Error('Saldo akun sumber tidak cukup.');
    await payBill(undefined, { billId: bill.id, amount, sourceAccountId: rule.sourceAccountId, date: today, note: `[Autopilot] ${rule.name}` });
    return `Bayar ${bill.name}`;
  }

  const debt = getLocalDebts().find(d => d.id === rule.targetId);
  if (!debt) throw new Error('Utang tidak ditemukan.');
  if (debt.isPaidOff) { patchRule(rule.id, { isActive: false, lastError: 'Utang sudah lunas, aturan dinonaktifkan.' }); return ''; }
  if (!debt.nextPaymentDate || debt.nextPaymentDate > today) return '';
  const amount = Math.min(rule.amount, debt.remainingDebt);
  if (avail < amount) throw new Error('Saldo akun sumber tidak cukup.');
  await payDebtInstallment(undefined, { debtId: debt.id, amount, sourceAccountId: rule.sourceAccountId, date: today, note: `[Autopilot] ${rule.name}` });
  return `Cicil ${debt.name}`;
}

async function doRun(ledgerId?: string): Promise<AutopilotResult> {
  const today = todayStr();
  const result: AutopilotResult = { executed: [], failed: [] };
  const rules = getAutopilotRules().filter(r => r.isActive && (!ledgerId || r.ledgerId === ledgerId));
  // Maksimal satu eksekusi per aturan per panggilan (tanpa "kejar tayang" massal setelah lama tidak dibuka).
  for (const rule of rules) {
    try {
      const message = await runOne(rule, today);
      if (message) {
        const latest = getAutopilotRules().find(r => r.id === rule.id) ?? rule;
        patchRule(rule.id, { lastRunDate: today, executionCount: (latest.executionCount ?? 0) + 1, lastError: null });
        result.executed.push({ rule, message });
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Gagal dijalankan.';
      patchRule(rule.id, { lastError: error });
      result.failed.push({ rule, error });
    }
  }
  return result;
}

let inFlight: Promise<AutopilotResult> | null = null;
/** Single-flight: panggilan bersamaan (mis. init + tombol manual) berbagi satu proses agar tidak terjadi pembayaran ganda. */
export function runAutopilot(ledgerId?: string): Promise<AutopilotResult> {
  if (!inFlight) inFlight = doRun(ledgerId).finally(() => { inFlight = null; });
  return inFlight;
}
