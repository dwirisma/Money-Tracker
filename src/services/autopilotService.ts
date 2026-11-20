/**
 * AUTOPILOT KEUANGAN (100% Cloud Firestore Real-Time)
 * Setiap eksekusi memanggil fungsi transaksi atomik di `cashManagementService`
 * (`payBill`, `payDebtInstallment`, `allocateFundsToGoal`) sehingga saldo dan
 * seluruh entitas terkait tetap konsisten di Cloud Firestore.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  db,
  OperationType,
  handleFirestoreError,
  logFirestoreListenerError,
} from '../config/firebase';
import {
  advancePaymentDate,
  allocateFundsToGoal,
  payBill,
  payDebtInstallment,
  stripUndefined,
} from './cashManagementService';
import type { Account, Bill, BillCycle, Debt, Goal } from '../types';
import { toLocalDateStr } from '../utils/localDate';
import { recordAutomationEvent } from './notificationService';

export type AutopilotKind = 'goal_topup' | 'pay_bill' | 'pay_debt';

export interface AutopilotRule {
  id: string;
  ledgerId: string;
  name: string;
  kind: AutopilotKind;
  targetId: string;
  sourceAccountId: string;
  amount: number;
  cycle?: BillCycle;
  nextRunDate?: string;
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

export function subscribeAutopilotRulesByLedger(
  uid: string,
  ledgerId: string,
  onData: (rules: AutopilotRule[]) => void
): () => void {
  if (!uid || !ledgerId) {
    onData([]);
    return () => {};
  }
  const path = `users/${uid}/autopilot`;
  const q = query(collection(db, 'users', uid, 'autopilot'), where('ledgerId', '==', ledgerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: AutopilotRule[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<AutopilotRule, 'id'>) }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      onData(list);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, path)
  );
}

export async function createAutopilotRule(
  uid: string,
  input: Omit<
    AutopilotRule,
    'id' | 'isActive' | 'executionCount' | 'createdAt' | 'lastRunDate' | 'lastError'
  >
): Promise<AutopilotRule> {
  if (!input.targetId) throw new Error('Pilih target terlebih dahulu.');
  if (!input.sourceAccountId) throw new Error('Pilih akun sumber dana.');
  if (input.kind !== 'pay_bill' && !(input.amount > 0)) {
    throw new Error('Nominal harus lebih dari 0.');
  }
  if (input.kind === 'goal_topup' && !input.nextRunDate) {
    throw new Error('Tanggal eksekusi pertama wajib diisi.');
  }

  const newId = `ap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `users/${uid}/autopilot/${newId}`;
  try {
    const now = Date.now();
    const rule: AutopilotRule = stripUndefined({
      ...input,
      id: newId,
      amount: Number(input.amount) || 0,
      isActive: true,
      executionCount: 0,
      lastRunDate: null,
      lastError: null,
      createdAt: now,
    });
    const { id: _ignoreId, ...body } = rule;
    await setDoc(doc(db, 'users', uid, 'autopilot', newId), stripUndefined({ ...body, updatedAt: now }));
    return rule;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function toggleAutopilotRule(
  uid: string,
  id: string,
  currentActive?: boolean
): Promise<void> {
  const path = `users/${uid}/autopilot/${id}`;
  try {
    const ref = doc(db, 'users', uid, 'autopilot', id);
    let nextActive = currentActive !== undefined ? !currentActive : true;
    if (currentActive === undefined) {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        nextActive = !Boolean((snap.data() as AutopilotRule).isActive);
      }
    }
    await updateDoc(ref, { isActive: nextActive, lastError: null, updatedAt: Date.now() });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateAutopilotRule(
  uid: string,
  id: string,
  patch: Partial<Pick<AutopilotRule, 'sourceAccountId' | 'amount' | 'cycle' | 'nextRunDate'>>
): Promise<void> {
  const path = `users/${uid}/autopilot/${id}`;
  try {
    const ref = doc(db, 'users', uid, 'autopilot', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Aturan tidak ditemukan.');
    const rule = snap.data() as AutopilotRule;
    const next = { ...rule, ...patch };
    if (!next.sourceAccountId) throw new Error('Pilih akun sumber dana.');
    if (next.kind !== 'pay_bill' && !(next.amount > 0)) {
      throw new Error('Nominal harus lebih dari 0.');
    }
    if (next.kind === 'goal_topup' && !next.nextRunDate) {
      throw new Error('Tanggal eksekusi wajib diisi.');
    }
    await updateDoc(ref, stripUndefined({ ...patch, lastError: null, updatedAt: Date.now() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAutopilotRule(uid: string, id: string): Promise<void> {
  const path = `users/${uid}/autopilot/${id}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'autopilot', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

async function patchRuleCloud(
  uid: string,
  id: string,
  patch: Partial<AutopilotRule>
): Promise<void> {
  await updateDoc(
    doc(db, 'users', uid, 'autopilot', id),
    stripUndefined({ ...patch, updatedAt: Date.now() })
  );
}

async function runOneCloud(
  uid: string,
  rule: AutopilotRule,
  today: string
): Promise<{ message: string; amount: number; accountName: string } | null> {
  const accSnap = await getDoc(doc(db, 'users', uid, 'accounts', rule.sourceAccountId));
  if (!accSnap.exists()) throw new Error('Akun sumber tidak ditemukan.');
  const acc = accSnap.data() as Account;
  const avail = (Number(acc.balance) || 0) + (Number(acc.creditLimit) || 0);

  if (rule.kind === 'goal_topup') {
    if (!rule.nextRunDate || rule.nextRunDate > today) return null;
    const goalSnap = await getDoc(doc(db, 'users', uid, 'goals', rule.targetId));
    if (!goalSnap.exists()) throw new Error('Target tabungan tidak ditemukan.');
    const goal = { id: goalSnap.id, ...(goalSnap.data() as Omit<Goal, 'id'>) };
    const remaining = goal.targetAmount - goal.currentAmount;
    if (goal.isCompleted || remaining <= 0) {
      await patchRuleCloud(uid, rule.id, {
        isActive: false,
        lastError: 'Target sudah tercapai, aturan dinonaktifkan.',
      });
      return null;
    }
    const amount = Math.min(rule.amount, remaining);
    if (avail < amount) throw new Error('Saldo akun sumber tidak cukup.');
    await allocateFundsToGoal(uid, {
      goalId: goal.id,
      amount,
      sourceAccountId: rule.sourceAccountId,
      date: today,
      note: `[Autopilot] ${rule.name}`,
    });
    await patchRuleCloud(uid, rule.id, {
      nextRunDate: advancePaymentDate(rule.nextRunDate, rule.cycle ?? 'monthly'),
    });
    return { message: `Top-up ${goal.name}`, amount, accountName: acc.name };
  }

  if (rule.kind === 'pay_bill') {
    const billSnap = await getDoc(doc(db, 'users', uid, 'bills', rule.targetId));
    if (!billSnap.exists()) throw new Error('Tagihan tidak ditemukan.');
    const bill = { id: billSnap.id, ...(billSnap.data() as Omit<Bill, 'id'>) };
    if (bill.nextPaymentDate > today) return null;
    const amount =
      rule.amount > 0
        ? rule.amount
        : bill.pricingType === 'fixed'
        ? bill.fixedAmount ?? 0
        : bill.lastNominal ?? 0;
    if (!(amount > 0)) {
      throw new Error(
        'Nominal tagihan belum diketahui. Isi nominal di aturan atau bayar manual sekali.'
      );
    }
    if (avail < amount) throw new Error('Saldo akun sumber tidak cukup.');
    await payBill(uid, {
      billId: bill.id,
      amount,
      sourceAccountId: rule.sourceAccountId,
      date: today,
      note: `[Autopilot] ${rule.name}`,
    });
    return { message: `Bayar ${bill.name}`, amount, accountName: acc.name };
  }

  const debtSnap = await getDoc(doc(db, 'users', uid, 'debts', rule.targetId));
  if (!debtSnap.exists()) throw new Error('Utang tidak ditemukan.');
  const debt = { id: debtSnap.id, ...(debtSnap.data() as Omit<Debt, 'id'>) };
  if (debt.isPaidOff) {
    await patchRuleCloud(uid, rule.id, {
      isActive: false,
      lastError: 'Utang sudah lunas, aturan dinonaktifkan.',
    });
    return null;
  }
  if (!debt.nextPaymentDate || debt.nextPaymentDate > today) return null;
  const amount = Math.min(rule.amount, debt.remainingDebt);
  if (avail < amount) throw new Error('Saldo akun sumber tidak cukup.');
  await payDebtInstallment(uid, {
    debtId: debt.id,
    amount,
    sourceAccountId: rule.sourceAccountId,
    date: today,
    note: `[Autopilot] ${rule.name}`,
  });
  return { message: `Cicil ${debt.name}`, amount, accountName: acc.name };
}

async function doRunCloud(uid: string, ledgerId?: string): Promise<AutopilotResult> {
  const today = toLocalDateStr(new Date());
  const result: AutopilotResult = { executed: [], failed: [] };

  const baseCol = collection(db, 'users', uid, 'autopilot');
  const q = ledgerId ? query(baseCol, where('ledgerId', '==', ledgerId)) : baseCol;
  const snap = await getDocs(q);
  const rules = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<AutopilotRule, 'id'>) }))
    .filter((r) => r.isActive);

  for (const rule of rules) {
    try {
      const exec = await runOneCloud(uid, rule, today);
      if (exec) {
        await patchRuleCloud(uid, rule.id, {
          lastRunDate: today,
          executionCount: (rule.executionCount ?? 0) + 1,
          lastError: null,
        });
        void recordAutomationEvent(uid, rule.name, exec.amount, exec.accountName);
        result.executed.push({ rule, message: exec.message });
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Gagal dijalankan.';
      try {
        await patchRuleCloud(uid, rule.id, { lastError: error });
      } catch {
        // Abaikan jika gagal update lastError
      }
      result.failed.push({ rule, error });
    }
  }

  return result;
}

const inFlightMap = new Map<string, Promise<AutopilotResult>>();

export function runAutopilot(uid: string, ledgerId?: string): Promise<AutopilotResult> {
  const key = `${uid}:${ledgerId || 'all'}`;
  const existing = inFlightMap.get(key);
  if (existing) return existing;

  const task = doRunCloud(uid, ledgerId).finally(() => {
    inFlightMap.delete(key);
  });
  inFlightMap.set(key, task);
  return task;
}
