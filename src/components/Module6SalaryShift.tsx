import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Utensils, 
  Check, 
  Plus, 
  Minus, 
  Zap, 
  ShieldCheck, 
  FileText, 
  Info, 
  ArrowRight, 
  CalendarCheck, 
  Sparkles, 
  RotateCcw, 
  Briefcase, 
  ChevronLeft, 
  ChevronRight,
  X,
  Settings,
  Archive,
  Trash2,
  Gift,
  ToggleLeft,
  ToggleRight,
  Edit3
} from 'lucide-react';
import { 
  ShiftDayLog, 
  SalaryBreakdown, 
  PTKPStatus, 
  Account, 
  Ledger, 
  AutomationRule, 
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
  getStoredShiftLogs, 
  saveStoredShiftLogs,
  getCustomShiftPattern,
  saveCustomShiftPattern,
  getAutoOTForPeriod,
  AGC_ANCHOR_DATE,
  AGC_GROUP_C_CYCLE,
  OVERTIME_BASE_RATE,
  BASIC_SALARY,
  HOUSING_ALLOWANCE,
  SHIFT_ALLOWANCE,
  HOUSING_DEDUCTION,
  DEFAULT_MEAL_RATE
} from '../utils/salaryCalculator';
import { 
  batchSaveSalaryAndAutomation,
  fetchSalaryHistories,
  deleteSalaryHistoryDoc,
  saveShiftScheduleToFirestore,
  fetchShiftScheduleFromFirestore,
  saveSalarySettingsToFirestore,
  fetchSalarySettingsFromFirestore,
  type CustomSalarySettings
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
const STORAGE_KEY_CUSTOM_SALARY = 'artha_custom_salary_settings_';

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

  // Grup Shift: Default Group C
  const [selectedGroup, setSelectedGroup] = useState<ShiftGroup>('C');

  // Konfigurasi Pola Shift & Tanggal Referensi Anchor (Default: Group C 28-Hari)
  const [customPattern, setCustomPattern] = useState<string[]>(() => getCustomShiftPattern().pattern);
  const [anchorDate, setAnchorDate] = useState<string>(() => getCustomShiftPattern().anchorDate);

  // Status Pengaturan Khusus Modul Gaji (PTKP, Harga Makan, Komponen Gaji)
  const [ptkpStatus, setPtkpStatus] = useState<PTKPStatus>('TK/0');
  const [mealRate, setMealRate] = useState<number>(DEFAULT_MEAL_RATE);
  const [customSalarySettings, setCustomSalarySettings] = useState<CustomSalarySettings>({
    ptkpStatus: 'TK/0',
    mealRate: DEFAULT_MEAL_RATE,
    basicSalary: BASIC_SALARY,
    housingAllowance: HOUSING_ALLOWANCE,
    shiftAllowance: SHIFT_ALLOWANCE,
    housingDeduction: HOUSING_DEDUCTION,
    medicalAllowanceBik: 1500000,
    isMedicalBikActive: false
  });
  const [isSalarySettingsModalOpen, setIsSalarySettingsModalOpen] = useState<boolean>(false);

  // Medical Allowance BIK (Gross) Toggle & Editable Nominal
  const [isMedicalBikEnabled, setIsMedicalBikEnabled] = useState<boolean>(false);
  const [medicalBikAmount, setMedicalBikAmount] = useState<number>(1500000);
  const [medicalBikInput, setMedicalBikInput] = useState<string>('1500000');

  const [targetAccountId, setTargetAccountId] = useState<string>(() => {
    const bankAcc = accounts.find(a => a.type === 'bank' && !a.isArchived);
    return bankAcc?.id || accounts[0]?.id || '';
  });

  // Unique Month Key untuk penyimpanan lokal per Buku Kas
  const monthKey = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;
  const periodStorageKey = `${monthKey}_grp_${selectedGroup}`;

  // Jam Lembur Otomatis untuk Periode Ini
  const autoOTHours = useMemo(() => {
    return getAutoOTForPeriod(currentMonthIndex, currentYear, selectedGroup);
  }, [currentMonthIndex, currentYear, selectedGroup]);

  // State Daftar Hari Shift Kalender
  const [shiftDays, setShiftDays] = useState<ShiftDayLog[]>(() => {
    if (activeLedger) {
      const stored = getStoredShiftLogs(activeLedger.id, periodStorageKey);
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

  // Muat Pengaturan Gaji dari Firestore / LocalStorage
  useEffect(() => {
    if (!activeLedger) return;
    const loadSettings = async () => {
      try {
        const remote = await fetchSalarySettingsFromFirestore(undefined, activeLedger.id);
        if (remote) {
          setCustomSalarySettings(remote);
          setPtkpStatus(remote.ptkpStatus);
          setMealRate(remote.mealRate);
          if (remote.medicalAllowanceBik !== undefined) {
            setMedicalBikAmount(remote.medicalAllowanceBik);
            setMedicalBikInput(String(remote.medicalAllowanceBik));
          }
          if (remote.isMedicalBikActive !== undefined) {
            setIsMedicalBikEnabled(remote.isMedicalBikActive);
          }
          return;
        }
      } catch (e) {
        console.warn('Gagal memuat pengaturan gaji Firestore:', e);
      }

      try {
        const raw = localStorage.getItem(`${STORAGE_KEY_CUSTOM_SALARY}${activeLedger.id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          setCustomSalarySettings(parsed);
          if (parsed.ptkpStatus) setPtkpStatus(parsed.ptkpStatus);
          if (parsed.mealRate) setMealRate(parsed.mealRate);
          if (parsed.medicalAllowanceBik !== undefined) {
            setMedicalBikAmount(parsed.medicalAllowanceBik);
            setMedicalBikInput(String(parsed.medicalAllowanceBik));
          }
          if (parsed.isMedicalBikActive !== undefined) {
            setIsMedicalBikEnabled(parsed.isMedicalBikActive);
          }
        }
      } catch (e) {
        console.error('Gagal membaca custom salary settings:', e);
      }
    };
    loadSettings();
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

  // Muat ulang shift logs (Firestore -> LocalStorage -> Generated)
  useEffect(() => {
    if (!activeLedger) return;

    let isMounted = true;
    const storageKey = `${monthKey}_grp_${selectedGroup}`;

    const loadSchedule = async () => {
      try {
        const remote = await fetchShiftScheduleFromFirestore(undefined, activeLedger.id, storageKey);
        if (remote && remote.length > 0 && isMounted) {
          setShiftDays(remote);
          saveStoredShiftLogs(activeLedger.id, storageKey, remote);
          return;
        }
      } catch (e) {
        console.warn('Gagal memuat shift schedule dari Firestore:', e);
      }

      const stored = getStoredShiftLogs(activeLedger.id, storageKey);
      if (stored && stored.length > 0 && isMounted) {
        setShiftDays(stored);
      } else if (isMounted) {
        const fresh = generateShiftCalendar(currentMonthIndex, currentYear, customPattern, anchorDate, selectedGroup);
        setShiftDays(fresh);
        saveStoredShiftLogs(activeLedger.id, storageKey, fresh);
      }
    };

    loadSchedule();
    return () => { isMounted = false; };
  }, [currentYear, currentMonthIndex, activeLedger?.id, selectedGroup, customPattern, anchorDate]);

  // Simpan perubahan shiftDays ke LocalStorage & Sync ke Firestore
  const handleUpdateShiftDays = (newDays: ShiftDayLog[]) => {
    setShiftDays(newDays);
    if (activeLedger) {
      const storageKey = `${monthKey}_grp_${selectedGroup}`;
      saveStoredShiftLogs(activeLedger.id, storageKey, newDays);
      saveShiftScheduleToFirestore(undefined, activeLedger.id, storageKey, newDays).catch(err => {
        console.warn('Gagal sinkron shift schedule ke Firestore:', err);
      });
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

  // Hitung Kalkulasi Lengkap dengan Auto OT & Add-Ons & Medical BIK
  const salary: SalaryBreakdown = useMemo(() => {
    return calculateSalaryBreakdown(
      shiftDays, 
      ptkpStatus, 
      mealRate, 
      currentYear, 
      currentMonthIndex,
      autoOTHours,
      addOns,
      isMedicalBikEnabled ? medicalBikAmount : 0
    );
  }, [shiftDays, ptkpStatus, mealRate, currentYear, currentMonthIndex, autoOTHours, addOns, isMedicalBikEnabled, medicalBikAmount]);

  // Hitung Nilai Pengali (Index) Lembur Tambahan Aktual
  const additionalOTIndex = useMemo(() => {
    return Math.max(0, Math.round((salary.totalOTIndex - (salary.autoOTIndex || 0)) * 10) / 10);
  }, [salary.totalOTIndex, salary.autoOTIndex]);

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

  // Buka Modal Edit Detail Hari (Pengguna mengeklik kartu tanggal)
  const openEditDayModal = (day: ShiftDayLog) => {
    setEditingDay(day);
    setEditDayOT(String(day.overtimeHours));
    setEditDayType(day.shiftType);
    setEditDayIsWork(day.isWorkDay);
    setEditDayMeals({ ...day.meals });
    setEditDayNote(day.note || '');
  };

  // Simpan Perubahan dari Modal Edit Hari
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
    showToast(`Data tanggal ${editingDay.dayNumber} ${editingDay.dayName} tersimpan!`, 'success');
  };

  // Reset Rotasi Group C ke Pola Kalender 2026
  const handleResetGroupCPattern = () => {
    setSelectedGroup('C');
    setCustomPattern(AGC_GROUP_C_CYCLE);
    setAnchorDate(AGC_ANCHOR_DATE);
    saveCustomShiftPattern(AGC_GROUP_C_CYCLE, AGC_ANCHOR_DATE);
    const fresh = generateShiftCalendar(currentMonthIndex, currentYear, AGC_GROUP_C_CYCLE, AGC_ANCHOR_DATE, 'C');
    handleUpdateShiftDays(fresh);
    showToast('Jadwal Group C berhasil direset sesuai Kalender Shift 2026!', 'info');
  };

  // Simpan Pengaturan Khusus Gaji & Shift
  const handleSaveSalarySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLedger) return;

    try {
      const payload: CustomSalarySettings = {
        ptkpStatus,
        mealRate,
        basicSalary: customSalarySettings.basicSalary || BASIC_SALARY,
        housingAllowance: customSalarySettings.housingAllowance || HOUSING_ALLOWANCE,
        shiftAllowance: customSalarySettings.shiftAllowance || SHIFT_ALLOWANCE,
        housingDeduction: customSalarySettings.housingDeduction || HOUSING_DEDUCTION,
        medicalAllowanceBik: medicalBikAmount,
        isMedicalBikActive: isMedicalBikEnabled
      };
      setCustomSalarySettings(payload);
      localStorage.setItem(`${STORAGE_KEY_CUSTOM_SALARY}${activeLedger.id}`, JSON.stringify(payload));
      await saveSalarySettingsToFirestore(undefined, activeLedger.id, payload);
      setIsSalarySettingsModalOpen(false);
      showToast('Pengaturan Gaji & Shift berhasil disimpan!', 'success');
    } catch (err) {
      console.error('Gagal menyimpan pengaturan gaji:', err);
      showToast('Gagal menyimpan pengaturan ke database.', 'error');
    }
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

  // Batch Write ke Firestore (Automations & Salary History)
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
      const bikNote = isMedicalBikEnabled ? ` • Med BIK: +${formatRupiah(medicalBikAmount)}` : '';
      const noteDesc = `Estimasi Gaji Group ${selectedGroup} (${periodLabel}) • Auto OT: ${salary.autoOTHours}j • Total OT: ${formatRupiah(salary.totalOTAmount)} (${salary.totalOTHours}j | Indeks: ${salary.totalOTIndex}x)${addOnsNote}${bikNote} • Pajak TER (${salary.terCategory} - ${salary.terRate}%): ${formatRupiah(salary.terTaxAmount)} • Rek: ${targetAcc.name}`;

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

  // Filter hari untuk kalender
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
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-16 right-4 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className={`brutal-card p-3.5 px-4 text-xs font-mono font-bold flex items-center gap-2.5 shadow-[var(--shadow-md)] ${
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
      {/* 1. TOP HEADER & KONTROL NAVIGASI (KANAN-SEJAJAR, SESUAI GAMBAR 2 & 3)  */}
      {/* ===================================================================== */}
      <section className="brutal-card p-4 sm:p-5 bg-[var(--bg-surface)] border-2 border-[var(--border-color)] shadow-[var(--shadow-md)] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        
        {/* Info Judul & Periode */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Briefcase className="w-5 h-5 text-[var(--accent-sand)]" />
            <h2 className="font-heading font-extrabold text-lg sm:text-xl text-[var(--text-primary)]">
              Prediksi Gaji & Kalender Shift (Group {selectedGroup})
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--accent-sand-dark)] text-[var(--accent-sand-light)] border border-[var(--accent-sand)]">
              Kalender Shift 2026
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-mono flex items-center gap-2 flex-wrap">
            <span>Buku Kas: <strong>{activeLedger?.name || 'Utama'}</strong></span>
            <span>•</span>
            <span className="text-[var(--accent-sand-light)]">Periode Cut-Off: <strong>{periodLabel}</strong></span>
          </p>
        </div>

        {/* Kontrol Grup Shift & Navigasi Periode (Atas-Bawah, Rata Kanan) */}
        <div className="flex flex-col items-start sm:items-end gap-2 sm:gap-2.5 w-full lg:w-auto">
          
          {/* Baris Atas: Segmented Group Selector */}
          <div className="inline-flex items-center bg-[var(--bg-elevated)] p-1 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] shadow-[var(--shadow-sm)] text-xs font-mono font-bold">
            <span className="px-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider hidden sm:inline">
              Grup
            </span>
            {(['A', 'B', 'C', 'D'] as ShiftGroup[]).map(grp => (
              <button
                key={grp}
                type="button"
                onClick={() => setSelectedGroup(grp)}
                className={`px-2.5 py-1 rounded transition-all ${
                  selectedGroup === grp
                    ? 'bg-[var(--accent-sand)] text-black font-extrabold shadow-[1px_1px_0px_#000]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)]'
                }`}
                title={`Pilih Grup ${grp}`}
              >
                Grup {grp}
              </button>
            ))}
          </div>

          {/* Baris Bawah: Navigasi Periode, Reset & Pengaturan */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Unified Period Navigation */}
            <div className="inline-flex items-center bg-[var(--bg-elevated)] p-1 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] shadow-[var(--shadow-sm)] text-xs font-mono font-bold">
              <button
                type="button"
                onClick={handlePrevPeriod}
                className="p-1 px-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] rounded transition-colors"
                title="Periode Cut-Off Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleResetToCurrentPeriod}
                className="px-3 py-1 bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded transition-colors hover:bg-[var(--bg-muted)]"
                title="Kembali ke Periode Cut-Off Bulan Ini"
              >
                Bulan Ini
              </button>

              <button
                type="button"
                onClick={handleNextPeriod}
                className="p-1 px-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] rounded transition-colors"
                title="Periode Cut-Off Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Reset Jadwal */}
            <button
              type="button"
              onClick={handleResetGroupCPattern}
              className="p-1.5 sm:p-2 bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)] transition-colors"
              title="Reset ke Jadwal Standar Kalender Shift 2026"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Tombol Pengaturan Khusus Modul Gaji & Shift */}
            <button
              type="button"
              onClick={() => setIsSalarySettingsModalOpen(true)}
              className="p-1.5 px-3 bg-[var(--accent-sand)] hover:opacity-90 text-black font-bold border-2 border-black rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)] flex items-center gap-1.5 text-xs font-mono transition-transform active:translate-y-0.5"
              title="Buka Pengaturan Tarif Makan, PTKP & Gaji"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Pengaturan</span>
            </button>
          </div>

        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. DUA GRID UTAMA: KALENDER SHIFT (KIRI) & SLIP GAJI (KANAN)          */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* ------------------------------------------------------------------- */}
        {/* KOLOM KIRI (7 SPAN): KALENDER SHIFT & READ-ONLY POP-UP EDIT HARI     */}
        {/* ------------------------------------------------------------------- */}
        <div className="lg:col-span-7 space-y-4">
          
          <div className="brutal-card p-4 sm:p-5 bg-[var(--bg-surface)] border-2 border-[var(--border-color)] shadow-[var(--shadow-md)] space-y-4">
            
            {/* Header Kalender & Quick Filter */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b-2 border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="font-heading font-bold text-base text-[var(--text-primary)] flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-[var(--accent-blue)]" />
                  <span>Jadwal Shift & Ceklis Makan</span>
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)] font-mono">
                  Klik tanggal untuk mengisi lembur ekstra, ceklis makan, atau ubah shift.
                </p>
              </div>

              {/* Filter Tabs Hari */}
              <div className="flex items-center gap-1 text-[10px] font-mono flex-wrap">
                <button
                  type="button"
                  onClick={() => setCalendarFilter('all')}
                  className={`px-2 py-1 rounded-[var(--radius-sm)] border font-bold ${
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
                  className={`px-2 py-1 rounded-[var(--radius-sm)] border font-bold ${
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
                  className={`px-2 py-1 rounded-[var(--radius-sm)] border font-bold ${
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
                    className={`px-2 py-1 rounded-[var(--radius-sm)] border font-bold ${
                      calendarFilter === 'holiday'
                        ? 'bg-[var(--accent-terracotta)] text-black border-black shadow-[1px_1px_0px_#000]'
                        : 'bg-[var(--bg-elevated)] text-[var(--accent-terracotta-light)] border-[var(--border-subtle)]'
                    }`}
                  >
                    Libur Nas ({holidaysCount})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCalendarFilter('overtime')}
                  className={`px-2 py-1 rounded-[var(--radius-sm)] border font-bold ${
                    calendarFilter === 'overtime'
                      ? 'bg-[var(--accent-sand)] text-black border-black shadow-[1px_1px_0px_#000]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                  }`}
                >
                  Lembur ({otDaysCount})
                </button>

                <button
                  type="button"
                  onClick={handleClearAllMeals}
                  className="px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--accent-terracotta)] bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] font-bold ml-1 hover:opacity-90 transition-opacity"
                  title="Kosongkan semua ceklis makan periode ini (0x makan)"
                >
                  0x Makan
                </button>
              </div>
            </div>

            {/* Scorecards Kalender (SESUAI GAMBAR 2 & 3) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono text-xs">
              <div className="p-2.5 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-0.5">
                <span className="text-[10px] text-[var(--text-muted)] block">Kerja / Off</span>
                <span className="font-bold text-[var(--text-primary)] text-xs">
                  <span className="text-[var(--accent-sage-light)]">{workDaysCount}</span> / <span className="text-[var(--accent-terracotta-light)]">{offDaysCount}</span>
                </span>
              </div>
              <div className="p-2.5 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-0.5">
                <span className="text-[10px] text-[var(--text-muted)] block">⚡ Auto OT Terjadwal</span>
                <span className="font-bold text-[var(--accent-sand-light)] text-xs">
                  {autoOTHours} Jam
                </span>
              </div>
              <div className="p-2.5 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-0.5">
                <span className="text-[10px] text-[var(--text-muted)] block">Lembur Aktual Ekstra</span>
                <span className="font-bold text-[var(--text-primary)] text-xs">
                  {salary.actualAdditionalOTHours} Jam <span className="text-[10px] text-[var(--accent-sand-light)] font-normal">({additionalOTIndex}x Eqiv)</span>
                </span>
              </div>
              <div className="p-2.5 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-0.5">
                <span className="text-[10px] text-[var(--text-muted)] block">Ceklis Makan (Manual)</span>
                <span className="font-bold text-[var(--accent-blue-light)] text-xs">
                  {salary.totalMealCount}x Makan
                </span>
              </div>
            </div>

            {/* Grid Kalender Kotak Hari (Read-Only di Muka, Klik untuk Pop-Up Edit) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[660px] overflow-y-auto pr-1">
              {filteredDays.map((day) => {
                const dayMealCount = (day.meals.breakfast ? 1 : 0) + (day.meals.lunch ? 1 : 0) + (day.meals.dinner ? 1 : 0);
                const isHoliday = day.isPublicHoliday;
                const otIndex = day.overtimeIndex || calculateOvertimeIndex(day.overtimeHours, day.dayType);
                const otAmount = day.overtimeAmount || calculateDailyOvertimeAmount(day.overtimeHours, day.dayType, OVERTIME_BASE_RATE).amount;

                // Shift Info
                const isShiftI = day.shiftCode === 'I' || day.shiftType.includes('Shift 1') || day.shiftType.includes('Malam');
                const isShiftII = day.shiftCode === 'II' || day.shiftType.includes('Shift 2') || day.shiftType.includes('Pagi');
                const isShiftIII = day.shiftCode === 'III' || day.shiftType.includes('Shift 3') || day.shiftType.includes('Sore');

                // Styling Kotak Hari Adaptif (Bekerja sempurna di Light & Dark Mode)
                let cardStyle = 'bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] text-[var(--text-primary)]';
                if (isHoliday) {
                  cardStyle = 'bg-[var(--accent-terracotta-dark)] border-2 border-[var(--accent-terracotta)] text-[var(--accent-terracotta-light)]';
                } else if (!day.isWorkDay) {
                  cardStyle = day.overtimeHours > 0
                    ? 'bg-[var(--bg-surface)] border-2 border-[var(--accent-sand)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-surface)] border-2 border-[var(--border-subtle)] text-[var(--text-secondary)] opacity-95';
                } else if (day.overtimeHours > 0) {
                  cardStyle = 'bg-[var(--bg-elevated)] border-2 border-[var(--accent-sand)] text-[var(--text-primary)]';
                }

                return (
                  <div
                    key={day.date}
                    onClick={() => openEditDayModal(day)}
                    className={`p-3 rounded-[var(--radius-sm)] transition-all cursor-pointer select-none flex flex-col justify-between space-y-2 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] shadow-[var(--shadow-sm)] ${cardStyle}`}
                    title="Klik tanggal untuk mengisi lembur ekstra, ceklis makan, atau ubah shift"
                  >
                    {/* Header Kotak Hari */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="font-heading font-extrabold flex items-center gap-1.5 text-[var(--text-primary)]">
                          <span className="font-mono text-base">{day.dayNumber}</span>
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">{day.dayName}</span>
                        </div>

                        {/* Shift Badge (Sesuai Referensi Gambar 2 & 3) */}
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-[var(--radius-sm)] border shadow-[1px_1px_0px_#000] ${
                          isHoliday
                            ? 'bg-[var(--accent-terracotta)] text-black border-black font-extrabold'
                            : !day.isWorkDay
                            ? 'bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] border-[var(--accent-terracotta)]'
                            : isShiftI
                            ? 'bg-[var(--accent-lavender-dark)] text-[var(--accent-lavender-light)] border-[var(--accent-lavender)]'
                            : isShiftII
                            ? 'bg-[var(--accent-blue-dark)] text-[var(--accent-blue-light)] border-[var(--accent-blue)]'
                            : 'bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border-[var(--accent-sage)]'
                        }`}>
                          {isHoliday 
                            ? 'LIBUR NAS' 
                            : !day.isWorkDay 
                            ? 'OFF' 
                            : isShiftI ? 'I Malam' : isShiftII ? 'II Pagi' : 'III Sore'}
                        </span>
                      </div>

                      {/* Libur Nasional Name */}
                      {isHoliday && day.holidayName && (
                        <div className="text-[9px] font-mono text-[var(--accent-terracotta-light)] font-bold truncate flex items-center gap-1">
                          <span>🎉</span>
                          <span className="truncate">{day.holidayName}</span>
                        </div>
                      )}

                      {/* Jam Masuk Shift */}
                      {day.isWorkDay && (
                        <div className="text-[9px] font-mono text-[var(--text-muted)] flex items-center justify-between">
                          <span>{day.shiftHours || (isShiftI ? '23:00-07:00' : isShiftII ? '07:00-15:00' : '15:00-23:00')}</span>
                        </div>
                      )}
                    </div>

                    {/* Auto OT Badge Marker */}
                    {day.hasAutoOT && (
                      <div className="px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--accent-sand-dark)] text-[var(--accent-sand-light)] border border-[var(--accent-sand)] text-[9px] font-mono font-bold flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5 text-[var(--accent-sand)] fill-[var(--accent-sand)]" />
                        <span>Auto OT (+{day.autoOTHours || 8.25}j)</span>
                      </div>
                    )}

                    {/* Lembur Tambahan Aktual Info */}
                    {day.overtimeHours > 0 ? (
                      <div className="bg-[var(--bg-surface)] p-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] text-[10px] font-mono space-y-0.5">
                        <div className="flex items-center justify-between text-[var(--accent-sand-light)] font-bold">
                          <span>⏱️ +{day.overtimeHours}j</span>
                          <span>{otIndex}x Eqiv</span>
                        </div>
                        <div className="text-right text-[9px] font-bold text-[var(--accent-sage-light)]">
                          +{formatRupiah(otAmount)}
                        </div>
                      </div>
                    ) : null}

                    {/* Footer: Indikator Ceklis Makan */}
                    <div className="pt-1 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] font-mono">
                      <span className="text-[var(--text-muted)] flex items-center gap-1">
                        <Utensils className="w-3 h-3" />
                        <span>{dayMealCount > 0 ? `${dayMealCount}x Makan` : '0x'}</span>
                      </span>
                      {dayMealCount > 0 && (
                        <div className="flex gap-0.5">
                          {day.meals.breakfast && <span className="w-3.5 h-3.5 rounded-full bg-[var(--accent-blue-dark)] text-[var(--accent-blue-light)] border border-[var(--accent-blue)] text-[8px] flex items-center justify-center font-bold">P</span>}
                          {day.meals.lunch && <span className="w-3.5 h-3.5 rounded-full bg-[var(--accent-sand-dark)] text-[var(--accent-sand-light)] border border-[var(--accent-sand)] text-[8px] flex items-center justify-center font-bold">S</span>}
                          {day.meals.dinner && <span className="w-3.5 h-3.5 rounded-full bg-[var(--accent-lavender-dark)] text-[var(--accent-lavender-light)] border border-[var(--accent-lavender)] text-[8px] flex items-center justify-center font-bold">M</span>}
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>

            {/* Catatan Panduan Sistem Shift */}
            <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs font-mono space-y-1.5 text-[var(--text-secondary)]">
              <div className="font-bold text-[var(--text-primary)] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                  <span>Sistem Kerja Shift Group {selectedGroup} (4 Group 3 Shift):</span>
                </span>
                <span className="text-[10px] text-[var(--accent-sand-light)] font-bold">
                  Auto OT Periode Ini: {autoOTHours} Jam
                </span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[10px] leading-relaxed">
                <li>
                  <strong>Shift I (Malam):</strong> 23:00 – 07:00 • <strong>Shift II (Pagi):</strong> 07:00 – 15:00 • <strong>Shift III (Sore):</strong> 15:00 – 23:00.
                </li>
                <li>
                  <strong>Auto OT:</strong> Dihitung otomatis secara matematis berdasarkan siklus kerja 28-hari resmi ({autoOTHours} Jam). Ditandai dengan badge <strong>⚡ Auto OT</strong> pada kartu tanggal.
                </li>
              </ul>
            </div>

          </div>

        </div>

        {/* ------------------------------------------------------------------- */}
        {/* KOLOM KANAN (5 SPAN): SLIP GAJI & ACTION (SESUAI GAMBAR 2 & 4)       */}
        {/* ------------------------------------------------------------------- */}
        <div className="lg:col-span-5 space-y-4">
          
          <div className="brutal-card p-5 sm:p-6 bg-[var(--bg-surface)] border-2 border-[var(--border-color)] shadow-[var(--shadow-md)] space-y-5">
            
            {/* Header Slip Gaji */}
            <div className="border-b-2 border-[var(--border-subtle)] pb-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">
                  Slip Gaji Resmi Estimasi
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--accent-blue-dark)] text-[var(--accent-blue-light)] border border-[var(--accent-blue)]">
                  Group {selectedGroup}
                </span>
              </div>
              <h3 className="font-heading font-extrabold text-lg sm:text-xl text-[var(--text-primary)]">
                Rincian Penghasilan Karyawan
              </h3>
              <p className="text-[11px] font-mono text-[var(--text-secondary)]">
                Periode: <strong>{periodLabel}</strong>
              </p>
            </div>

            {/* 1. BAGIAN PENDAPATAN & TUNJANGAN */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-heading font-bold text-[var(--accent-sage-light)] border-b-2 border-[var(--border-subtle)] pb-1">
                <span>1. PENDAPATAN & TUNJANGAN</span>
                <span>NOMINAL</span>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Gaji Pokok (Basic Salary)</span>
                  <span className="text-[var(--text-primary)] font-bold">{formatRupiah(salary.basicSalary)}</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Tunjangan Perumahan (Housing)</span>
                  <span className="text-[var(--text-primary)] font-bold">{formatRupiah(salary.housingAllowance)}</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Tunjangan Shift (Group {selectedGroup})</span>
                  <span className="text-[var(--text-primary)] font-bold">{formatRupiah(salary.shiftAllowance)}</span>
                </div>

                {/* Medical Allowance BIK (Gross) dengan Teks di Atas dan Input di Bawah saat Aktif */}
                <div className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] space-y-2 transition-colors">
                  {/* Baris Atas: Toggle & Label Lengkap */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = !isMedicalBikEnabled;
                          setIsMedicalBikEnabled(next);
                          if (next && medicalBikAmount <= 0) {
                            setMedicalBikAmount(1500000);
                            setMedicalBikInput('1500000');
                          }
                        }}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0 mt-0.5"
                        title={isMedicalBikEnabled ? 'Nonaktifkan Medical BIK' : 'Aktifkan Medical BIK'}
                      >
                        {isMedicalBikEnabled ? (
                          <ToggleRight className="w-5 h-5 text-[var(--accent-sage-light)]" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-[var(--text-muted)]" />
                        )}
                      </button>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-bold block text-xs ${isMedicalBikEnabled ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                            Medical Allowance BIK (Gross)
                          </span>
                          {isMedicalBikEnabled && (
                            <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border border-[var(--accent-sage)]">
                              Aktif
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)] block leading-snug">
                          *Benefit in Kind: menambah PPh 21 TER, tidak masuk net
                        </span>
                      </div>
                    </div>

                    {!isMedicalBikEnabled && (
                      <span className="font-bold font-mono text-xs text-[var(--text-muted)] shrink-0 pt-0.5">
                        Rp 0
                      </span>
                    )}
                  </div>

                  {/* Baris Bawah: Input Nominal Fleksibel saat Aktif (Teks di Atas, Input di Bawah) */}
                  {isMedicalBikEnabled && (
                    <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-[var(--text-secondary)]">Nominal BIK:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-bold text-[var(--accent-sage-light)]">Rp</span>
                        <input
                          type="text"
                          value={medicalBikInput}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setMedicalBikInput(raw);
                            const parsed = parseFloat(raw.replace(/[^0-9]/g, '')) || 0;
                            setMedicalBikAmount(parsed);
                          }}
                          onBlur={() => {
                            const { success, result, displayValue } = evaluateMathExpression(medicalBikInput);
                            if (success && result >= 0) {
                              setMedicalBikInput(displayValue);
                              setMedicalBikAmount(result);
                            }
                          }}
                          placeholder="1500000"
                          className="brutal-input text-xs py-1 px-2.5 font-mono text-right w-40 sm:w-48 bg-[var(--bg-surface)] border-2 border-[var(--border-color)] text-[var(--text-primary)] font-bold rounded-[var(--radius-sm)] shadow-[1px_1px_0px_#000]"
                          title="Ubah nominal Medical Allowance BIK (Gross)"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-between font-bold text-[var(--text-primary)]">
                  <span>Total Tunjangan Tetap</span>
                  <span className="text-[var(--accent-sage-light)] font-bold">{formatRupiah(salary.totalAllowance)}</span>
                </div>

                {/* Total Upah Lembur */}
                <div className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2 text-[11px]">
                  <div className="flex items-center justify-between font-bold text-[var(--accent-sand-light)] border-b border-[var(--border-subtle)] pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                      <span>Total Upah Lembur ({salary.totalOTHours}j • {salary.totalOTIndex}x)</span>
                    </span>
                    <span className="text-sm">+{formatRupiah(salary.totalOTAmount)}</span>
                  </div>

                  <div className="space-y-1 text-[10px]">
                    <div className="flex items-center justify-between text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1 text-[var(--accent-sand-light)] font-bold">
                        <span>⚡ Auto OT Terjadwal:</span>
                      </span>
                      <span className="font-bold text-[var(--text-primary)]">
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

                {/* Komponen Tambahan (Bonus / THR) Manis & Rapi */}
                <div className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--accent-sand)]/60 rounded-[var(--radius-sm)] space-y-2 shadow-[var(--shadow-sm)]">
                  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
                    <span className="font-heading font-bold text-xs text-[var(--accent-sand-light)] flex items-center gap-1.5">
                      <Gift className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                      <span>KOMPONEN TAMBAHAN (BONUS / THR)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenAddOnModal()}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-mono font-bold bg-[var(--accent-sand)] text-black border border-black rounded-[var(--radius-sm)] shadow-[1.5px_1.5px_0px_#000] hover:opacity-90 active:translate-x-0.5 active:translate-y-0.5 transition-all"
                      title="Tambah komponen penambah gaji"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Tambah</span>
                    </button>
                  </div>

                  {/* Quick Predefined Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <button
                      type="button"
                      onClick={() => handleQuickAddPredefined('THR Keagamaan (1x Gaji Pokok)', 9345000, 'Tunjangan Hari Raya')}
                      className="px-2 py-0.5 text-[9px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-[var(--accent-sage-light)] border border-[var(--accent-sage)] transition-colors"
                    >
                      + THR (1x Basic)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddPredefined('Bonus Kinerja / Tahunan', 5000000, 'Bonus performance')}
                      className="px-2 py-0.5 text-[9px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-[var(--accent-sand-light)] border border-[var(--accent-sand)] transition-colors"
                    >
                      + Bonus Kinerja
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddPredefined('Insentif Shift / Kehadiran', 750000, 'Insentif ekstra')}
                      className="px-2 py-0.5 text-[9px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-[var(--accent-blue-light)] border border-[var(--accent-blue)] transition-colors"
                    >
                      + Insentif
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAddPredefined('Rapelan Kenaikan Gaji', 1000000, 'Rapelan')}
                      className="px-2 py-0.5 text-[9px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-[var(--accent-lavender-light)] border border-[var(--accent-lavender)] transition-colors"
                    >
                      + Rapelan
                    </button>
                  </div>

                  {/* List Add-Ons */}
                  {addOns.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      {addOns.map((item) => (
                        <div
                          key={item.id}
                          className={`p-2 rounded-[var(--radius-sm)] border flex items-center justify-between gap-2 text-[11px] font-mono transition-colors ${
                            item.isEnabled
                              ? 'bg-[var(--bg-surface)] border-[var(--border-color)]'
                              : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => handleToggleAddOn(item.id)}
                              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0"
                            >
                              {item.isEnabled ? (
                                <ToggleRight className="w-4 h-4 text-[var(--accent-sage-light)]" />
                              ) : (
                                <ToggleLeft className="w-4 h-4 text-[var(--text-muted)]" />
                              )}
                            </button>
                            <div className="truncate">
                              <span className={`font-bold block truncate ${item.isEnabled ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] line-through'}`}>
                                {item.name}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`font-bold font-mono ${item.isEnabled ? 'text-[var(--accent-sage-light)]' : 'text-[var(--text-muted)]'}`}>
                              +{formatRupiah(item.amount)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenAddOnModal(item)}
                              className="p-1 hover:bg-[var(--bg-muted)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                              title="Edit"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAddOn(item.id)}
                              className="p-1 hover:bg-[var(--bg-muted)] rounded text-[var(--accent-terracotta-light)]"
                              title="Hapus"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="pt-1 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-bold">
                        <span className="text-[var(--text-secondary)]">Subtotal Tambahan:</span>
                        <span className="text-[var(--accent-sand-light)]">+{formatRupiah(salary.totalAddOns)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-[var(--bg-surface)] rounded-[var(--radius-sm)] border border-dashed border-[var(--border-subtle)] text-center text-[10px] text-[var(--text-muted)]">
                      Belum ada tambahan gaji. Klik chip di atas atau tombol <strong>+ Tambah</strong> untuk memasukkan THR, Bonus, atau Insentif.
                    </div>
                  )}
                </div>

                {/* Gross Income */}
                <div className="pt-2 border-t-2 border-[var(--border-subtle)] flex items-center justify-between text-sm font-bold text-[var(--text-primary)]">
                  <span className="font-heading">PENDAPATAN KOTOR (GROSS)</span>
                  <span className="text-[var(--accent-sage-light)] font-mono text-base">{formatRupiah(salary.grossIncome)}</span>
                </div>
              </div>
            </div>

            {/* 2. BAGIAN POTONGAN & PAJAK TER */}
            <div className="space-y-2.5 pt-2 border-t-2 border-[var(--border-subtle)]">
              <div className="flex items-center justify-between text-xs font-heading font-bold text-[var(--accent-terracotta-light)] border-b-2 border-[var(--border-subtle)] pb-1">
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

                {/* Pajak TER */}
                <div className="p-2.5 bg-[var(--accent-terracotta-dark)] border border-[var(--accent-terracotta)]/50 rounded-[var(--radius-sm)] space-y-1 text-[11px]">
                  <div className="flex items-center justify-between font-bold text-[var(--accent-terracotta-light)]">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-terracotta)]" />
                      Pajak PPh 21 TER Otomatis ({salary.terRate}%)
                    </span>
                    <span>-{formatRupiah(salary.terTaxAmount)}</span>
                  </div>
                  <div className="text-[10px] text-[var(--accent-terracotta-light)]/80 flex items-center justify-between">
                    <span>Status PTKP: {salary.ptkpStatus} (Kategori {salary.terCategory})</span>
                    <span className="text-[var(--accent-sand-light)]">DJP PP 58/2023</span>
                  </div>
                </div>

                <div className="pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-between font-bold text-[var(--text-primary)]">
                  <span>Total Potongan</span>
                  <span className="text-[var(--accent-terracotta-light)] font-bold">-{formatRupiah(salary.totalDeductions)}</span>
                </div>
              </div>
            </div>

            {/* 3. TAKE HOME PAY (KOLOM LEBIH KOMPAK & PROPORSIONAL DENGAN WARNA TETAP) */}
            <div className="brutal-card p-3 sm:p-3.5 bg-[var(--bg-surface)] border-2 border-[var(--border-color)] shadow-[var(--shadow-sm)] text-center rounded-[var(--radius-sm)] space-y-1">
              <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-[var(--accent-sage-light)] font-bold block">
                ESTIMASI PENDAPATAN BERSIH (TAKE HOME PAY)
              </span>
              <div className="text-xl sm:text-2xl font-heading font-extrabold text-[var(--accent-sage)] font-mono tracking-tight">
                {formatRupiah(salary.netSalary)}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] font-mono leading-tight">
                Penerimaan Kotor ({formatRupiah(salary.grossIncome)}) dikurangi Total Potongan ({formatRupiah(salary.totalDeductions)})
              </p>
            </div>

            {/* 4. JADWAL GAJIAN & AKSI */}
            <div className="p-3.5 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2.5 text-xs font-mono">
              <div className="flex items-center justify-between text-xs font-mono text-[var(--text-primary)]">
                <span className="flex items-center gap-1.5 font-bold">
                  <CalendarCheck className="w-4 h-4 text-[var(--accent-sand)]" />
                  <span>Jadwal Tanggal Gajian:</span>
                </span>
                <span className="font-bold text-sm text-[var(--text-primary)]">
                  {salary.paydayDate}
                </span>
              </div>

              {salary.isPaydayAdjusted && (
                <div className="p-2 bg-[var(--accent-sand-dark)] border border-[var(--accent-sand)]/60 rounded-[var(--radius-sm)] text-[10px] text-[var(--accent-sand-light)] space-y-0.5">
                  <span className="font-bold block">⚡ Penyesuaian Akhir Pekan Aktif:</span>
                  <p>
                    Tanggal 28 jatuh pada akhir pekan ({salary.paydayOriginalDate}). Sesuai kebijakan payroll perusahaan, transfer gajian <strong>dimajukan ke hari Jumat ({salary.paydayDate})</strong>.
                  </p>
                </div>
              )}

              {/* Rekening Bank Tujuan */}
              <div className="pt-1 text-left space-y-1">
                <label className="text-[10px] text-[var(--text-muted)] block">Rekening Bank Tujuan Transfer Gaji:</label>
                <select
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                  className="brutal-select text-xs py-1.5 w-full bg-[var(--bg-surface)] border-2 border-[var(--border-color)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                >
                  {accounts.filter(a => !a.isArchived).map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.type.toUpperCase()}) - Saldo: {formatRupiah(acc.balance)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tombol Simpan & Otomatiskan Gaji */}
              <button
                type="button"
                onClick={handleSaveSalary}
                disabled={isSubmittingAuto || salary.netSalary <= 0}
                className="w-full mt-2 brutal-btn brutal-btn-sand py-3 text-xs sm:text-sm flex items-center justify-center gap-2 font-bold shadow-[4px_4px_0px_#000] disabled:opacity-50"
              >
                <Zap className="w-4 h-4 text-black fill-black" />
                <span>{isSubmittingAuto ? 'Menyimpan ke Firestore...' : 'Simpan & Otomatiskan Gaji'}</span>
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* ===================================================================== */}
      {/* 3. ARSIP RIWAYAT GAJI BULANAN (SALARY HISTORY RECORD)                 */}
      {/* ===================================================================== */}
      <section className="brutal-card p-5 sm:p-6 bg-[var(--bg-surface)] border-2 border-[var(--border-color)] shadow-[var(--shadow-md)] space-y-4">
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b-2 border-[var(--border-subtle)] pb-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Archive className="w-5 h-5 text-[var(--accent-sand)]" />
              <h3 className="font-heading font-bold text-base sm:text-lg text-[var(--text-primary)]">
                Arsip Riwayat Gaji
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border border-[var(--accent-sage)]">
                {salaryHistories.length} Periode Tersimpan
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] font-mono">
              Rekam jejak historis detail gaji bulanan yang tersimpan di Firestore & terintegrasi dengan otomatisasi.
            </p>
          </div>

          <button
            type="button"
            onClick={loadSalaryHistories}
            className="brutal-btn brutal-btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            title="Muat Ulang Riwayat Gaji"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            <span>Segarkan Arsip</span>
          </button>
        </div>

        {salaryHistories.length === 0 ? (
          <div className="p-8 text-center bg-[var(--bg-elevated)] border-2 border-dashed border-[var(--border-subtle)] rounded-[var(--radius-md)] space-y-2 font-mono">
            <FileText className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-60" />
            <h4 className="text-sm font-bold text-[var(--text-primary)]">Belum Ada Riwayat Gaji Tersimpan</h4>
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
                  <tr className="border-b-2 border-[var(--border-color)] text-[var(--text-muted)] text-[10px] uppercase font-mono">
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
                        <div className="font-heading font-bold text-sm text-[var(--text-primary)]">
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
                            className="brutal-btn brutal-btn-ghost text-[10px] py-1 px-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] shadow-[1px_1px_0px_#000]"
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
                  className="p-3.5 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)] space-y-2.5 font-mono"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">Periode</span>
                      <span className="font-heading font-bold text-sm text-[var(--text-primary)]">{formatPeriodLabel(hist.period)}</span>
                    </div>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      {hist.period}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-1">
                    <span className="text-[10px] text-[var(--text-muted)] block">Pendapatan Bersih (Net)</span>
                    <div className="text-lg font-heading font-extrabold text-[var(--accent-sage)]">
                      {formatRupiah(hist.netSalary)}
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] block">
                      Kotor: {formatRupiah(hist.grossSalary)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-[var(--accent-sand-light)] font-bold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                      {hist.totalOtHours}j Lembur
                    </span>
                    <span className="text-[var(--accent-blue-light)] font-bold flex items-center gap-1">
                      <Utensils className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                      {hist.totalMeals}x Makan
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-[10px]">
                    <span className="text-[var(--text-muted)]">{formatHistoryTimestamp(hist.createdAt)}</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSelectHistoryPeriod(hist.period)}
                        className="px-2 py-0.5 bg-[var(--bg-surface)] text-[var(--text-primary)] rounded font-bold border border-[var(--border-subtle)]"
                      >
                        Buka
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistory(hist.id, hist.period, e)}
                        className="px-2 py-0.5 text-[var(--accent-terracotta-light)] font-bold"
                      >
                        Hapus
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
      {/* 4. MODAL POP-UP EDIT HARI (INPUT LEMBUR & CEKLIS MAKAN)                */}
      {/* ===================================================================== */}
      {editingDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="brutal-card p-5 sm:p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4 border-2 border-[var(--border-color)] shadow-[var(--shadow-xl)]">
            
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div className="space-y-0.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent-sand-light)] font-bold">
                  Edit Data Tanggal {editingDay.dayNumber} {editingDay.dayName}
                </span>
                <h3 className="font-heading font-extrabold text-base text-[var(--text-primary)]">
                  {editingDay.date}
                </h3>
              </div>
              <button 
                onClick={() => setEditingDay(null)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDayModal} className="space-y-4">
              
              {/* Pilihan Shift Hari Ini */}
              <div className="space-y-1.5">
                <label className="brutal-label text-xs">Jadwal Shift</label>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  {[
                    { label: 'Shift 1 (Malam)', code: 'I', desc: '23:00 - 07:00' },
                    { label: 'Shift 2 (Pagi)', code: 'II', desc: '07:00 - 15:00' },
                    { label: 'Shift 3 (Sore)', code: 'III', desc: '15:00 - 23:00' },
                    { label: 'Off (Libur)', code: 'OFF', desc: 'Hari Bebas' }
                  ].map(sh => (
                    <button
                      key={sh.label}
                      type="button"
                      onClick={() => {
                        setEditDayType(sh.label);
                        setEditDayIsWork(sh.code !== 'OFF');
                      }}
                      className={`p-2 rounded-[var(--radius-sm)] border-2 text-left transition-all ${
                        editDayType === sh.label
                          ? 'bg-[var(--accent-sand-dark)] text-[var(--accent-sand-light)] border-[var(--accent-sand)] font-bold shadow-[2px_2px_0px_#000]'
                          : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <div className="font-bold">{sh.label}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">{sh.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Jam Lembur Aktual Ekstra */}
              <div className="space-y-1.5">
                <label className="brutal-label text-xs flex items-center justify-between">
                  <span>Jam Lembur Tambahan Aktual (Jam)</span>
                  <span className="text-[10px] text-[var(--accent-sand-light)] font-mono">
                    Indeks: {calculateDailyOvertimeAmount(parseFloat(editDayOT) || 0, getDayType(editingDay.date, editDayType).dayType, OVERTIME_BASE_RATE).index}x
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
                    className="brutal-input text-sm font-mono flex-1 bg-[var(--bg-surface)] text-[var(--text-primary)] border-2 border-[var(--border-color)]"
                    placeholder="0"
                  />
                  <div className="flex gap-1">
                    {[1, 2, 4].map(add => (
                      <button
                        key={add}
                        type="button"
                        onClick={() => {
                          const cur = parseFloat(editDayOT) || 0;
                          setEditDayOT(String(cur + add));
                        }}
                        className="px-2 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded text-xs font-mono font-bold hover:bg-[var(--bg-muted)] text-[var(--text-primary)]"
                      >
                        +{add}j
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEditDayOT('0')}
                      className="px-2 py-1.5 bg-[var(--accent-terracotta-dark)] border border-[var(--accent-terracotta)] rounded text-xs font-mono font-bold text-[var(--accent-terracotta-light)]"
                    >
                      0
                    </button>
                  </div>
                </div>
              </div>

              {/* Ceklis Makan Manual (P/S/M) */}
              <div className="space-y-1.5">
                <label className="brutal-label text-xs">Ceklis Makan (Manual):</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditDayMeals({ ...editDayMeals, breakfast: !editDayMeals.breakfast })}
                    className={`p-2 rounded-[var(--radius-sm)] border-2 text-center font-mono text-xs font-bold transition-all ${
                      editDayMeals.breakfast
                        ? 'bg-[var(--accent-blue-dark)] text-[var(--accent-blue-light)] border-[var(--accent-blue)] shadow-[2px_2px_0px_#000]'
                        : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                    }`}
                  >
                    Pagi (P)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditDayMeals({ ...editDayMeals, lunch: !editDayMeals.lunch })}
                    className={`p-2 rounded-[var(--radius-sm)] border-2 text-center font-mono text-xs font-bold transition-all ${
                      editDayMeals.lunch
                        ? 'bg-[var(--accent-sand-dark)] text-[var(--accent-sand-light)] border-[var(--accent-sand)] shadow-[2px_2px_0px_#000]'
                        : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                    }`}
                  >
                    Siang (S)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditDayMeals({ ...editDayMeals, dinner: !editDayMeals.dinner })}
                    className={`p-2 rounded-[var(--radius-sm)] border-2 text-center font-mono text-xs font-bold transition-all ${
                      editDayMeals.dinner
                        ? 'bg-[var(--accent-lavender-dark)] text-[var(--accent-lavender-light)] border-[var(--accent-lavender)] shadow-[2px_2px_0px_#000]'
                        : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                    }`}
                  >
                    Malam (M)
                  </button>
                </div>
              </div>

              {/* Catatan Hari Ini */}
              <div className="space-y-1">
                <label className="brutal-label text-xs">Catatan Shift / Overtime (Opsional)</label>
                <input
                  type="text"
                  value={editDayNote}
                  onChange={(e) => setEditDayNote(e.target.value)}
                  placeholder="Misal: Back-up mesin, perbaikan boiler..."
                  className="brutal-input text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] border-2 border-[var(--border-color)]"
                />
              </div>

              {/* Tombol Aksi Modal */}
              <div className="flex justify-end gap-2.5 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setEditingDay(null)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="brutal-btn brutal-btn-sand text-xs font-bold shadow-[2px_2px_0px_#000]"
                >
                  Simpan Perubahan
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5. MODAL PENGATURAN KHUSUS MODUL GAJI & SHIFT                         */}
      {/* ===================================================================== */}
      {isSalarySettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="brutal-card p-5 sm:p-6 bg-[var(--bg-surface)] max-w-lg w-full space-y-4 border-2 border-[var(--border-color)] shadow-[var(--shadow-xl)] max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-[var(--accent-sand)]" />
                <h3 className="font-heading font-bold text-base text-[var(--text-primary)]">
                  Pengaturan Gaji & Shift
                </h3>
              </div>
              <button 
                onClick={() => setIsSalarySettingsModalOpen(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSalarySettings} className="space-y-4">
              
              {/* Status PTKP */}
              <div className="space-y-1">
                <label className="brutal-label text-xs">Status PTKP (Pajak TER)</label>
                <select
                  value={ptkpStatus}
                  onChange={(e) => setPtkpStatus(e.target.value as PTKPStatus)}
                  className="brutal-select text-xs py-2 w-full bg-[var(--bg-surface)] border-2 border-[var(--border-color)] text-[var(--text-primary)]"
                >
                  {PTKP_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} - {opt.desc}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[var(--text-muted)] font-mono">
                  Menentukan kategori TER (A, B, atau C) dan tarif pajak PPh 21 bulanan sesuai PP 58/2023.
                </p>
              </div>

              {/* Tarif per Ceklis Makan */}
              <div className="space-y-1">
                <label className="brutal-label text-xs">Tarif per Ceklis Makan (Rp)</label>
                <input
                  type="number"
                  step="500"
                  value={mealRate}
                  onChange={(e) => setMealRate(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="brutal-input text-xs font-mono bg-[var(--bg-surface)] border-2 border-[var(--border-color)] text-[var(--text-primary)]"
                  placeholder="9800"
                />
                <p className="text-[10px] text-[var(--text-muted)] font-mono">
                  Standar default: Rp 9.800 per kali makan yang diceklis.
                </p>
              </div>

              {/* Gaji Pokok & Tunjangan Tetap */}
              <div className="space-y-2 p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs font-mono">
                <span className="font-bold text-[var(--text-primary)] block">Komponen Gaji Pokok & Tunjangan</span>
                
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-[var(--text-secondary)] block">Gaji Pokok (Rp):</label>
                    <input
                      type="number"
                      value={customSalarySettings.basicSalary}
                      onChange={(e) => setCustomSalarySettings({ ...customSalarySettings, basicSalary: Number(e.target.value) || 0 })}
                      className="brutal-input text-xs py-1 bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-color)]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--text-secondary)] block">Tunjangan Perumahan (Rp):</label>
                    <input
                      type="number"
                      value={customSalarySettings.housingAllowance}
                      onChange={(e) => setCustomSalarySettings({ ...customSalarySettings, housingAllowance: Number(e.target.value) || 0 })}
                      className="brutal-input text-xs py-1 bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-color)]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--text-secondary)] block">Tunjangan Shift (Rp):</label>
                    <input
                      type="number"
                      value={customSalarySettings.shiftAllowance}
                      onChange={(e) => setCustomSalarySettings({ ...customSalarySettings, shiftAllowance: Number(e.target.value) || 0 })}
                      className="brutal-input text-xs py-1 bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-color)]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--text-secondary)] block">Potongan Mess/Housing (Rp):</label>
                    <input
                      type="number"
                      value={customSalarySettings.housingDeduction}
                      onChange={(e) => setCustomSalarySettings({ ...customSalarySettings, housingDeduction: Number(e.target.value) || 0 })}
                      className="brutal-input text-xs py-1 bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-color)]"
                    />
                  </div>
                </div>
              </div>

              {/* Tombol Aksi Modal */}
              <div className="flex justify-end gap-2.5 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsSalarySettingsModalOpen(false)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="brutal-btn brutal-btn-sand text-xs font-bold shadow-[2px_2px_0px_#000]"
                >
                  Simpan Pengaturan
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
            
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-[var(--accent-sand)]" />
                <h3 className="font-heading font-bold text-base text-[var(--text-primary)]">
                  {editingAddOnId ? 'Edit Komponen Tambahan' : 'Tambah Komponen Tambahan (Bonus/THR)'}
                </h3>
              </div>
              <button 
                onClick={() => setIsAddOnModalOpen(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAddOnModal} className="space-y-4">
              
              <div className="space-y-1">
                <label className="brutal-label text-xs">Nama Komponen Tambahan</label>
                <input
                  type="text"
                  value={addOnName}
                  onChange={(e) => setAddOnName(e.target.value)}
                  placeholder="Misal: THR Idul Fitri, Bonus Akhir Tahun..."
                  className="brutal-input text-xs bg-[var(--bg-surface)] border-2 border-[var(--border-color)] text-[var(--text-primary)]"
                  required
                  autoFocus
                />
              </div>

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
                  className="brutal-input text-sm font-mono bg-[var(--bg-surface)] border-2 border-[var(--border-color)] text-[var(--text-primary)]"
                  required
                />
                {addOnCalcNotice && (
                  <p className="text-[10px] text-[var(--accent-sand-light)] font-mono">
                    {addOnCalcNotice}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="brutal-label text-xs">Catatan / Keterangan (Opsional)</label>
                <input
                  type="text"
                  value={addOnNote}
                  onChange={(e) => setAddOnNote(e.target.value)}
                  placeholder="Catatan tambahan (mis: SK Direksi No. 12/2026)"
                  className="brutal-input text-xs bg-[var(--bg-surface)] border-2 border-[var(--border-color)] text-[var(--text-primary)]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsAddOnModalOpen(false)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="brutal-btn brutal-btn-sand text-xs font-bold shadow-[2px_2px_0px_#000]"
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
