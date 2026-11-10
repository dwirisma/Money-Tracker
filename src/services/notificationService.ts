/**
 * Notification Service for Artha
 * Menyediakan pembuatan, evaluasi pemicu dinamis, dan persistensi notifikasi in-app.
 */
import type { Transaction, Bill, Debt, Goal, Account } from '../types';
import { getCategoryBudgets } from './budgetService';
import { calculatePayday } from '../utils/salaryCalculator';
import { formatRupiah } from '../utils/calculator';

export type NotificationType =
  | 'automation'
  | 'cutoff'
  | 'payday_adjusted'
  | 'payday_h3'
  | 'bill_due'
  | 'debt_due'
  | 'budget_warning'
  | 'budget_over'
  | 'goal_achieved'
  | 'backup_reminder';

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

const STORAGE_KEY_READ = 'artha_notifications_read';
const STORAGE_KEY_DISMISSED = 'artha_notifications_dismissed';
const STORAGE_KEY_AUTO_EVENTS = 'artha_automation_events';
const STORAGE_KEY_LAST_BACKUP = 'artha_last_backup_timestamp';

export function getReadNotificationIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_READ);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveReadNotificationIds(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY_READ, JSON.stringify(Array.from(ids)));
  } catch (e) {
    console.error('Failed to save read notification ids:', e);
  }
}

export function getDismissedNotificationIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DISMISSED);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveDismissedNotificationIds(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY_DISMISSED, JSON.stringify(Array.from(ids)));
  } catch (e) {
    console.error('Failed to save dismissed notification ids:', e);
  }
}

export function recordAutomationEvent(ruleName: string, amount: number, accountName: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUTO_EVENTS);
    const events: AutomationEvent[] = raw ? JSON.parse(raw) : [];
    const newEvent: AutomationEvent = {
      id: `auto-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ruleName,
      amount,
      accountName,
      timestamp: Date.now()
    };
    events.unshift(newEvent);
    // Batasi riwayat otomasi maksimal 25 item terbaru
    localStorage.setItem(STORAGE_KEY_AUTO_EVENTS, JSON.stringify(events.slice(0, 25)));
    window.dispatchEvent(new CustomEvent('artha-notifications-updated'));
  } catch (e) {
    console.error('Failed to record automation event:', e);
  }
}

export function getRecordedAutomationEvents(): AutomationEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUTO_EVENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordBackupTimestamp(): void {
  try {
    localStorage.setItem(STORAGE_KEY_LAST_BACKUP, String(Date.now()));
    window.dispatchEvent(new CustomEvent('artha-notifications-updated'));
  } catch (e) {
    console.error('Failed to record backup timestamp:', e);
  }
}

export function getLastBackupTimestamp(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAST_BACKUP);
    if (!raw) return null;
    const num = Number(raw);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

export function evaluateNotifications({
  transactions,
  bills,
  debts,
  goals,
  accounts,
  currentLedgerId,
}: {
  transactions: Transaction[];
  bills: Bill[];
  debts: Debt[];
  goals: Goal[];
  accounts: Account[];
  currentLedgerId: string;
}): AppNotification[] {
  const readIds = getReadNotificationIds();
  const dismissedIds = getDismissedNotificationIds();
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
  // "Eksekusi Otomasi: [Nama Aturan] sebesar Rp [Nominal] telah berhasil diproses ke [Akun/Rekening]."
  // -------------------------------------------------------------------------
  const autoEvents = getRecordedAutomationEvents();
  autoEvents.forEach(evt => {
    const id = `auto-evt-${evt.id}`;
    if (!dismissedIds.has(id)) {
      notifications.push({
        id,
        type: 'automation',
        title: 'Eksekusi Otomasi Berhasil',
        message: `Eksekusi Otomasi: ${evt.ruleName} sebesar ${formatRupiah(evt.amount)} telah berhasil diproses ke ${evt.accountName || 'Rekening'}.`,
        timestamp: evt.timestamp,
        read: readIds.has(id),
        category: 'Otomasi',
        severity: 'success',
        actionModule: 'module4',
        actionLabel: 'Lihat Otomasi'
      });
    }
  });

  // -------------------------------------------------------------------------
  // 2. SIKLUS FINANSIAL & PENGGAJIAN (MODUL 6)
  // -------------------------------------------------------------------------
  
  // (a) Batas Cut-Off (Setiap tanggal 19 s.d. 20)
  // "Periode cut-off absensi & lembur berakhir besok/hari ini (20 [Bulan]). Pastikan lembur aktual dan ceklis makan sudah lengkap."
  if (currentDay === 19 || currentDay === 20) {
    const isToday = currentDay === 20;
    const cutoffId = `cutoff-${ym}-${currentDay}`;
    if (!dismissedIds.has(cutoffId)) {
      notifications.push({
        id: cutoffId,
        type: 'cutoff',
        title: 'Batas Cut-Off Absensi & Lembur',
        message: `Periode cut-off absensi & lembur berakhir ${isToday ? 'hari ini' : 'besok'} (20 ${monthName}). Pastikan lembur aktual dan ceklis makan sudah lengkap.`,
        timestamp: now.getTime(),
        read: readIds.has(cutoffId),
        category: 'Gaji & Shift',
        severity: 'warning',
        actionModule: 'module6',
        actionLabel: 'Cek Kalender Shift'
      });
    }
  }

  // (b) Jadwal Gajian & Penyesuaian Akhir Pekan
  // Jika tanggal 28 jatuh pada Sabtu/Minggu: "Gajian bulan ini dimajukan ke Jumat, [Tanggal] karena tanggal 28 jatuh di akhir pekan."
  const paydayInfo = calculatePayday(currentYear, currentMonthIdx);
  if (paydayInfo.isAdjusted) {
    const paydayAdjId = `payday-adj-${ym}`;
    if (!dismissedIds.has(paydayAdjId)) {
      const adjustedDateNum = new Date(paydayInfo.paydayDate).getDate();
      notifications.push({
        id: paydayAdjId,
        type: 'payday_adjusted',
        title: 'Penyesuaian Jadwal Gajian',
        message: `Gajian bulan ini dimajukan ke Jumat, ${adjustedDateNum} ${monthName} karena tanggal 28 jatuh di akhir pekan.`,
        timestamp: new Date(currentYear, currentMonthIdx, 1).getTime(),
        read: readIds.has(paydayAdjId),
        category: 'Gaji & Shift',
        severity: 'info',
        actionModule: 'module6',
        actionLabel: 'Cek Rincian Gaji'
      });
    }
  }

  // (c) Pada H-3 menuju gajian: "H-3 menuju gajian! Estimasi Take Home Pay: Rp [Nominal]."
  const paydayDateObj = new Date(paydayInfo.paydayDate);
  const paydayMidnight = new Date(paydayDateObj.getFullYear(), paydayDateObj.getMonth(), paydayDateObj.getDate()).getTime();
  const diffDaysPayday = Math.round((paydayMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
  
  if (diffDaysPayday >= 0 && diffDaysPayday <= 3) {
    const paydayH3Id = `payday-h3-${ym}`;
    if (!dismissedIds.has(paydayH3Id)) {
      // Estimasi THP standar dari gaji pokok + tunjangan tetap (atau perhitungan aktif)
      const estimatedThp = 14959247;
      notifications.push({
        id: paydayH3Id,
        type: 'payday_h3',
        title: 'Menjelang Hari Gajian',
        message: `H-3 menuju gajian! Estimasi Take Home Pay: ${formatRupiah(estimatedThp)}.`,
        timestamp: now.getTime(),
        read: readIds.has(paydayH3Id),
        category: 'Gaji & Shift',
        severity: 'success',
        actionModule: 'module6',
        actionLabel: 'Lihat Estimasi Gaji'
      });
    }
  }

  // -------------------------------------------------------------------------
  // 3. TAGIHAN & CICILAN MENDEKATI JATUH TEMPO (MODUL 3)
  // Muncul jika ada tagihan/cicilan yang belum lunas dalam rentang H-3 s.d. Hari H
  // "Tagihan [Nama Tagihan] sebesar Rp [Nominal] jatuh tempo pada [Tanggal]."
  // -------------------------------------------------------------------------
  bills.forEach(bill => {
    if (bill.nextPaymentDate && bill.ledgerId === currentLedgerId) {
      const billDueDateObj = new Date(bill.nextPaymentDate);
      const billMidnight = new Date(billDueDateObj.getFullYear(), billDueDateObj.getMonth(), billDueDateObj.getDate()).getTime();
      const diffDays = Math.round((billMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

      if (diffDays >= 0 && diffDays <= 3) {
        const billId = `bill-due-${bill.id}-${bill.nextPaymentDate}`;
        if (!dismissedIds.has(billId)) {
          const nominal = bill.fixedAmount || bill.lastNominal || 0;
          const formattedDueDate = billDueDateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
          notifications.push({
            id: billId,
            type: 'bill_due',
            title: 'Tagihan Jatuh Tempo',
            message: `Tagihan ${bill.name} sebesar ${formatRupiah(nominal)} jatuh tempo pada ${formattedDueDate}.`,
            timestamp: billMidnight,
            read: readIds.has(billId),
            category: 'Tagihan',
            severity: 'warning',
            actionModule: 'module3',
            actionLabel: 'Bayar Tagihan'
          });
        }
      }
    }
  });

  debts.forEach(debt => {
    if (!debt.isPaidOff && debt.nextPaymentDate && debt.ledgerId === currentLedgerId) {
      const debtDueDateObj = new Date(debt.nextPaymentDate);
      const debtMidnight = new Date(debtDueDateObj.getFullYear(), debtDueDateObj.getMonth(), debtDueDateObj.getDate()).getTime();
      const diffDays = Math.round((debtMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

      if (diffDays >= 0 && diffDays <= 3) {
        const debtId = `debt-due-${debt.id}-${debt.nextPaymentDate}`;
        if (!dismissedIds.has(debtId)) {
          const nominal = debt.remainingDebt || debt.totalDebt || 0;
          const formattedDueDate = debtDueDateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
          notifications.push({
            id: debtId,
            type: 'debt_due',
            title: 'Cicilan Utang Jatuh Tempo',
            message: `Tagihan cicilan ${debt.name} sebesar ${formatRupiah(nominal)} jatuh tempo pada ${formattedDueDate}.`,
            timestamp: debtMidnight,
            read: readIds.has(debtId),
            category: 'Tagihan',
            severity: 'warning',
            actionModule: 'module3',
            actionLabel: 'Bayar Cicilan'
          });
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // 4. PERINGATAN ANGGARAN / BUDGETING (MODUL 1 & 5)
  // Muncul jika pengeluaran kategori mencapai >= 85% dari alokasi budget:
  // "⚠️ Kategori [Nama Kategori] telah terpakai [X]% dari budget bulanan."
  // Muncul jika Overbudget (>100%):
  // "🚨 Kategori [Nama Kategori] telah Overbudget sebesar Rp [Nominal]!"
  // -------------------------------------------------------------------------
  const categoryBudgets = getCategoryBudgets(currentLedgerId);
  const currentMonthExpenses = new Map<string, number>();

  transactions.forEach(t => {
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
        if (!dismissedIds.has(overId)) {
          notifications.push({
            id: overId,
            type: 'budget_over',
            title: 'Peringatan Overbudget',
            message: `🚨 Kategori ${category} telah Overbudget sebesar ${formatRupiah(overbudgetAmount)}!`,
            timestamp: now.getTime(),
            read: readIds.has(overId),
            category: 'Budget',
            severity: 'danger',
            actionModule: 'module5',
            actionLabel: 'Cek Laporan'
          });
        }
      } else if (spent / budgetAmount >= 0.85) {
        const pct = Math.round((spent / budgetAmount) * 100);
        const warnId = `budget-warn-${currentLedgerId}-${category}-${ym}`;
        if (!dismissedIds.has(warnId)) {
          notifications.push({
            id: warnId,
            type: 'budget_warning',
            title: 'Peringatan Batas Anggaran',
            message: `⚠️ Kategori ${category} telah terpakai ${pct}% dari budget bulanan.`,
            timestamp: now.getTime(),
            read: readIds.has(warnId),
            category: 'Budget',
            severity: 'warning',
            actionModule: 'module5',
            actionLabel: 'Cek Anggaran'
          });
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // 5. TARGET TABUNGAN / GOALS (MODUL 2)
  // Muncul ketika target tercapai 100%:
  // "🎉 Selamat! Target [Nama Target/Wishlist] telah terkumpul 100%!"
  // -------------------------------------------------------------------------
  goals.forEach(goal => {
    if (goal.ledgerId === currentLedgerId && (goal.isCompleted || (goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount))) {
      const goalId = `goal-achieved-${goal.id}`;
      if (!dismissedIds.has(goalId)) {
        notifications.push({
          id: goalId,
          type: 'goal_achieved',
          title: 'Target Tabungan Tercapai',
          message: `🎉 Selamat! Target ${goal.name} telah terkumpul 100%!`,
          timestamp: goal.createdAt ? new Date(goal.createdAt).getTime() : now.getTime(),
          read: readIds.has(goalId),
          category: 'Target',
          severity: 'success',
          actionModule: 'module2',
          actionLabel: 'Buka Target'
        });
      }
    }
  });

  // -------------------------------------------------------------------------
  // 6. PENGINGAT BACKUP DATABASE
  // Muncul jika sudah lebih dari 14 hari tidak melakukan ekspor/cadangan data:
  // "Anda belum mencadangkan database selama lebih dari 14 hari. Silakan ekspor cadangan data di Pengaturan."
  // -------------------------------------------------------------------------
  const lastBackup = getLastBackupTimestamp();
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
  
  if (!lastBackup || (Date.now() - lastBackup) > FOURTEEN_DAYS_MS) {
    const backupId = `backup-reminder-${Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))}`;
    if (!dismissedIds.has(backupId)) {
      notifications.push({
        id: backupId,
        type: 'backup_reminder',
        title: 'Pengingat Cadangan Database',
        message: 'Anda belum mencadangkan database selama lebih dari 14 hari. Silakan ekspor cadangan data di Pengaturan.',
        timestamp: now.getTime(),
        read: readIds.has(backupId),
        category: 'Sistem',
        severity: 'info',
        actionModule: 'settings',
        actionLabel: 'Cadangkan Sekarang'
      });
    }
  }

  // Urutkan dari notifikasi yang belum dibaca terlebih dahulu, kemudian berdasarkan timestamp terbaru
  return notifications.sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return b.timestamp - a.timestamp;
  });
}
