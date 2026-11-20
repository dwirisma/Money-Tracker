/**
 * Notification Service for Artha (100% Cloud Firestore Real-Time)
 * Menyediakan pembuatan, evaluasi pemicu dinamis, dan persistensi notifikasi in-app di Firestore.
 */
import type { Transaction, Bill, Debt, Goal, Account } from '../types';
import { DEFAULT_CATEGORY_BUDGETS, type CategoryBudgetMap } from './settingsService';
import { calculatePayday } from '../utils/salaryCalculator';
import { formatRupiah } from '../utils/financeUtils';
import { appendAutomationEventCloud, updateUserPreferences } from './settingsService';

export type NotificationType =
  | 'automation'
  | 'cutoff'
  | 'payday_adjusted'
  | 'payday_h3'
  | 'bill_due'
  | 'debt_due'
  | 'budget_warning'
  | 'budget_over'
  | 'goal_achieved';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  category: 'Otomasi' | 'Gaji & Shift' | 'Tagihan' | 'Budget' | 'Target' | 'Sistem';
  severity: 'info' | 'warning' | 'danger' | 'success';
  actionModule?: string;
  actionLabel?: string;
}

export interface AutomationEvent {
  id: string;
  ruleName: string;
  amount: number;
  accountName: string;
  timestamp: number;
}

export async function recordAutomationEvent(
  uid: string,
  ruleName: string,
  amount: number,
  accountName: string
): Promise<void> {
  if (!uid) return;
  await appendAutomationEventCloud(uid, ruleName, amount, accountName);
}

export async function saveReadNotificationIdsCloud(uid: string, ids: string[]): Promise<void> {
  if (!uid) return;
  await updateUserPreferences(uid, { notificationsRead: Array.from(new Set(ids)).slice(-200) });
}

export async function saveDismissedNotificationIdsCloud(uid: string, ids: string[]): Promise<void> {
  if (!uid) return;
  await updateUserPreferences(uid, { notificationsDismissed: Array.from(new Set(ids)).slice(-200) });
}

export function evaluateNotifications({
  transactions,
  bills,
  debts,
  goals,
  currentLedgerId,
  categoryBudgets = DEFAULT_CATEGORY_BUDGETS,
  readIds = [],
  dismissedIds = [],
  autoEvents = [],
}: {
  transactions: Transaction[];
  bills: Bill[];
  debts: Debt[];
  goals: Goal[];
  accounts: Account[];
  currentLedgerId: string;
  categoryBudgets?: CategoryBudgetMap;
  readIds?: string[];
  dismissedIds?: string[];
  autoEvents?: AutomationEvent[];
}): AppNotification[] {
  const readSet = new Set(readIds);
  const dismissedSet = new Set(dismissedIds);
  const notifications: AppNotification[] = [];

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();
  const currentDay = now.getDate();
  const monthName = now.toLocaleDateString('id-ID', { month: 'long' });
  const ym = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`;
  const todayMidnight = new Date(currentYear, currentMonthIdx, currentDay).getTime();

  // -------------------------------------------------------------------------
  // 1. OTOMASI BERHASIL DIEKSEKUSI (MODUL 4 & AUTOPILOT)
  // -------------------------------------------------------------------------
  autoEvents.forEach((evt) => {
    const id = `auto-evt-${evt.id}`;
    if (!dismissedSet.has(id)) {
      notifications.push({
        id,
        type: 'automation',
        title: 'Eksekusi Otomasi Berhasil',
        message: `Eksekusi Otomasi: ${evt.ruleName} sebesar ${formatRupiah(evt.amount)} telah berhasil diproses ke ${evt.accountName || 'Rekening'}.`,
        timestamp: evt.timestamp,
        read: readSet.has(id),
        category: 'Otomasi',
        severity: 'success',
        actionModule: 'module4',
        actionLabel: 'Lihat Otomasi',
      });
    }
  });

  // -------------------------------------------------------------------------
  // 2. SIKLUS FINANSIAL & PENGGAJIAN (MODUL 6)
  // -------------------------------------------------------------------------
  if (currentDay === 19 || currentDay === 20) {
    const isToday = currentDay === 20;
    const cutoffId = `cutoff-${ym}-${currentDay}`;
    if (!dismissedSet.has(cutoffId)) {
      notifications.push({
        id: cutoffId,
        type: 'cutoff',
        title: 'Batas Cut-Off Absensi & Lembur',
        message: `Periode cut-off absensi & lembur berakhir ${isToday ? 'hari ini' : 'besok'} (20 ${monthName}). Pastikan lembur aktual dan ceklis makan sudah lengkap.`,
        timestamp: now.getTime(),
        read: readSet.has(cutoffId),
        category: 'Gaji & Shift',
        severity: 'warning',
        actionModule: 'module6',
        actionLabel: 'Cek Kalender Shift',
      });
    }
  }

  const paydayInfo = calculatePayday(currentYear, currentMonthIdx);
  if (paydayInfo.isAdjusted) {
    const paydayAdjId = `payday-adj-${ym}`;
    if (!dismissedSet.has(paydayAdjId)) {
      const adjustedDateNum = new Date(paydayInfo.paydayDate).getDate();
      notifications.push({
        id: paydayAdjId,
        type: 'payday_adjusted',
        title: 'Penyesuaian Jadwal Gajian',
        message: `Gajian bulan ini dimajukan ke Jumat, ${adjustedDateNum} ${monthName} karena tanggal 28 jatuh di akhir pekan.`,
        timestamp: new Date(currentYear, currentMonthIdx, 1).getTime(),
        read: readSet.has(paydayAdjId),
        category: 'Gaji & Shift',
        severity: 'info',
        actionModule: 'module6',
        actionLabel: 'Cek Rincian Gaji',
      });
    }
  }

  const paydayDateObj = new Date(paydayInfo.paydayDate);
  const paydayMidnight = new Date(
    paydayDateObj.getFullYear(),
    paydayDateObj.getMonth(),
    paydayDateObj.getDate()
  ).getTime();
  const diffDaysPayday = Math.round((paydayMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

  if (diffDaysPayday >= 0 && diffDaysPayday <= 3) {
    const paydayH3Id = `payday-h3-${ym}`;
    if (!dismissedSet.has(paydayH3Id)) {
      const estimatedThp = 14959247;
      notifications.push({
        id: paydayH3Id,
        type: 'payday_h3',
        title: 'Menjelang Hari Gajian',
        message: `H-3 menuju gajian! Estimasi Take Home Pay: ${formatRupiah(estimatedThp)}.`,
        timestamp: now.getTime(),
        read: readSet.has(paydayH3Id),
        category: 'Gaji & Shift',
        severity: 'success',
        actionModule: 'module6',
        actionLabel: 'Lihat Estimasi Gaji',
      });
    }
  }

  // -------------------------------------------------------------------------
  // 3. TAGIHAN & CICILAN MENDEKATI JATUH TEMPO (MODUL 3)
  // -------------------------------------------------------------------------
  bills.forEach((bill) => {
    if (bill.nextPaymentDate && bill.ledgerId === currentLedgerId) {
      const billDueDateObj = new Date(bill.nextPaymentDate);
      const billMidnight = new Date(
        billDueDateObj.getFullYear(),
        billDueDateObj.getMonth(),
        billDueDateObj.getDate()
      ).getTime();
      const diffDays = Math.round((billMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

      if (diffDays >= 0 && diffDays <= 3) {
        const billId = `bill-due-${bill.id}-${bill.nextPaymentDate}`;
        if (!dismissedSet.has(billId)) {
          const nominal = bill.fixedAmount || bill.lastNominal || 0;
          const formattedDueDate = billDueDateObj.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
          notifications.push({
            id: billId,
            type: 'bill_due',
            title: 'Tagihan Jatuh Tempo',
            message: `Tagihan ${bill.name} sebesar ${formatRupiah(nominal)} jatuh tempo pada ${formattedDueDate}.`,
            timestamp: billMidnight,
            read: readSet.has(billId),
            category: 'Tagihan',
            severity: 'warning',
            actionModule: 'module3',
            actionLabel: 'Bayar Tagihan',
          });
        }
      }
    }
  });

  debts.forEach((debt) => {
    if (!debt.isPaidOff && debt.nextPaymentDate && debt.ledgerId === currentLedgerId) {
      const debtDueDateObj = new Date(debt.nextPaymentDate);
      const debtMidnight = new Date(
        debtDueDateObj.getFullYear(),
        debtDueDateObj.getMonth(),
        debtDueDateObj.getDate()
      ).getTime();
      const diffDays = Math.round((debtMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

      if (diffDays >= 0 && diffDays <= 3) {
        const debtId = `debt-due-${debt.id}-${debt.nextPaymentDate}`;
        if (!dismissedSet.has(debtId)) {
          const nominal = debt.remainingDebt || debt.totalDebt || 0;
          const formattedDueDate = debtDueDateObj.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
          notifications.push({
            id: debtId,
            type: 'debt_due',
            title: 'Cicilan Utang Jatuh Tempo',
            message: `Tagihan cicilan ${debt.name} sebesar ${formatRupiah(nominal)} jatuh tempo pada ${formattedDueDate}.`,
            timestamp: debtMidnight,
            read: readSet.has(debtId),
            category: 'Tagihan',
            severity: 'warning',
            actionModule: 'module3',
            actionLabel: 'Bayar Cicilan',
          });
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // 4. PERINGATAN ANGGARAN / BUDGETING (MODUL 1 & 5)
  // -------------------------------------------------------------------------
  const currentMonthExpenses = new Map<string, number>();

  transactions.forEach((t) => {
    if (t.ledgerId === currentLedgerId && t.type === 'expense' && t.date && t.date.startsWith(ym)) {
      const cat = (t.category || 'Lainnya').trim();
      const current = currentMonthExpenses.get(cat) || 0;
      currentMonthExpenses.set(cat, current + (Number(t.amount) || 0));
    }
  });

  Object.entries(categoryBudgets).forEach(([category, budgetAmount]) => {
    if (budgetAmount > 0) {
      const spent = currentMonthExpenses.get(category) || 0;
      if (spent > budgetAmount) {
        const overbudgetAmount = spent - budgetAmount;
        const overId = `budget-over-${currentLedgerId}-${category}-${ym}`;
        if (!dismissedSet.has(overId)) {
          notifications.push({
            id: overId,
            type: 'budget_over',
            title: 'Peringatan Overbudget',
            message: `🚨 Kategori ${category} telah Overbudget sebesar ${formatRupiah(overbudgetAmount)}!`,
            timestamp: now.getTime(),
            read: readSet.has(overId),
            category: 'Budget',
            severity: 'danger',
            actionModule: 'module5',
            actionLabel: 'Cek Laporan',
          });
        }
      } else if (spent / budgetAmount >= 0.85) {
        const pct = Math.round((spent / budgetAmount) * 100);
        const warnId = `budget-warn-${currentLedgerId}-${category}-${ym}`;
        if (!dismissedSet.has(warnId)) {
          notifications.push({
            id: warnId,
            type: 'budget_warning',
            title: 'Peringatan Batas Anggaran',
            message: `⚠️ Kategori ${category} telah terpakai ${pct}% dari budget bulanan.`,
            timestamp: now.getTime(),
            read: readSet.has(warnId),
            category: 'Budget',
            severity: 'warning',
            actionModule: 'module5',
            actionLabel: 'Cek Anggaran',
          });
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // 5. TARGET TABUNGAN / GOALS (MODUL 2)
  // -------------------------------------------------------------------------
  goals.forEach((goal) => {
    if (
      goal.ledgerId === currentLedgerId &&
      (goal.isCompleted || (goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount))
    ) {
      const goalId = `goal-achieved-${goal.id}`;
      if (!dismissedSet.has(goalId)) {
        notifications.push({
          id: goalId,
          type: 'goal_achieved',
          title: 'Target Tabungan Tercapai',
          message: `🎉 Selamat! Target ${goal.name} telah terkumpul 100%!`,
          timestamp: goal.createdAt ? new Date(goal.createdAt).getTime() : now.getTime(),
          read: readSet.has(goalId),
          category: 'Target',
          severity: 'success',
          actionModule: 'module2',
          actionLabel: 'Buka Target',
        });
      }
    }
  });

  // Urutkan dari notifikasi yang belum dibaca terlebih dahulu, kemudian berdasarkan timestamp terbaru
  return notifications.sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return b.timestamp - a.timestamp;
  });
}
