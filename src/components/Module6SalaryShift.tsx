import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Utensils, 
  Check, 
  Plus, 
  Minus, 
  Zap, 
  DollarSign, 
  ShieldCheck, 
  FileText, 
  Info, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  CalendarCheck, 
  Sparkles, 
  RotateCcw, 
  Briefcase, 
  ChevronLeft, 
  ChevronRight,
  Sun,
  Moon,
  Coffee,
  X,
  Settings,
  HelpCircle,
  Archive,
  Trash2,
  History,
  Search,
  CheckSquare,
  Gift,
  ToggleLeft,
  ToggleRight,
  Edit3
} from 'lucide-react';
import { 
  ShiftDayLog, 
  SalaryBreakdown, 
  PTKPStatus, 
  ShiftType, 
  Account, 
  Ledger, 
  AutomationRule,
  DayType,
  SalaryHistoryRecord,
  ShiftGroup,
  SalaryAddOn
} from '../types';
import { evaluateMathExpression } from '../utils/calculator';
import { 
  generateShiftCalendar,
  getDayType,
  calculateOvertimeIndex,
  calculateDailyOvertimeAmount,
  calculateSalaryBreakdown, 
  calculatePayday,
  getStoredShiftLogs, 
  saveStoredShiftLogs,
  getCustomShiftPattern,
  saveCustomShiftPattern,
  getShiftForDate,
  getAutoOTForPeriod,
  AGC_ANCHOR_DATE,
  AGC_GROUP_C_CYCLE,
  AGC_SHIFT_INFO,
  SHIFT_PATTERN,
  ANCHOR_DATE,
  PUBLIC_HOLIDAYS_2026,
  OVERTIME_BASE_RATE,
  BASIC_SALARY,
  HOUSING_ALLOWANCE,
  SHIFT_ALLOWANCE,
  HOUSING_DEDUCTION,
  DEFAULT_MEAL_RATE,
  getTERCategory
} from '../utils/salaryCalculator';
import { 
  createAutomation, 
  updateAutomation,
  batchSaveSalaryAndAutomation,
  fetchSalaryHistories,
  deleteSalaryHistoryDoc
} from '../services/cashManagementService';

interface Module6SalaryShiftProps {
  activeLedger: Ledger | null;
  accounts: Account[];
  automations: AutomationRule[];
  formatRupiah: (val: number) => string;
  formatDate: (val: string | number) => string;
  onNavigateToTab?: (tab: 'module1' | 'module2' | 'module3' | 'module4' | 'module5' | 'module6') => void;
  onAutomationUpdated?: () => void;
}

const PTKP_OPTIONS: { value: PTKPStatus; label: string; desc: string }[] = [
  { value: 'TK/0', label: 'TK/0 (Kategori TER A)', desc: 'Lajang / Tanpa Tanggungan (PTKP 54 jt)' },
  { value: 'TK/1', label: 'TK/1 (Kategori TER A)', desc: 'Lajang / 1 Tanggungan (PTKP 58.5 jt)' },
  { value: 'K/0', label: 'K/0 (Kategori TER A)', desc: 'Menikah / Tanpa Tanggungan (PTKP 58.5 jt)' },
  { value: 'TK/2', label: 'TK/2 (Kategori TER B)', desc: 'Lajang / 2 Tanggungan (PTKP 63 jt)' },
  { value: 'TK/3', label: 'TK/3 (Kategori TER B)', desc: 'Lajang / 3 Tanggungan (PTKP 67.5 jt)' },
  { value: 'K/1', label: 'K/1 (Kategori TER B)', desc: 'Menikah / 1 Tanggungan (PTKP 63 jt)' },
  { value: 'K/2', label: 'K/2 (Kategori TER B)', desc: 'Menikah / 2 Tanggungan (PTKP 67.5 jt)' },
  { value: 'K/3', label: 'K/3 (Kategori TER C)', desc: 'Menikah / 3 Tanggungan (PTKP 72 jt)' },
];

const STORAGE_KEY_ADDONS = 'artha_salary_addons_';

export function getStoredSalaryAddOns(ledgerId: string, monthKey: string): SalaryAddOn[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_ADDONS}${ledgerId}_${monthKey}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca add-ons gaji lokal:', e);
  }
  return [];
}

export function saveStoredSalaryAddOns(ledgerId: string, monthKey: string, addOns: SalaryAddOn[]) {
  try {
    localStorage.setItem(`${STORAGE_KEY_ADDONS}${ledgerId}_${monthKey}`, JSON.stringify(addOns));
  } catch (e) {
    console.error('Gagal menyimpan add-ons gaji lokal:', e);
  }
}

export const Module6SalaryShift: React.FC<Module6SalaryShiftProps> = ({
  activeLedger,
  accounts,
  automations,
  formatRupiah,
  formatDate,
  onNavigateToTab,
  onAutomationUpdated
}) => {
  // Periode Gaji Aktif (Bulan dan Tahun)
  const now = new Date();
  const [currentYear, setCurrentYear] = useState<number>(now.getFullYear());
  const [currentMonthIndex, setCurrentMonthIndex] = useState<number>(now.getMonth()); // 0-11

  // Grup Shift: Default Group C (Sesuai Permintaan Spesifik Pengguna)
  const [selectedGroup, setSelectedGroup] = useState<ShiftGroup>('C');

  // Konfigurasi Pola Shift & Tanggal Referensi Anchor (Default: AGC Group C 28-Hari)
  const [customPattern, setCustomPattern] = useState<string[]>(() => getCustomShiftPattern().pattern);
  const [anchorDate, setAnchorDate] = useState<string>(() => getCustomShiftPattern().anchorDate);
  const [showPatternModal, setShowPatternModal] = useState<boolean>(false);
  const [patternInput, setPatternInput] = useState<string>(() => getCustomShiftPattern().pattern.join(', '));
  const [anchorDateInput, setAnchorDateInput] = useState<string>(() => getCustomShiftPattern().anchorDate);

  // Status Pajak PTKP & Tarif Makan
  const [ptkpStatus, setPtkpStatus] = useState<PTKPStatus>('TK/0');
  const [mealRate, setMealRate] = useState<number>(DEFAULT_MEAL_RATE);
  const [targetAccountId, setTargetAccountId] = useState<string>(() => {
    const bankAcc = accounts.find(a => a.type === 'bank' && !a.isArchived);
    return bankAcc?.id || accounts[0]?.id || '';
  });

  // Unique Month Key untuk penyimpanan lokal per Buku Kas
  const monthKey = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;

  // Jam Lembur Otomatis Resmi AGC untuk Periode Ini
  const autoOTHours = useMemo(() => {
    return getAutoOTForPeriod(currentMonthIndex, currentYear, selectedGroup);
  }, [currentMonthIndex, currentYear, selectedGroup]);

  // State Daftar Hari Shift Kalender
  const [shiftDays, setShiftDays] = useState<ShiftDayLog[]>(() => {
    if (activeLedger) {
      const stored = getStoredShiftLogs(activeLedger.id, `${monthKey}_grp_${selectedGroup}`);
      if (stored && stored.length > 0) return stored;
    }
    return generateShiftCalendar(currentMonthIndex, currentYear, customPattern, anchorDate, selectedGroup);
  });

  // State Komponen Tambahan Gaji (Add-On / Bonus / THR / Rapelan)
  const [addOns, setAddOns] = useState<SalaryAddOn[]>(() => {
    if (activeLedger) {
      return getStoredSalaryAddOns(activeLedger.id, monthKey);
    }
    return [];
  });

  // Modal State Add-On
  const [isAddOnModalOpen, setIsAddOnModalOpen] = useState<boolean>(false);
  const [editingAddOnId, setEditingAddOnId] = useState<string | null>(null);
  const [addOnName, setAddOnName] = useState<string>('');
  const [addOnAmount, setAddOnAmount] = useState<string>('');
  const [addOnNote, setAddOnNote] = useState<string>('');
  const [addOnCalcNotice, setAddOnCalcNotice] = useState<string | null>(null);

  // Modal Detail Edit Hari
  const [editingDay, setEditingDay] = useState<ShiftDayLog | null>(null);
  const [editDayOT, setEditDayOT] = useState<string>('0');
  const [editDayType, setEditDayType] = useState<string>('Shift 1 (Malam)');
  const [editDayIsWork, setEditDayIsWork] = useState<boolean>(true);
  const [editDayMeals, setEditDayMeals] = useState({ breakfast: false, lunch: false, dinner: false });
  const [editDayNote, setEditDayNote] = useState<string>('');

  // Notifikasi Feedback Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isSubmittingAuto, setIsSubmittingAuto] = useState<boolean>(false);

  // Filter tampilan kalender (semua hari vs hanya hari lembur / kerja / libur)
  const [calendarFilter, setCalendarFilter] = useState<'all' | 'work' | 'off' | 'holiday' | 'overtime'>('all');

  // Arsip Riwayat Gaji Bulanan State
  const [salaryHistories, setSalaryHistories] = useState<SalaryHistoryRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);

  // Tambahkan di deretan useState
const [medicalBik, setMedicalBik] = useState<number>(0);

  // Muat daftar arsip riwayat gaji saat ledger aktif berubah
  const loadSalaryHistories = async () => {
    if (!activeLedger) return;
    setIsLoadingHistory(true);
    try {
      const records = await fetchSalaryHistories(undefined, activeLedger.id);
      setSalaryHistories(records);
    } catch (err) {
      console.error('Gagal memuat riwayat gaji:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadSalaryHistories();
  }, [activeLedger?.id]);

  // Muat ulang add-ons saat monthKey atau activeLedger berubah
  useEffect(() => {
    if (activeLedger) {
      const stored = getStoredSalaryAddOns(activeLedger.id, monthKey);
      setAddOns(stored);
    }
  }, [monthKey, activeLedger?.id]);

  // Listener event dari Top Header untuk membuka modal add-on gaji
  useEffect(() => {
    const handleOpenModalFromHeader = () => {
      setEditingAddOnId(null);
      setAddOnName('');
      setAddOnAmount('');
      setAddOnNote('');
      setAddOnCalcNotice(null);
      setIsAddOnModalOpen(true);
    };
    window.addEventListener('open-salary-addon-modal', handleOpenModalFromHeader);
    return () => window.removeEventListener('open-salary-addon-modal', handleOpenModalFromHeader);
  }, []);

  // Muat ulang shift logs saat monthKey, activeLedger, atau selectedGroup berubah
  useEffect(() => {
    if (activeLedger) {
      const storageKey = `${monthKey}_grp_${selectedGroup}`;
      const stored = getStoredShiftLogs(activeLedger.id, storageKey);
      if (stored && stored.length > 0) {
        // Reset otomatis satu kali ke mode manual (0x makan) jika data sebelumnya memiliki auto-ceklis
        const hasManualReset = localStorage.getItem('artha_manual_meals_mode_v1') === 'true';
        if (!hasManualReset) {
          const cleared = stored.map(d => ({
            ...d,
            meals: { breakfast: false, lunch: false, dinner: false }
          }));
          setShiftDays(cleared);
          saveStoredShiftLogs(activeLedger.id, storageKey, cleared);
          localStorage.setItem('artha_manual_meals_mode_v1', 'true');
        } else {
          setShiftDays(stored);
        }
      } else {
        const fresh = generateShiftCalendar(currentMonthIndex, currentYear, customPattern, anchorDate, selectedGroup);
        setShiftDays(fresh);
        saveStoredShiftLogs(activeLedger.id, storageKey, fresh);
      }
    }
  }, [currentYear, currentMonthIndex, activeLedger?.id, selectedGroup, customPattern, anchorDate]);

  // Simpan perubahan shiftDays ke LocalStorage
  const handleUpdateShiftDays = (newDays: ShiftDayLog[]) => {
    setShiftDays(newDays);
    if (activeLedger) {
      const storageKey = `${monthKey}_grp_${selectedGroup}`;
      saveStoredShiftLogs(activeLedger.id, storageKey, newDays);
    }
  };

  // Kosongkan Semua Ceklis Makan Periode Ini (0x Makan)
  const handleClearAllMeals = () => {
    const updated = shiftDays.map(d => ({
      ...d,
      meals: { breakfast: false, lunch: false, dinner: false }
    }));
    handleUpdateShiftDays(updated);
    showToast('Semua ceklis makan telah dikosongkan (0x makan).', 'info');
  };

  // Navigasi Periode Cut-Off (Bulan Sebelumnya / Bulan Berikutnya)
  const handlePrevPeriod = () => {
    if (currentMonthIndex === 0) {
      setCurrentMonthIndex(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonthIndex(prev => prev - 1);
    }
  };

  const handleNextPeriod = () => {
    if (currentMonthIndex === 11) {
      setCurrentMonthIndex(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonthIndex(prev => prev + 1);
    }
  };

  const handleResetToCurrentPeriod = () => {
    const today = new Date();
    setCurrentYear(today.getFullYear());
    setCurrentMonthIndex(today.getMonth());
  };

  // Hitung Kalkulasi Lengkap dengan Auto OT Resmi AGC & Add-Ons (Bonus/THR/dll)
  const salary: SalaryBreakdown = useMemo(() => {
    return calculateSalaryBreakdown(
      shiftDays, 
      ptkpStatus, 
      mealRate, 
      currentYear, 
      currentMonthIndex,
      autoOTHours,
      addOns,
      medicalBik
    );
  }, [shiftDays, ptkpStatus, mealRate, currentYear, currentMonthIndex, autoOTHours, addOns]);

  // Handler CRUD Komponen Tambahan Gaji (Add-On / Bonus / THR)
  const handleUpdateAddOns = (newAddOns: SalaryAddOn[]) => {
    setAddOns(newAddOns);
    if (activeLedger) {
      saveStoredSalaryAddOns(activeLedger.id, monthKey, newAddOns);
    }
  };

  const handleToggleAddOn = (addOnId: string) => {
    const updated = addOns.map(a => a.id === addOnId ? { ...a, isEnabled: !a.isEnabled } : a);
    handleUpdateAddOns(updated);
    showToast('Status komponen tambahan gaji diperbarui!', 'info');
  };

  const handleDeleteAddOn = (addOnId: string) => {
    const target = addOns.find(a => a.id === addOnId);
    if (!target) return;
    const updated = addOns.filter(a => a.id !== addOnId);
    handleUpdateAddOns(updated);
    showToast(`Komponen "${target.name}" berhasil dihapus!`, 'info');
  };

  const handleOpenAddOnModal = (existing?: SalaryAddOn) => {
    if (existing) {
      setEditingAddOnId(existing.id);
      setAddOnName(existing.name);
      setAddOnAmount(String(existing.amount));
      setAddOnNote(existing.note || '');
    } else {
      setEditingAddOnId(null);
      setAddOnName('');
      setAddOnAmount('');
      setAddOnNote('');
    }
    setAddOnCalcNotice(null);
    setIsAddOnModalOpen(true);
  };

  const handleQuickAddPredefined = (name: string, defaultAmount: number, noteDesc: string = '') => {
    const newAddOn: SalaryAddOn = {
      id: `addon_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      amount: defaultAmount,
      isEnabled: true,
      note: noteDesc
    };
    handleUpdateAddOns([...addOns, newAddOn]);
    showToast(`Komponen "${name}" (+${formatRupiah(defaultAmount)}) berhasil ditambahkan!`, 'success');
  };

  const handleAddOnAmountBlur = () => {
    if (!addOnAmount) return;
    const { success, result, displayValue } = evaluateMathExpression(addOnAmount);
    if (success && displayValue !== addOnAmount) {
      setAddOnCalcNotice(`Kalkulator: ${addOnAmount} = ${formatRupiah(result)}`);
      setAddOnAmount(displayValue);
      setTimeout(() => setAddOnCalcNotice(null), 4000);
    }
  };

  const handleSaveAddOnModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addOnName.trim()) {
      showToast('Masukkan nama komponen tambahan!', 'error');
      return;
    }
    const { result } = evaluateMathExpression(addOnAmount);
    if (result <= 0) {
      showToast('Nominal harus lebih dari 0!', 'error');
      return;
    }

    if (editingAddOnId) {
      const updated = addOns.map(a => {
        if (a.id === editingAddOnId) {
          return {
            ...a,
            name: addOnName.trim(),
            amount: result,
            note: addOnNote.trim()
          };
        }
        return a;
      });
      handleUpdateAddOns(updated);
      showToast(`Komponen "${addOnName.trim()}" berhasil diperbarui!`, 'success');
    } else {
      const newAddOn: SalaryAddOn = {
        id: `addon_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: addOnName.trim(),
        amount: result,
        isEnabled: true,
        note: addOnNote.trim()
      };
      handleUpdateAddOns([...addOns, newAddOn]);
      showToast(`Komponen "${addOnName.trim()}" (+${formatRupiah(result)}) ditambahkan!`, 'success');
    }

    setIsAddOnModalOpen(false);
  };

  // Deskripsi Periode Cut-Off Gaji
  const periodLabel = useMemo(() => {
    const startM = currentMonthIndex === 0 ? 11 : currentMonthIndex - 1;
    const startY = currentMonthIndex === 0 ? currentYear - 1 : currentYear;
    const startDate = new Date(startY, startM, 21);
    const endDate = new Date(currentYear, currentMonthIndex, 20);

    const mStartName = startDate.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
    const mEndName = endDate.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });

    return `21 ${mStartName} – 20 ${mEndName}`;
  }, [currentYear, currentMonthIndex]);

  // Inline Direct Overtime Input Handler (Untuk lembur tambahan aktual)
  const handleInlineOTChange = (dayDate: string, valueStr: string) => {
    const rawVal = parseFloat(valueStr.replace(',', '.')) || 0;
    const val = Math.max(0, Math.min(24, Math.round(rawVal * 10) / 10));

    const updated = shiftDays.map(day => {
      if (day.date === dayDate) {
        const { index, amount } = calculateDailyOvertimeAmount(val, day.dayType, OVERTIME_BASE_RATE);
        return {
          ...day,
          overtimeHours: val,
          overtimeIndex: index,
          overtimeAmount: amount
        };
      }
      return day;
    });

    handleUpdateShiftDays(updated);
  };

  // Toggle Ceklis Makan Langsung pada Kalender
  const handleToggleMeal = (dayDate: string, mealType: 'breakfast' | 'lunch' | 'dinner', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = shiftDays.map(day => {
      if (day.date === dayDate) {
        return {
          ...day,
          meals: {
            ...day.meals,
            [mealType]: !day.meals[mealType]
          }
        };
      }
      return day;
    });
    handleUpdateShiftDays(updated);
  };

  // Toggle Hari Kerja vs Libur Langsung pada Kalender
  const handleToggleWorkDay = (dayDate: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = shiftDays.map(day => {
      if (day.date === dayDate) {
        const nextIsWork = !day.isWorkDay;
        const nextShift = nextIsWork ? (day.shiftType.toLowerCase() === 'off' ? 'Shift 1 (Malam)' : day.shiftType) : 'Off';
        const { dayType, isPublicHoliday, holidayName } = getDayType(day.date, nextShift);
        const { index, amount } = calculateDailyOvertimeAmount(day.overtimeHours, dayType, OVERTIME_BASE_RATE);

        return {
          ...day,
          isWorkDay: nextIsWork,
          shiftType: nextShift,
          dayType,
          isPublicHoliday,
          holidayName,
          overtimeIndex: index,
          overtimeAmount: amount
        };
      }
      return day;
    });
    handleUpdateShiftDays(updated);
  };

  // Quick Action Tambah / Kurang Jam Lembur
  const handleAdjustQuickOT = (dayDate: string, delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = shiftDays.map(day => {
      if (day.date === dayDate) {
        const nextOT = Math.max(0, Math.min(24, Math.round((day.overtimeHours + delta) * 10) / 10));
        const { index, amount } = calculateDailyOvertimeAmount(nextOT, day.dayType, OVERTIME_BASE_RATE);
        return {
          ...day,
          overtimeHours: nextOT,
          overtimeIndex: index,
          overtimeAmount: amount
        };
      }
      return day;
    });
    handleUpdateShiftDays(updated);
  };

  // Buka Modal Edit Detail Hari
  const openEditDayModal = (day: ShiftDayLog) => {
    setEditingDay(day);
    setEditDayOT(String(day.overtimeHours));
    setEditDayType(day.shiftType);
    setEditDayIsWork(day.isWorkDay);
    setEditDayMeals({ ...day.meals });
    setEditDayNote(day.note || '');
  };

  // Simpan Modal Edit Detail Hari
  const handleSaveDayModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDay) return;

    const parsedOT = Math.max(0, parseFloat(editDayOT.replace(',', '.')) || 0);

    const updated = shiftDays.map(day => {
      if (day.date === editingDay.date) {
        const nextIsWork = editDayType.toLowerCase() !== 'off' && editDayIsWork;
        const { dayType, isPublicHoliday, holidayName } = getDayType(day.date, editDayType);
        const { index, amount } = calculateDailyOvertimeAmount(parsedOT, dayType, OVERTIME_BASE_RATE);

        return {
          ...day,
          overtimeHours: parsedOT,
          overtimeIndex: index,
          overtimeAmount: amount,
          shiftType: editDayType,
          isWorkDay: nextIsWork,
          dayType,
          isPublicHoliday,
          holidayName,
          meals: editDayMeals,
          note: editDayNote.trim()
        };
      }
      return day;
    });

    handleUpdateShiftDays(updated);
    setEditingDay(null);
  };

  // Reset Rotasi Group C ke Pola Dokumen Resmi AGC 2026
  const handleResetGroupCPattern = () => {
    setSelectedGroup('C');
    setCustomPattern(AGC_GROUP_C_CYCLE);
    setAnchorDate(AGC_ANCHOR_DATE);
    saveCustomShiftPattern(AGC_GROUP_C_CYCLE, AGC_ANCHOR_DATE);
    const fresh = generateShiftCalendar(currentMonthIndex, currentYear, AGC_GROUP_C_CYCLE, AGC_ANCHOR_DATE, 'C');
    handleUpdateShiftDays(fresh);
    showToast('Jadwal Group C berhasil direset sesuai Shifting Calendar AGC 2026!', 'info');
  };

  // Simpan Konfigurasi Custom Pola Shift
  const handleSaveCustomPattern = (e: React.FormEvent) => {
    e.preventDefault();
    const parts = patternInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      showToast('Pola shift minimal harus memiliki 1 elemen!', 'error');
      return;
    }

    const cleanAnchor = anchorDateInput.trim() || AGC_ANCHOR_DATE;
    setCustomPattern(parts);
    setAnchorDate(cleanAnchor);
    saveCustomShiftPattern(parts, cleanAnchor);

    const fresh = generateShiftCalendar(currentMonthIndex, currentYear, parts, cleanAnchor, selectedGroup);
    handleUpdateShiftDays(fresh);
    setShowPatternModal(false);
    showToast(`Pola shift baru (${parts.length} siklus) diterapkan mulai ${cleanAnchor}!`, 'success');
  };

  // Lompat ke Kalender Periode Tertentu
  const jumpToPeriodOfDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const dd = d.getDate();
    let targetMonth = d.getMonth();
    let targetYear = d.getFullYear();

    // Jika tgl >= 21, masuk ke cut-off bulan berikutnya
    if (dd >= 21) {
      if (targetMonth === 11) {
        targetMonth = 0;
        targetYear++;
      } else {
        targetMonth++;
      }
    }

    setCurrentYear(targetYear);
    setCurrentMonthIndex(targetMonth);
    showToast(`Kalender beralih ke periode cut-off untuk tanggal ${dateStr}!`, 'info');
  };

  const formatPeriodLabel = (periodStr: string) => {
    const [yearStr, monthStr] = periodStr.split('-');
    const y = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10) - 1;
    if (!isNaN(y) && !isNaN(m)) {
      const d = new Date(y, m, 1);
      return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    }
    return periodStr;
  };

  const formatHistoryTimestamp = (val: any) => {
    if (!val) return '-';
    let timeMs = Date.now();
    if (typeof val === 'number') timeMs = val;
    else if (typeof val === 'string') timeMs = new Date(val).getTime() || Date.now();
    else if (val && typeof val.toMillis === 'function') timeMs = val.toMillis();
    
    const d = new Date(timeMs);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleSelectHistoryPeriod = (periodStr: string) => {
    const [yStr, mStr] = periodStr.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10) - 1;
    if (!isNaN(y) && !isNaN(m)) {
      setCurrentYear(y);
      setCurrentMonthIndex(m);
      showToast(`Beralih ke kalender periode ${formatPeriodLabel(periodStr)}`, 'info');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleDeleteHistory = async (historyId: string, periodStr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Hapus arsip riwayat gaji periode ${formatPeriodLabel(periodStr)} (${periodStr})?`)) return;
    setDeletingHistoryId(historyId);
    try {
      await deleteSalaryHistoryDoc(historyId);
      setSalaryHistories(prev => prev.filter(h => h.id !== historyId));
      showToast(`Arsip riwayat gaji periode ${periodStr} berhasil dihapus!`, 'info');
    } catch (err) {
      console.error('Gagal menghapus riwayat gaji:', err);
      showToast('Gagal menghapus arsip riwayat gaji.', 'error');
    } finally {
      setDeletingHistoryId(null);
    }
  };

  // Toast Notification Helper
  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // =========================================================================
  // INTEGRASI KE MODUL 4 & BATCH WRITE KE FIRESTORE (AUTOMATIONS & SALARY_HISTORY)
  // =========================================================================
  const handleSaveSalary = async () => {
    if (!activeLedger) {
      showToast('Buku Kas tidak aktif!', 'error');
      return;
    }

    const targetAcc = accounts.find(a => a.id === targetAccountId) || accounts[0];
    if (!targetAcc) {
      showToast('Pilih akun bank penerima gaji terlebih dahulu!', 'error');
      return;
    }

    setIsSubmittingAuto(true);
    try {
      const existingRule = automations.find(a => 
        a.ledgerId === activeLedger.id && 
        a.name.toLowerCase().includes('gaji') && 
        a.type === 'income'
      );

      const paydayNumber = parseInt(salary.paydayDate.split('-')[2], 10);
      const activeAddOnNames = (addOns || []).filter(a => a.isEnabled).map(a => `${a.name} (+${formatRupiah(a.amount)})`).join(', ');
      const addOnsNote = activeAddOnNames ? ` • Tambahan: ${activeAddOnNames}` : '';
      const noteDesc = `Estimasi Gaji Group C (${periodLabel}) • Auto OT AGC: ${salary.autoOTHours}j • Total OT: ${formatRupiah(salary.totalOTAmount)} (${salary.totalOTHours}j | Indeks: ${salary.totalOTIndex}x)${addOnsNote} • Pajak TER (${salary.terCategory} - ${salary.terRate}%): ${formatRupiah(salary.terTaxAmount)} • Rek: ${targetAcc.name}`;

      // Eksekusi Firestore Batch Write ke koleksi 'automations' dan 'salary_history'
      const { historyRecord } = await batchSaveSalaryAndAutomation({
        ledgerId: activeLedger.id,
        period: monthKey,
        totalOtHours: salary.totalOTHours,
        totalMeals: salary.totalMealCount,
        totalAddOns: salary.totalAddOns,
        netSalary: salary.netSalary,
        grossSalary: salary.grossIncome,
        targetAccountId: targetAcc.id,
        paydayDate: salary.paydayDate,
        paydayNumber,
        noteDesc,
        existingRuleId: existingRule?.id
      });

      // Perbarui riwayat gaji di state lokal
      setSalaryHistories(prev => [historyRecord, ...prev.filter(h => h.id !== historyRecord.id)]);

      showToast(`Batch Write Berhasil! Arsip periode ${monthKey} disimpan & Otomasi Gaji ${formatRupiah(salary.netSalary)} aktif!`, 'success');

      if (onAutomationUpdated) {
        onAutomationUpdated();
      }
    } catch (err) {
      console.error('Gagal menyimpan otomasi dan riwayat gaji:', err);
      showToast('Terjadi kesalahan saat memproses simpan gaji ke Firestore.', 'error');
    } finally {
      setIsSubmittingAuto(false);
    }
  };

  const handleSaveAndAutomateSalary = handleSaveSalary;

  // Filter hari untuk tampilan kalender
  const filteredDays = useMemo(() => {
    if (calendarFilter === 'work') return shiftDays.filter(d => d.isWorkDay && !d.isPublicHoliday);
    if (calendarFilter === 'off') return shiftDays.filter(d => !d.isWorkDay && !d.isPublicHoliday);
    if (calendarFilter === 'holiday') return shiftDays.filter(d => d.isPublicHoliday);
    if (calendarFilter === 'overtime') return shiftDays.filter(d => d.overtimeHours > 0);
    return shiftDays;
  }, [shiftDays, calendarFilter]);

  // Statistik Ringkas Kalender
  const workDaysCount = shiftDays.filter(d => d.isWorkDay && !d.isPublicHoliday).length;
  const offDaysCount = shiftDays.filter(d => !d.isWorkDay && !d.isPublicHoliday).length;
  const holidaysCount = shiftDays.filter(d => d.isPublicHoliday).length;
  const otDaysCount = shiftDays.filter(d => d.overtimeHours > 0).length;

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-16 right-4 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className={`brutal-card p-3.5 px-4 text-xs font-mono font-bold flex items-center gap-2.5 shadow-[4px_4px_0px_#000] ${
            toastMessage.type === 'success' 
              ? 'bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border-[var(--accent-sage)]'
              : toastMessage.type === 'error'
              ? 'bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] border-[var(--accent-terracotta)]'
              : 'bg-[var(--accent-blue-dark)] text-[var(--accent-blue-light)] border-[var(--accent-blue)]'
          }`}>
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 1. HEADER GAJI & SHIFT: KONTROL GRUP & NAVIGASI PERIODE RAPI          */}
      {/* ===================================================================== */}
      <section className="brutal-card p-4 sm:p-5 bg-[var(--bg-surface)] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Briefcase className="w-5 h-5 text-[var(--accent-sand)]" />
            <h2 className="font-heading font-bold text-lg sm:text-xl text-white">
              Prediksi Gaji & Kalender Shift (AGC Group {selectedGroup})
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-[var(--accent-sand-dark)] text-[var(--accent-sand-light)] border border-[var(--accent-sand)]">
              AGC Shifting Calendar 2026
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-mono flex items-center gap-2 flex-wrap">
            <span>Buku Kas: <strong>{activeLedger?.name || 'Utama'}</strong></span>
            <span>•</span>
            <span className="text-[var(--accent-sand-light)]">Periode Cut-Off: <strong>{periodLabel}</strong></span>
            <span>•</span>
            <span className="text-[var(--accent-sage-light)] font-bold">Auto O/T AGC: <strong>{autoOTHours} Jam</strong></span>
          </p>
        </div>

        {/* Kontrol Grup Shift & Navigasi Periode (Rapi, Sejajar, Neo-Brutalisme) */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Segmented Group Selector */}
          <div className="inline-flex items-center bg-[var(--bg-elevated)] p-1 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] shadow-[2px_2px_0px_#000] text-xs font-mono font-bold">
            <span className="px-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider hidden sm:inline">
              Grup
            </span>
            {(['A', 'B', 'C', 'D'] as ShiftGroup[]).map(grp => (
              <button
                key={grp}
                type="button"
                onClick={() => setSelectedGroup(grp)}
                className={`px-3 py-1 rounded transition-all ${
                  selectedGroup === grp
                    ? 'bg-[var(--accent-sand)] text-black font-extrabold shadow-[1px_1px_0px_#000]'
                    : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-muted)]'
                }`}
                title={`Pilih Grup ${grp}`}
              >
                Grup {grp}
              </button>
            ))}
          </div>

          {/* Unified Period Navigation Toolbar */}
          <div className="inline-flex items-center bg-[var(--bg-elevated)] p-1 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] shadow-[2px_2px_0px_#000] text-xs font-mono font-bold">
            <button
              type="button"
              onClick={handlePrevPeriod}
              className="p-1 px-2 hover:bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:text-white rounded transition-colors flex items-center justify-center"
              title="Periode Cut-Off Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleResetToCurrentPeriod}
              className="px-3 py-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-white border border-[var(--border-subtle)] rounded transition-colors"
              title="Kembali ke Periode Cut-Off Bulan Ini"
            >
              Bulan Ini
            </button>

            <button
              type="button"
              onClick={handleNextPeriod}
              className="p-1 px-2 hover:bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:text-white rounded transition-colors flex items-center justify-center"
              title="Periode Cut-Off Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Reset ke Jadwal Standar AGC */}
          <button
            type="button"
            onClick={handleResetGroupCPattern}
            className="p-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:text-white border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[2px_2px_0px_#000] transition-colors"
            title="Reset ke Jadwal Standar AGC Group C 2026"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 3. DUA GRID UTAMA: KALENDER SHIFT (KIRI) & SLIP GAJI (KANAN)          */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">

        {/* ------------------------------------------------------------------- */}
        {/* KOLOM KIRI (7 SPAN): KALENDER SHIFT AGC GROUP C & CEKLIS MAKAN      */}
        {/* ------------------------------------------------------------------- */}
        <div className="lg:col-span-7 space-y-4">
          
          <div className="brutal-card p-4 sm:p-5 bg-[var(--bg-surface)] space-y-4">
            
            {/* Header Kalender & Quick Filter */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b-2 border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-[var(--accent-blue)]" />
                  <span>Jadwal Shift & Ceklis Makan Manual</span>
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)] font-mono">
                  Jadwal shift terisi otomatis dari kalender AGC. Ceklis makan diisi manual (P/S/M) sesuai hari saat Anda makan.
                </p>
              </div>

              {/* Filter Tabs Hari & Quick Action Kosongkan Makan */}
              <div className="flex items-center gap-1.5 text-[10px] font-mono flex-wrap">
                <button
                  type="button"
                  onClick={() => setCalendarFilter('all')}
                  className={`px-2 py-1 rounded border font-bold ${
                    calendarFilter === 'all'
                      ? 'bg-[var(--accent-blue)] text-black border-black shadow-[1px_1px_0px_#000]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                  }`}
                >
                  Semua ({shiftDays.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarFilter('work')}
                  className={`px-2 py-1 rounded border font-bold ${
                    calendarFilter === 'work'
                      ? 'bg-[var(--accent-sage)] text-black border-black shadow-[1px_1px_0px_#000]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                  }`}
                >
                  Kerja ({workDaysCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarFilter('off')}
                  className={`px-2 py-1 rounded border font-bold ${
                    calendarFilter === 'off'
                      ? 'bg-[var(--accent-terracotta)] text-black border-black shadow-[1px_1px_0px_#000]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                  }`}
                >
                  Off ({offDaysCount})
                </button>
                {holidaysCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setCalendarFilter('holiday')}
                    className={`px-2 py-1 rounded border font-bold ${
                      calendarFilter === 'holiday'
                        ? 'bg-[var(--accent-terracotta-light)] text-black border-black shadow-[1px_1px_0px_#000]'
                        : 'bg-[var(--bg-elevated)] text-[var(--accent-terracotta-light)] border-[var(--border-subtle)]'
                    }`}
                  >
                    Libur Nas ({holidaysCount})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCalendarFilter('overtime')}
                  className={`px-2 py-1 rounded border font-bold ${
                    calendarFilter === 'overtime'
                      ? 'bg-[var(--accent-sand)] text-black border-black shadow-[1px_1px_0px_#000]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                  }`}
                >
                  Lembur ({otDaysCount})
                </button>

                {/* Tombol Cepat Kosongkan Ceklis Makan */}
                <button
                  type="button"
                  onClick={handleClearAllMeals}
                  className="px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-muted)] hover:bg-[var(--bg-elevated)] text-[var(--accent-terracotta-light)] hover:text-white font-bold ml-1 transition-colors"
                  title="Kosongkan semua ceklis makan periode ini (0x makan)"
                >
                  Kosongkan Makan (0x)
                </button>
              </div>
            </div>

            {/* Quick Metrics Bar Kalender */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono text-xs">
              <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-0.5">
                <span className="text-[10px] text-[var(--text-muted)] block">Kerja / Off</span>
                <span className="font-bold text-white text-xs">
                  <span className="text-[var(--accent-sage)]">{workDaysCount}</span> / <span className="text-[var(--accent-terracotta-light)]">{offDaysCount}</span>
                </span>
              </div>
              <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-0.5">
                <span className="text-[10px] text-[var(--text-muted)] block">⚡ Auto OT Terjadwal</span>
                <span className="font-bold text-[var(--accent-sand-light)] text-xs">
                  {autoOTHours} Jam
                </span>
              </div>
              <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-0.5">
                <span className="text-[10px] text-[var(--text-muted)] block">Lembur Aktual Ekstra</span>
                <span className="font-bold text-white text-xs">
                  {salary.actualAdditionalOTHours} Jam
                </span>
              </div>
              <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-0.5">
                <span className="text-[10px] text-[var(--text-muted)] block">Ceklis Makan (Manual)</span>
                <span className="font-bold text-[var(--accent-blue-light)] text-xs">
                  {salary.totalMealCount}x Makan
                </span>
              </div>
            </div>

            {/* Grid Kalender Kotak Hari (Neo-Brutalisme AGC) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[660px] overflow-y-auto pr-1">
              {filteredDays.map((day) => {
                const dayMealCount = (day.meals.breakfast ? 1 : 0) + (day.meals.lunch ? 1 : 0) + (day.meals.dinner ? 1 : 0);
                const isHoliday = day.isPublicHoliday;
                const isOffDay = day.dayType === 'OFF_OR_HOLIDAY';
                const otIndex = day.overtimeIndex || calculateOvertimeIndex(day.overtimeHours, day.dayType);
                const otAmount = day.overtimeAmount || calculateDailyOvertimeAmount(day.overtimeHours, day.dayType, OVERTIME_BASE_RATE).amount;

                // Tentukan Styling Kartu Kalender Neo-Brutalisme
                let cardStyle = 'bg-[var(--bg-elevated)] border-[var(--border-color)]';
                if (isHoliday) {
                  cardStyle = 'bg-[#2a1719] border-2 border-[var(--accent-terracotta)] text-white shadow-[3px_3px_0px_#000]';
                } else if (!day.isWorkDay) {
                  cardStyle = day.overtimeHours > 0
                    ? 'bg-[#22171c] border-2 border-[var(--accent-sand)] shadow-[2px_2px_0px_#000]'
                    : 'bg-[#15171c] border-2 border-[var(--border-subtle)] opacity-90 shadow-[2px_2px_0px_#000]';
                } else {
                  cardStyle = day.overtimeHours > 0
                    ? 'bg-[var(--bg-surface)] border-2 border-[var(--accent-sand)] shadow-[2px_2px_0px_#000]'
                    : 'bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] shadow-[2px_2px_0px_#000]';
                }

                // Shift Badge Styling (Shift 1 = Malam, Shift 2 = Pagi, Shift 3 = Sore)
                const isShiftI = day.shiftCode === 'I' || day.shiftType.includes('Shift 1') || day.shiftType.includes('Malam');
                const isShiftII = day.shiftCode === 'II' || day.shiftType.includes('Shift 2') || day.shiftType.includes('Pagi');
                const isShiftIII = day.shiftCode === 'III' || day.shiftType.includes('Shift 3') || day.shiftType.includes('Sore');

                return (
                  <div
                    key={day.date}
                    onClick={() => openEditDayModal(day)}
                    className={`p-2.5 rounded-[var(--radius-sm)] transition-all cursor-pointer relative group flex flex-col justify-between space-y-2 select-none hover:-translate-y-0.5 ${cardStyle}`}
                  >
                    {/* Header Kotak: Tanggal, Nama Hari & Badge Status Shift */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="font-heading font-extrabold text-white flex items-center gap-1">
                          <span className="font-mono text-base">{day.dayNumber}</span>
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">{day.dayName}</span>
                        </div>

                        {/* Badge Shift AGC */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleWorkDay(day.date, e)}
                          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shadow-[1px_1px_0px_#000] transition-colors ${
                            isHoliday
                              ? 'bg-[var(--accent-terracotta)] text-black border-black font-extrabold'
                              : !day.isWorkDay
                              ? 'bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] border-[var(--accent-terracotta)]'
                              : isShiftI
                              ? 'bg-[var(--accent-lavender-dark)] text-[var(--accent-lavender-light)] border-[var(--accent-lavender)]'
                              : isShiftII
                              ? 'bg-[var(--accent-blue-dark)] text-[var(--accent-blue-light)] border-[var(--accent-blue)]'
                              : 'bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border-[var(--accent-sage)]'
                          }`}
                          title="Klik untuk beralih Hari Kerja / Libur (Off)"
                        >
                          {isHoliday 
                            ? 'LIBUR NAS' 
                            : !day.isWorkDay 
                            ? 'OFF' 
                            : isShiftI ? 'I Malam' : isShiftII ? 'II Pagi' : 'III Sore'}
                        </button>
                      </div>

                      {/* Label Nama Hari Libur Nasional Jika Ada */}
                      {isHoliday && day.holidayName && (
                        <div 
                          className="text-[9px] font-mono text-[var(--accent-terracotta-light)] font-bold truncate flex items-center gap-1 bg-[#1a0f11] px-1 py-0.5 rounded border border-[var(--accent-terracotta)]/40"
                          title={day.holidayName}
                        >
                          <span>🎉</span>
                          <span className="truncate">{day.holidayName}</span>
                        </div>
                      )}

                      {/* Jam Masuk Kerja Sesuai Shift */}
                      {day.isWorkDay && (
                        <div className="text-[9px] font-mono text-[var(--text-muted)] flex items-center justify-between">
                          <span>{day.shiftHours || (isShiftI ? '23:00-07:00' : isShiftII ? '07:00-15:00' : '15:00-23:00')}</span>
                        </div>
                      )}
                    </div>

                    {/* INLINE DIRECT INPUT: Jam Lembur Tambahan Aktual */}
                    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between text-[11px] font-mono gap-1">
                        <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3 text-[var(--accent-sand)]" />
                          <span>OT Ekstra:</span>
                        </span>
                        
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="24"
                            value={day.overtimeHours === 0 ? '' : day.overtimeHours}
                            placeholder="0"
                            onChange={(e) => handleInlineOTChange(day.date, e.target.value)}
                            className="brutal-input text-xs py-0.5 px-1 font-mono text-center w-12 h-6 border-[var(--border-subtle)] focus:border-[var(--accent-sand)]"
                            title="Input jam lembur aktual tambahan"
                          />
                          <span className="text-[10px] text-[var(--text-muted)]">j</span>
                        </div>
                      </div>

                      {/* Display Indeks Lembur & Rupiah Tambahan */}
                      {day.overtimeHours > 0 && (
                        <div className="bg-[#121316] p-1 rounded border border-[var(--border-subtle)] text-[9px] font-mono space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[var(--accent-sand)] font-bold">
                              Indeks {otIndex}x
                            </span>
                            <span className="text-[var(--text-muted)] text-[8px]">
                              {isOffDay ? '2x-4x' : '1.5x-2x'}
                            </span>
                          </div>
                          <div className="text-right text-[var(--accent-sand-light)] font-bold truncate">
                            +{formatRupiah(otAmount)}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Ceklis Makan Bar Inline (Ceklis Manual: Pagi, Siang, Malam) */}
                    <div 
                      className="pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-1 text-[10px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[9px] font-mono text-[var(--text-muted)] flex items-center gap-0.5">
                        <Utensils className="w-2.5 h-2.5" />
                        <span>{dayMealCount}x</span>
                      </span>

                      <div className="flex items-center gap-1">
                        {/* Pagi */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleMeal(day.date, 'breakfast', e)}
                          className={`w-4 h-4 rounded-[2px] border text-[8px] font-bold flex items-center justify-center transition-all ${
                            day.meals.breakfast
                              ? 'bg-[var(--accent-blue)] text-black border-black font-extrabold shadow-[1px_1px_0px_#000]'
                              : 'bg-[var(--bg-muted)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-white'
                          }`}
                          title="Makan Pagi (P - Manual)"
                        >
                          P
                        </button>
                        {/* Siang */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleMeal(day.date, 'lunch', e)}
                          className={`w-4 h-4 rounded-[2px] border text-[8px] font-bold flex items-center justify-center transition-all ${
                            day.meals.lunch
                              ? 'bg-[var(--accent-sand)] text-black border-black font-extrabold shadow-[1px_1px_0px_#000]'
                              : 'bg-[var(--bg-muted)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-white'
                          }`}
                          title="Makan Siang (S - Manual)"
                        >
                          S
                        </button>
                        {/* Malam */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleMeal(day.date, 'dinner', e)}
                          className={`w-4 h-4 rounded-[2px] border text-[8px] font-bold flex items-center justify-center transition-all ${
                            day.meals.dinner
                              ? 'bg-[var(--accent-lavender)] text-black border-black font-extrabold shadow-[1px_1px_0px_#000]'
                              : 'bg-[var(--bg-muted)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-white'
                          }`}
                          title="Makan Malam (M - Manual)"
                        >
                          M
                        </button>
                      </div>
                    </div>

                    {/* Quick Button +1j OT on Hover */}
                    <div className="absolute top-1 right-12 hidden group-hover:flex items-center gap-1 bg-[#121316] p-0.5 rounded border border-[var(--border-color)] shadow-[2px_2px_0px_#000] z-10">
                      <button
                        type="button"
                        onClick={(e) => handleAdjustQuickOT(day.date, 1, e)}
                        className="px-1 py-0.2 text-[8px] font-bold text-[var(--accent-sand)] hover:bg-[var(--bg-muted)] rounded"
                        title="Tambah 1 Jam Lembur Tambahan"
                      >
                        +1j
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>

            {/* Catatan Panduan Dokumen Resmi AGC */}
            <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[11px] font-mono space-y-1.5 text-[var(--text-secondary)]">
              <div className="font-bold text-white flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                  <span>Sistem Kerja Shift AGC Group (4 Group 3 Shift):</span>
                </span>
                <span className="text-[10px] text-[var(--accent-sand-light)] font-bold">
                  Auto O/T Periode Ini: {autoOTHours} Jam
                </span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[10px] leading-relaxed">
                <li>
                  <strong>Shift I (Malam):</strong> 23:00 – 07:00 • Otomatis Ceklis Makan Malam / Sahur (M).
                </li>
                <li>
                  <strong>Shift II (Pagi):</strong> 07:00 – 15:00 • Otomatis Ceklis Makan Siang (S).
                </li>
                <li>
                  <strong>Shift III (Sore):</strong> 15:00 – 23:00 • Otomatis Ceklis Makan Malam (M).
                </li>
                <li>
                  <strong>Auto O/T:</strong> Sesuai tabel resmi AGC Shifting Calendar 2026, lembur otomatis terhitung <strong>{autoOTHours} Jam</strong> setiap periode cut-off.
                </li>
              </ul>
            </div>

          </div>

        </div>

        {/* ------------------------------------------------------------------- */}
        {/* KOLOM KANAN (5 SPAN): SLIP GAJI DENGAN AUTO OT & TOTAL LEMBUR        */}
        {/* ------------------------------------------------------------------- */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* SLIP GAJI CARD NEO-BRUTALISME */}
          <div className="brutal-card p-5 sm:p-6 bg-[var(--bg-surface)] space-y-5 border-2 border-[var(--border-color)]">
            
            {/* Header Slip Gaji */}
            <div className="border-b-2 border-[var(--border-subtle)] pb-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">
                  Slip Gaji Resmi Estimasi
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-[var(--accent-blue-dark)] text-[var(--accent-blue-light)] border border-[var(--accent-blue)]">
                  AGC Group {selectedGroup} Industrial
                </span>
              </div>
              <h3 className="font-heading font-extrabold text-lg text-white">
                Rincian Penghasilan Karyawan
              </h3>
              <p className="text-[11px] font-mono text-[var(--text-secondary)]">
                Periode: <strong>{periodLabel}</strong>
              </p>
            </div>

            {/* Konfigurasi PTKP & Tarif Makan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs">
              <div>
                <label className="brutal-label text-[10px]">Status PTKP (Pajak TER)</label>
                <select
                  value={ptkpStatus}
                  onChange={(e) => setPtkpStatus(e.target.value as PTKPStatus)}
                  className="brutal-select text-xs py-1.5"
                >
                  {PTKP_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="brutal-label text-[10px]">Tarif per Ceklis Makan (Rp)</label>
                <input
                  type="number"
                  value={mealRate}
                  onChange={(e) => setMealRate(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="brutal-input text-xs py-1.5 font-mono"
                  step="1000"
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-2">Medical Allowance BIK (Gross) Rp</label>
                <input 
                  type="number" 
                  className="brutal-input w-full font-mono"
                  placeholder="0"
                  value={medicalBik || ''}
                  onChange={(e) => setMedicalBik(Number(e.target.value) || 0)}
                />
                <p className="text-xs mt-1 text-gray-400">
                  *Benefit in Kind: Menambah Pajak PPh 21 tapi tidak masuk Take Home Pay.
                </p>
              </div>
            </div>

            {/* 1. BAGIAN PENDAPATAN / ALLOWANCE */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-heading font-bold text-[var(--accent-sage)] border-b border-[var(--border-subtle)] pb-1">
                <span>1. PENDAPATAN & TUNJANGAN</span>
                <span>NOMINAL</span>
              </div>

              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Gaji Pokok (Basic Salary)</span>
                  <span className="text-white font-bold">{formatRupiah(salary.basicSalary)}</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Tunjangan Perumahan (Housing)</span>
                  <span className="text-white font-bold">{formatRupiah(salary.housingAllowance)}</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Tunjangan Shift (Group {selectedGroup})</span>
                  <span className="text-white font-bold">{formatRupiah(salary.shiftAllowance)}</span>
                </div>

                <div className="pt-1 border-t border-[var(--border-subtle)] flex items-center justify-between font-bold text-white">
                  <span>Total Tunjangan Tetap</span>
                  <span className="text-[var(--accent-sage)]">{formatRupiah(salary.totalAllowance)}</span>
                </div>

                {/* Overtime Breakdown dengan Auto OT & Total Indeks */}
                <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2 mt-1 text-[11px]">
                  
                  {/* Total Lembur */}
                  <div className="flex items-center justify-between font-bold text-[var(--accent-sand-light)] border-b border-[var(--border-subtle)] pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                      <span>Total Upah Lembur ({salary.totalOTHours} Jam • {salary.totalOTIndex}x)</span>
                    </span>
                    <span className="text-sm">+{formatRupiah(salary.totalOTAmount)}</span>
                  </div>

                  {/* Rincian Komponen Lembur */}
                  <div className="space-y-1 text-[10px]">
                    <div className="flex items-center justify-between text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1 text-[var(--accent-sand-light)] font-bold">
                        <span>⚡ Auto O/T Terjadwal (AGC):</span>
                      </span>
                      <span className="font-bold text-white">
                        {salary.autoOTHours} Jam (+{formatRupiah(salary.autoOTAmount)})
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[var(--text-muted)]">
                      <span>• Lembur Tambahan Aktual:</span>
                      <span>
                        {salary.actualAdditionalOTHours} Jam (+{formatRupiah(salary.totalOTAmount - salary.autoOTAmount)})
                      </span>
                    </div>
                  </div>
                </div>

                {/* 1B. KOMPONEN TAMBAHAN GAJI (ADD-ON / BONUS / THR / RAPELAN) */}
                <div className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--accent-sand)]/60 rounded-[var(--radius-sm)] space-y-2 mt-2 shadow-[2px_2px_0px_#000]">
                  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
                    <span className="font-heading font-bold text-xs text-[var(--accent-sand-light)] flex items-center gap-1.5">
                      <Gift className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                      <span>KOMPONEN TAMBAHAN (BONUS / THR)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenAddOnModal()}
                      className="brutal-btn brutal-btn-sand text-[10px] py-0.5 px-2 font-bold shadow-[1px_1px_0px_#000]"
                      title="Tambah komponen penambah perhitungan gaji"
                    >
                      <Plus className="w-3 h-3 inline mr-0.5" />
                      <span>Tambah</span>
                    </button>
                  </div>

                  {/* Quick Predefined Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <button
                      type="button"
                      onClick={() => handleQuickAddPredefined('THR Keagamaan (1x Gaji Pokok)', 9345000, 'Tunjangan Hari Raya')}
                      className="px-2 py-0.5 text-[9px] font-mono font-bold rounded bg-[#1e231f] text-[var(--accent-sage-light)] border border-[var(--accent-sage)]/50 hover:bg-[var(--accent-sage-dark)] transition-colors"
                      title="Tambah THR senilai 1x Gaji Pokok"
                    >
                      + THR (1x Basic)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddPredefined('Bonus Kinerja / Tahunan', 5000000, 'Bonus performance')}
                      className="px-2 py-0.5 text-[9px] font-mono font-bold rounded bg-[#24211a] text-[var(--accent-sand-light)] border border-[var(--accent-sand)]/50 hover:bg-[var(--accent-sand-dark)] transition-colors"
                      title="Tambah Bonus Kinerja"
                    >
                      + Bonus Kinerja
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddPredefined('Insentif Shift / Kehadiran', 750000, 'Insentif ekstra')}
                      className="px-2 py-0.5 text-[9px] font-mono font-bold rounded bg-[#191f24] text-[var(--accent-blue-light)] border border-[var(--accent-blue)]/50 hover:bg-[var(--accent-blue-dark)] transition-colors"
                      title="Tambah Insentif Shift"
                    >
                      + Insentif
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddPredefined('Rapelan Kenaikan Gaji', 1000000, 'Rapelan')}
                      className="px-2 py-0.5 text-[9px] font-mono font-bold rounded bg-[#231d25] text-[var(--accent-lavender-light)] border border-[var(--accent-lavender)]/50 hover:bg-[var(--accent-lavender-dark)] transition-colors"
                      title="Tambah Rapelan Kenaikan Gaji"
                    >
                      + Rapelan
                    </button>
                  </div>

                  {/* Daftar Item Add-On yang Aktif / Dibuat */}
                  {addOns.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      {addOns.map((item) => (
                        <div
                          key={item.id}
                          className={`p-2 rounded border flex items-center justify-between gap-2 text-[11px] font-mono transition-colors ${
                            item.isEnabled
                              ? 'bg-[var(--bg-surface)] border-[var(--border-color)]'
                              : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] opacity-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {/* Toggle Aktif/Nonaktif */}
                            <button
                              type="button"
                              onClick={() => handleToggleAddOn(item.id)}
                              className="text-[var(--text-secondary)] hover:text-white shrink-0"
                              title={item.isEnabled ? 'Nonaktifkan (Simulasi tanpa komponen ini)' : 'Aktifkan komponen ini'}
                            >
                              {item.isEnabled ? (
                                <ToggleRight className="w-4 h-4 text-[var(--accent-sage)]" />
                              ) : (
                                <ToggleLeft className="w-4 h-4 text-[var(--text-muted)]" />
                              )}
                            </button>
                            
                            <div className="truncate">
                              <span className={`font-bold block truncate ${item.isEnabled ? 'text-white' : 'text-[var(--text-muted)] line-through'}`}>
                                {item.name}
                              </span>
                              {item.note && (
                                <span className="text-[9px] text-[var(--text-muted)] block truncate">{item.note}</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`font-bold font-mono ${item.isEnabled ? 'text-[var(--accent-sage)]' : 'text-[var(--text-muted)]'}`}>
                              +{formatRupiah(item.amount)}
                            </span>

                            <button
                              type="button"
                              onClick={() => handleOpenAddOnModal(item)}
                              className="p-1 hover:bg-[var(--bg-muted)] rounded text-[var(--text-muted)] hover:text-white"
                              title="Edit komponen"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteAddOn(item.id)}
                              className="p-1 hover:bg-[var(--bg-muted)] rounded text-[var(--text-muted)] hover:text-[var(--accent-terracotta)]"
                              title="Hapus komponen"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Subtotal Add-On */}
                      <div className="pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-bold">
                        <span className="text-[var(--text-secondary)]">Subtotal Komponen Tambahan:</span>
                        <span className="text-[var(--accent-sand-light)]">+{formatRupiah(salary.totalAddOns)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-[#121316] rounded border border-dashed border-[var(--border-subtle)] text-center text-[10px] text-[var(--text-muted)]">
                      Belum ada tambahan gaji. Klik chip di atas atau tombol <strong>+ Tambah</strong> untuk memasukkan Bonus, THR, Insentif, atau Rapelan.
                    </div>
                  )}
                </div>

                {/* Pendapatan Kotor (Gross) */}
                <div className="pt-2 border-t-2 border-[var(--border-subtle)] space-y-0.5">
                  <div className="flex items-center justify-between text-sm font-bold text-white">
                    <span className="font-heading">PENDAPATAN KOTOR (GROSS)</span>
                    <span className="text-[var(--accent-sage)] font-mono">{formatRupiah(salary.grossIncome)}</span>
                  </div>
                  {salary.totalAddOns > 0 && (
                    <div className="text-[10px] font-mono text-[var(--accent-sand-light)] text-right">
                      (Termasuk Komponen Tambahan: +{formatRupiah(salary.totalAddOns)})
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 2. BAGIAN POTONGAN / DEDUCTIONS & AUTO-TER */}
            <div className="space-y-2.5 pt-2 border-t-2 border-[var(--border-subtle)]">
              <div className="flex items-center justify-between text-xs font-heading font-bold text-[var(--accent-terracotta-light)] border-b border-[var(--border-subtle)] pb-1">
                <span>2. POTONGAN & PAJAK TER</span>
                <span>NOMINAL</span>
              </div>

              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Potongan Makan ({salary.totalMealCount}x @ {formatRupiah(salary.mealRate)})</span>
                  <span className="text-[var(--accent-terracotta-light)] font-bold">-{formatRupiah(salary.totalMealDeduction)}</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Potongan Mess/Housing</span>
                  <span className="text-[var(--accent-terracotta-light)] font-bold">-{formatRupiah(salary.housingDeduction)}</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>BPJS Ketenagakerjaan JHT (2%)</span>
                  <span className="text-[var(--accent-terracotta-light)] font-bold">-{formatRupiah(salary.bpjsJhtEmp)}</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>BPJS Ketenagakerjaan JP (1%)</span>
                  <span className="text-[var(--accent-terracotta-light)] font-bold">-{formatRupiah(salary.bpjsJpEmp)}</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>BPJS Kesehatan (1%)</span>
                  <span className="text-[var(--accent-terracotta-light)] font-bold">-{formatRupiah(salary.bpjsKesEmp)}</span>
                </div>

                {/* Pajak TER DJP 2024 */}
                <div className="p-2.5 bg-[var(--accent-terracotta-dark)]/30 border border-[var(--accent-terracotta)]/50 rounded-[var(--radius-sm)] space-y-1 text-[11px]">
                  <div className="flex items-center justify-between font-bold text-[var(--accent-terracotta-light)]">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-terracotta)]" />
                      Pajak PPh 21 TER Otomatis ({salary.terRate}%)
                    </span>
                    <span>-{formatRupiah(salary.terTaxAmount)}</span>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] flex items-center justify-between">
                    <span>Status PTKP: {salary.ptkpStatus} (Kategori {salary.terCategory})</span>
                    <span className="text-[var(--accent-sand-light)]">DJP PP 58/2023</span>
                  </div>
                </div>

                {/* Total Potongan */}
                <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between font-bold text-[var(--accent-terracotta-light)]">
                  <span>Total Potongan</span>
                  <span>-{formatRupiah(salary.totalDeductions)}</span>
                </div>
              </div>
            </div>

            {/* 3. PENDAPATAN BERSIH (TAKE HOME PAY) */}
            <div className="brutal-card p-4 bg-[var(--accent-sage-dark)]/40 border-2 border-[var(--accent-sage)] space-y-1 text-center shadow-[4px_4px_0px_#000]">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent-sage-light)] font-bold block">
                Estimasi Pendapatan Bersih (Take Home Pay)
              </span>
              <div className="text-3xl font-heading font-extrabold text-[var(--accent-sage)] font-mono">
                {formatRupiah(salary.netSalary)}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] font-mono">
                Penerimaan Kotor ({formatRupiah(salary.grossIncome)}) dikurangi Total Potongan ({formatRupiah(salary.totalDeductions)})
              </p>
            </div>

            {/* 4. TANGGAL GAJIAN & ATURAN HARI KERJA */}
            <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)] flex items-center gap-1.5 font-bold">
                  <CalendarCheck className="w-4 h-4 text-[var(--accent-sand)]" />
                  Jadwal Tanggal Gajian:
                </span>
                <span className="font-bold text-white text-sm">
                  {salary.paydayDate}
                </span>
              </div>

              {salary.isPaydayAdjusted && (
                <div className="p-2 bg-[var(--accent-sand-dark)]/40 border border-[var(--accent-sand)]/50 rounded text-[10px] text-[var(--accent-sand-light)] space-y-0.5">
                  <span className="font-bold block">⚡ Penyesuaian Akhir Pekan Aktif:</span>
                  <p>
                    Tanggal 28 jatuh pada akhir pekan ({salary.paydayOriginalDate}). Sesuai kebijakan payroll perusahaan, transfer gajian <strong>dimajukan ke hari Jumat ({salary.paydayDate})</strong>.
                  </p>
                </div>
              )}

              {/* Rekening Bank Penerima */}
              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1">
                <label className="text-[10px] text-[var(--text-muted)] block">Rekening Bank Tujuan Transfer Gaji:</label>
                <select
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                  className="brutal-select text-xs py-1"
                >
                  {accounts.filter(a => !a.isArchived).map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.type.toUpperCase()}) - Saldo: {formatRupiah(acc.balance)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 5. TOMBOL AKSI: SIMPAN & OTOMATISKAN GAJI (BATCH WRITE FIRESTORE) */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleSaveSalary}
                disabled={isSubmittingAuto || salary.netSalary <= 0}
                className="w-full brutal-btn brutal-btn-sand py-3 text-xs sm:text-sm flex items-center justify-center gap-2 font-bold shadow-[4px_4px_0px_#000] disabled:opacity-50"
              >
                <Zap className="w-4 h-4 text-black fill-black" />
                <span>{isSubmittingAuto ? 'Memproses Batch Write...' : 'Simpan & Otomatiskan Gaji'}</span>
              </button>

              {onNavigateToTab && (
                <button
                  type="button"
                  onClick={() => onNavigateToTab('module4')}
                  className="w-full brutal-btn brutal-btn-ghost py-2 text-xs flex items-center justify-center gap-1.5 text-[var(--text-secondary)] hover:text-white"
                >
                  <span>Buka Modul 4: Kelola Aturan Otomatisasi</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* ===================================================================== */}
      {/* 4. ARSIP RIWAYAT GAJI BULANAN (SALARY HISTORY RECORD)                */}
      {/* ===================================================================== */}
      <section className="brutal-card p-5 sm:p-6 bg-[var(--bg-surface)] space-y-5 border-2 border-[var(--border-color)]">
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b-2 border-[var(--border-subtle)] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Archive className="w-5 h-5 text-[var(--accent-sand)]" />
              <h3 className="font-heading font-bold text-lg text-white">
                Arsip Riwayat Gaji
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border border-[var(--accent-sage)]">
                {salaryHistories.length} Periode Tersimpan
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] font-mono">
              Rekam jejak historis detail gaji bulanan yang telah disimpan ke Firestore & terintegrasi dengan otomatisasi.
            </p>
          </div>

          <button
            type="button"
            onClick={loadSalaryHistories}
            className="brutal-btn brutal-btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-white"
            title="Muat Ulang Riwayat Gaji"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            <span>Segarkan Arsip</span>
          </button>
        </div>

        {salaryHistories.length === 0 ? (
          <div className="p-8 text-center bg-[var(--bg-elevated)] border-2 border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2 font-mono">
            <FileText className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-60" />
            <h4 className="text-sm font-bold text-white">Belum Ada Riwayat Gaji Tersimpan</h4>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              Saat Anda menekan tombol <strong>"Simpan & Otomatiskan Gaji"</strong>, detail slip gaji bulan aktif beserta total jam lembur dan ceklis makan akan diarsipkan di sini.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b-2 border-[var(--border-color)] text-[var(--text-muted)] text-[10px] uppercase">
                    <th className="py-2.5 px-3">Periode Bulan</th>
                    <th className="py-2.5 px-3">Pendapatan Bersih (Net)</th>
                    <th className="py-2.5 px-3">Pendapatan Kotor</th>
                    <th className="py-2.5 px-3">Info Lembur</th>
                    <th className="py-2.5 px-3">Info Makan</th>
                    <th className="py-2.5 px-3">Tercatat Pada</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {salaryHistories.map((hist) => (
                    <tr 
                      key={hist.id}
                      className="hover:bg-[var(--bg-elevated)] transition-colors group"
                    >
                      <td className="py-3 px-3">
                        <div className="font-heading font-bold text-sm text-white">
                          {formatPeriodLabel(hist.period)}
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                          {hist.period}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-heading font-extrabold text-sm text-[var(--accent-sage)]">
                          {formatRupiah(hist.netSalary)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[var(--text-secondary)]">
                        {formatRupiah(hist.grossSalary)}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 text-[var(--accent-sand-light)] font-bold">
                          <Clock className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                          <span>{hist.totalOtHours} Jam</span>
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 text-[var(--accent-blue-light)] font-bold">
                          <Utensils className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                          <span>{hist.totalMeals} Kali</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[10px] text-[var(--text-muted)]">
                        {formatHistoryTimestamp(hist.createdAt)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSelectHistoryPeriod(hist.period)}
                            className="brutal-btn brutal-btn-ghost text-[10px] py-1 px-2.5 text-[var(--text-secondary)] hover:text-white shadow-[1px_1px_0px_#000]"
                            title="Buka Kalender Periode Ini"
                          >
                            Buka
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteHistory(hist.id, hist.period, e)}
                            disabled={deletingHistoryId === hist.id}
                            className="brutal-btn brutal-btn-ghost text-[10px] py-1 px-2 text-[var(--accent-terracotta-light)] hover:bg-[var(--accent-terracotta-dark)]/40 border-[var(--accent-terracotta)]/40"
                            title="Hapus Arsip Riwayat Ini"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:hidden gap-3">
              {salaryHistories.map((hist) => (
                <div
                  key={hist.id}
                  className="p-3.5 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[2px_2px_0px_#000] space-y-3 font-mono"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">Periode</span>
                      <span className="font-heading font-bold text-sm text-white">{formatPeriodLabel(hist.period)}</span>
                    </div>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      {hist.period}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded space-y-1">
                    <span className="text-[10px] text-[var(--text-muted)] block">Pendapatan Bersih (Net)</span>
                    <div className="text-lg font-heading font-extrabold text-[var(--accent-sage)]">
                      {formatRupiah(hist.netSalary)}
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] block">
                      Kotor: {formatRupiah(hist.grossSalary)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-[var(--accent-sand-light)]">
                      <Clock className="w-3.5 h-3.5 text-[var(--accent-sand)] shrink-0" />
                      <span>{hist.totalOtHours} Jam OT</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[var(--accent-blue-light)]">
                      <Utensils className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                      <span>{hist.totalMeals}x Makan</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px]">
                    <span className="text-[var(--text-muted)]">
                      {formatHistoryTimestamp(hist.createdAt)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSelectHistoryPeriod(hist.period)}
                        className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-white hover:border-[var(--accent-sand)] text-[10px]"
                      >
                        Buka
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistory(hist.id, hist.period, e)}
                        disabled={deletingHistoryId === hist.id}
                        className="px-2 py-1 rounded bg-[var(--accent-terracotta-dark)]/50 border border-[var(--accent-terracotta)] text-[var(--accent-terracotta-light)] text-[10px] flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </section>

      {/* ===================================================================== */}
      {/* MODAL EDIT DETAIL HARI (JAM LEMBUR, CEKLIS MAKAN & TIPE SHIFT)        */}
      {/* ===================================================================== */}
      {editingDay && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4 shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div className="space-y-0.5">
                <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-[var(--accent-sand)]" />
                  <span>Detail Hari: {editingDay.date} ({editingDay.dayName})</span>
                </h3>
                {editingDay.isPublicHoliday && editingDay.holidayName && (
                  <p className="text-[11px] font-mono text-[var(--accent-terracotta-light)] font-bold">
                    🎉 {editingDay.holidayName} (Tanggal Merah Nasional)
                  </p>
                )}
              </div>
              <button 
                onClick={() => setEditingDay(null)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDayModal} className="space-y-4">
              
              {/* Status Hari & Tipe Shift */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label text-xs">Status Hari</label>
                  <select
                    value={editDayIsWork ? 'work' : 'off'}
                    onChange={(e) => {
                      const isWork = e.target.value === 'work';
                      setEditDayIsWork(isWork);
                      if (!isWork) setEditDayType('Off');
                      else if (editDayType.toLowerCase() === 'off') setEditDayType('Shift 1 (Malam)');
                    }}
                    className="brutal-select text-xs py-1.5"
                  >
                    <option value="work">Hari Kerja (Work)</option>
                    <option value="off">Hari Libur (Off)</option>
                  </select>
                </div>

                <div>
                  <label className="brutal-label text-xs">Label Shift</label>
                  <select
                    value={editDayType}
                    onChange={(e) => {
                      const type = e.target.value;
                      setEditDayType(type);
                      setEditDayIsWork(type.toLowerCase() !== 'off');
                    }}
                    className="brutal-select text-xs py-1.5"
                  >
                    <option value="Shift 1 (Malam)">Shift 1 (Malam: 23-07)</option>
                    <option value="Shift 2 (Pagi)">Shift 2 (Pagi: 07-15)</option>
                    <option value="Shift 3 (Sore)">Shift 3 (Sore: 15-23)</option>
                    <option value="Off">Off / Libur</option>
                  </select>
                </div>
              </div>

              {/* Jam Lembur Aktual Tambahan */}
              <div>
                <label className="brutal-label text-xs flex items-center justify-between">
                  <span>Lembur Tambahan Aktual (Overtime)</span>
                  <span className="text-[10px] text-[var(--accent-sand-light)] font-mono">
                    Basis: {formatRupiah(OVERTIME_BASE_RATE)}/j
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    value={editDayOT}
                    onChange={(e) => setEditDayOT(e.target.value)}
                    className="brutal-input text-sm font-mono"
                    placeholder="0"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditDayOT('1')}
                      className="brutal-btn brutal-btn-ghost text-xs py-1.5 px-2"
                    >
                      1j
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDayOT('2')}
                      className="brutal-btn brutal-btn-ghost text-xs py-1.5 px-2"
                    >
                      2j
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDayOT('4')}
                      className="brutal-btn brutal-btn-ghost text-xs py-1.5 px-2"
                    >
                      4j
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDayOT('8')}
                      className="brutal-btn brutal-btn-ghost text-xs py-1.5 px-2"
                    >
                      8j
                    </button>
                  </div>
                </div>
                {parseFloat(editDayOT) > 0 && (
                  <p className="text-[10px] text-[var(--accent-sand-light)] font-mono mt-1">
                    Indeks: {calculateOvertimeIndex(parseFloat(editDayOT) || 0, editingDay.dayType)}x • 
                    Upah Tambahan: +{formatRupiah(calculateDailyOvertimeAmount(parseFloat(editDayOT) || 0, editingDay.dayType, OVERTIME_BASE_RATE).amount)}
                  </p>
                )}
              </div>

              {/* Ceklis Makan Hari Ini */}
              <div className="space-y-2">
                <label className="brutal-label text-xs">Ceklis Makan (Potongan Kantin)</label>
                <div className="grid grid-cols-3 gap-2">
                  <label className={`p-2.5 rounded border flex items-center gap-2 cursor-pointer font-mono text-xs ${
                    editDayMeals.breakfast ? 'bg-[var(--accent-blue-dark)] text-white border-[var(--accent-blue)]' : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)]'
                  }`}>
                    <input
                      type="checkbox"
                      checked={editDayMeals.breakfast}
                      onChange={(e) => setEditDayMeals({ ...editDayMeals, breakfast: e.target.checked })}
                      className="rounded"
                    />
                    <span>Pagi</span>
                  </label>

                  <label className={`p-2.5 rounded border flex items-center gap-2 cursor-pointer font-mono text-xs ${
                    editDayMeals.lunch ? 'bg-[var(--accent-sand-dark)] text-white border-[var(--accent-sand)]' : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)]'
                  }`}>
                    <input
                      type="checkbox"
                      checked={editDayMeals.lunch}
                      onChange={(e) => setEditDayMeals({ ...editDayMeals, lunch: e.target.checked })}
                      className="rounded"
                    />
                    <span>Siang</span>
                  </label>

                  <label className={`p-2.5 rounded border flex items-center gap-2 cursor-pointer font-mono text-xs ${
                    editDayMeals.dinner ? 'bg-[var(--accent-lavender-dark)] text-white border-[var(--accent-lavender)]' : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)]'
                  }`}>
                    <input
                      type="checkbox"
                      checked={editDayMeals.dinner}
                      onChange={(e) => setEditDayMeals({ ...editDayMeals, dinner: e.target.checked })}
                      className="rounded"
                    />
                    <span>Malam</span>
                  </label>
                </div>
              </div>

              {/* Catatan Hari Ini */}
              <div>
                <label className="brutal-label text-xs">Catatan Shift / Overtime</label>
                <input
                  type="text"
                  value={editDayNote}
                  onChange={(e) => setEditDayNote(e.target.value)}
                  placeholder="Misal: Back-up mesin line 2, OT perbaikan boiler"
                  className="brutal-input text-xs"
                />
              </div>

              {/* Tombol Aksi Modal */}
              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setEditingDay(null)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="brutal-btn brutal-btn-sand text-xs font-bold"
                >
                  Simpan Perubahan
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL KONFIGURASI POLA SIKLUS SHIFT (SHIFT_PATTERN & ANCHOR_DATE)     */}
      {/* ===================================================================== */}
      {showPatternModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-lg w-full space-y-4 shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div className="space-y-0.5">
                <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[var(--accent-sand)]" />
                  <span>Konfigurasi Siklus Shift & Tanggal Anchor</span>
                </h3>
                <p className="text-[11px] font-mono text-[var(--text-secondary)]">
                  Ubah urutan rotasi shift Group C atau tanggal patokan (Anchor Date)
                </p>
              </div>
              <button 
                onClick={() => setShowPatternModal(false)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomPattern} className="space-y-4">
              
              {/* Input Pola Shift Array */}
              <div className="space-y-1">
                <label className="brutal-label text-xs">
                  Urutan Pola Shift (Pisahkan dengan koma)
                </label>
                <input
                  type="text"
                  value={patternInput}
                  onChange={(e) => setPatternInput(e.target.value)}
                  placeholder="III, III, O, O, I, I, II, II, II, ..."
                  className="brutal-input text-xs font-mono"
                  required
                />
                <p className="text-[10px] text-[var(--text-muted)] font-mono">
                  Siklus berjalan berulang secara otomatis setiap {patternInput.split(',').filter(Boolean).length} hari.
                </p>
              </div>

              {/* Tanggal Referensi Anchor Date */}
              <div className="space-y-1">
                <label className="brutal-label text-xs">
                  Tanggal Referensi (Anchor Date - Index ke-0 terjadi)
                </label>
                <input
                  type="date"
                  value={anchorDateInput}
                  onChange={(e) => setAnchorDateInput(e.target.value)}
                  className="brutal-input text-xs font-mono"
                  required
                />
                <p className="text-[10px] text-[var(--text-muted)] font-mono">
                  Pada tanggal ini, jadwal hari tersebut dijamin adalah shift pertama di pola di atas.
                </p>
              </div>

              {/* Template Preset Cepat */}
              <div className="space-y-1.5 p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded text-xs font-mono">
                <span className="text-[10px] text-[var(--text-muted)] block font-bold">Pilihan Preset Pola:</span>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setPatternInput(AGC_GROUP_C_CYCLE.join(', '));
                      setAnchorDateInput(AGC_ANCHOR_DATE);
                    }}
                    className="px-2 py-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-sand)] rounded text-[10px]"
                  >
                    AGC Group C Resmi (28-Hari)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPatternInput('Pagi, Pagi, Malam, Malam, Off, Off');
                      setAnchorDateInput('2025-12-21');
                    }}
                    className="px-2 py-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-sand)] rounded text-[10px]"
                  >
                    Group C Klasik (2P, 2M, 2Off)
                  </button>
                </div>
              </div>

              {/* Tombol Aksi Modal */}
              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowPatternModal(false)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="brutal-btn brutal-btn-sand text-xs font-bold"
                >
                  Simpan & Terapkan ke Kalender
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 6. MODAL TAMBAH / EDIT KOMPONEN TAMBAHAN GAJI (BONUS / THR / DLL)     */}
      {/* ===================================================================== */}
      {isAddOnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="brutal-card p-5 sm:p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4 border-2 border-[var(--border-color)] shadow-[var(--shadow-xl)]">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-[var(--accent-sand)]" />
                <h3 className="font-heading font-bold text-base text-white">
                  {editingAddOnId ? 'Edit Komponen Tambahan' : 'Tambah Komponen Tambahan (Bonus/THR)'}
                </h3>
              </div>
              <button 
                onClick={() => setIsAddOnModalOpen(false)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Template Cepat */}
            {!editingAddOnId && (
              <div className="space-y-1.5 p-2.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded text-xs font-mono">
                <span className="text-[10px] text-[var(--text-muted)] block font-bold">Pilihan Cepat (Klik untuk Mengisi):</span>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setAddOnName('THR Keagamaan (1x Basic)');
                      setAddOnAmount('9345000');
                      setAddOnNote('Tunjangan Hari Raya');
                    }}
                    className="px-2 py-0.5 bg-[var(--bg-surface)] border border-[var(--accent-sage)]/60 text-[var(--accent-sage-light)] rounded text-[10px] font-bold hover:bg-[var(--accent-sage-dark)] transition-colors"
                  >
                    THR (1x Basic)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddOnName('Bonus Kinerja Tahunan');
                      setAddOnAmount('5000000');
                      setAddOnNote('Performance bonus');
                    }}
                    className="px-2 py-0.5 bg-[var(--bg-surface)] border border-[var(--accent-sand)]/60 text-[var(--accent-sand-light)] rounded text-[10px] font-bold hover:bg-[var(--accent-sand-dark)] transition-colors"
                  >
                    Bonus Kinerja
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddOnName('Insentif Shift / Kehadiran');
                      setAddOnAmount('750000');
                      setAddOnNote('Insentif ekstra shift');
                    }}
                    className="px-2 py-0.5 bg-[var(--bg-surface)] border border-[var(--accent-blue)]/60 text-[var(--accent-blue-light)] rounded text-[10px] font-bold hover:bg-[var(--accent-blue-dark)] transition-colors"
                  >
                    Insentif Shift
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddOnName('Rapelan Kenaikan Gaji');
                      setAddOnAmount('1000000');
                      setAddOnNote('Rapelan selisih gaji');
                    }}
                    className="px-2 py-0.5 bg-[var(--bg-surface)] border border-[var(--accent-lavender)]/60 text-[var(--accent-lavender-light)] rounded text-[10px] font-bold hover:bg-[var(--accent-lavender-dark)] transition-colors"
                  >
                    Rapelan
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveAddOnModal} className="space-y-4">
              
              {/* Nama Komponen */}
              <div className="space-y-1">
                <label className="brutal-label text-xs">
                  Nama Komponen Tambahan
                </label>
                <input
                  type="text"
                  value={addOnName}
                  onChange={(e) => setAddOnName(e.target.value)}
                  placeholder="Misal: THR Idul Fitri, Bonus Akhir Tahun, Rapelan..."
                  className="brutal-input text-xs"
                  required
                  autoFocus
                />
              </div>

              {/* Nominal Penambah */}
              <div className="space-y-1">
                <label className="brutal-label text-xs flex items-center justify-between">
                  <span>Nominal Tambahan (Rp)</span>
                  <span className="text-[10px] text-[var(--accent-sand-light)] font-mono">
                    Mendukung ekspresi (mis: 5000000 + 2000000)
                  </span>
                </label>
                <input
                  type="text"
                  value={addOnAmount}
                  onChange={(e) => setAddOnAmount(e.target.value)}
                  onBlur={handleAddOnAmountBlur}
                  placeholder="0"
                  className="brutal-input text-sm font-mono"
                  required
                />
                {addOnCalcNotice && (
                  <p className="text-[10px] text-[var(--accent-sand-light)] font-mono">
                    {addOnCalcNotice}
                  </p>
                )}
                <p className="text-[10px] text-[var(--text-muted)] font-mono">
                  Nominal ini langsung menambah Penghasilan Bruto (Kotor) dan diperhitungkan pada Pajak TER resmi.
                </p>
              </div>

              {/* Catatan / Keterangan */}
              <div className="space-y-1">
                <label className="brutal-label text-xs">
                  Catatan / Keterangan (Opsional)
                </label>
                <input
                  type="text"
                  value={addOnNote}
                  onChange={(e) => setAddOnNote(e.target.value)}
                  placeholder="Catatan tambahan (mis: SK Direksi No. 12/2026)"
                  className="brutal-input text-xs"
                />
              </div>

              {/* Tombol Aksi Modal */}
              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsAddOnModalOpen(false)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="brutal-btn brutal-btn-sand text-xs font-bold"
                >
                  {editingAddOnId ? 'Simpan Perubahan' : 'Tambahkan ke Gaji'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
