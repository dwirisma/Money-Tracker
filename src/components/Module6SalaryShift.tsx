import { freeBalanceText, getFreeBalance } from '../utils/accountBalance';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Utensils,
  Plus,
  Zap,
  ShieldCheck,
  FileText,
  Info,
  CalendarCheck,
  Sparkles,
  RotateCcw,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Settings,
  Archive,
  Trash2,
  Gift,
  ToggleLeft,
  ToggleRight,
  Edit3,
  Wallet
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
import { SalaryHistorySection, EditDayModal, SalarySettingsModal, AddOnModal, type HistoryItem } from './SalaryModals';
import { 
  generateShiftCalendar,
  refreshShiftLogsMetadata,
  getDayType,
  calculateOvertimeIndex,
  calculateDailyOvertimeAmount,
  calculateSalaryBreakdown, 
  getMergedHolidays,
  DEFAULT_AUTO_OT_HOURS_PER_SUNDAY_SHIFT_3,
  BASIC_SALARY,
  HOUSING_ALLOWANCE,
  SHIFT_ALLOWANCE,
  HOUSING_DEDUCTION,
  DEFAULT_MEAL_RATE
} from '../utils/salaryCalculator';
import { 
  archiveSalaryPeriod,
  upsertPayrollAutomation,
  deleteSalaryHistoryDoc,
  saveShiftScheduleToFirestore,
  fetchShiftScheduleFromFirestore,
  saveSalarySettingsToFirestore,
  saveSalaryAddOnsToFirestore,
  fetchSalaryAddOnsFromFirestore,
  saveHolidaysToFirestore,
  subscribeSalaryHistoriesByLedger,
  subscribeShiftSchedule,
  subscribeSalarySettings,
  subscribeSalaryAddOns,
  subscribeHolidays,
  type CustomSalarySettings
} from '../services/cashManagementService';
import { useAuth } from '../context/AuthContext';

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

function getInitialCutoffPeriod() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  if (d >= 21) {
    if (m === 11) return { year: y + 1, monthIndex: 0 };
    return { year: y, monthIndex: m + 1 };
  }
  return { year: y, monthIndex: m };
}

const SLIP_ACC_TYPE: Record<string, string> = { cash: 'Dompet', bank: 'Bank', ewallet: 'E-Wallet', credit_card: 'Kartu Kredit' };

export const Module6SalaryShift: React.FC<Module6SalaryShiftProps> = ({
  activeLedger,
  accounts,
  automations,
  formatRupiah,
  formatDate,
  onNavigateToTab,
  onAutomationUpdated
}) => {
  const { uid } = useAuth();

  // Periode Gaji Aktif (Otomatis mengikuti tanggal cut-off 21 - 20)
  const initialPeriod = useMemo(() => getInitialCutoffPeriod(), []);
  const [currentYear, setCurrentYear] = useState<number>(initialPeriod.year);
  const [currentMonthIndex, setCurrentMonthIndex] = useState<number>(initialPeriod.monthIndex); // 0-11

  // Grup Shift: Default Group C (4 Regu: A, B, C, D)
  const [selectedGroup, setSelectedGroup] = useState<ShiftGroup>('C');

  // Status Pengaturan Khusus Modul Gaji (PTKP, Harga Makan, Komponen Gaji, Auto OT)
  const [ptkpStatus, setPtkpStatus] = useState<PTKPStatus>('TK/0');
  const [mealRate, setMealRate] = useState<number>(DEFAULT_MEAL_RATE);
  const [isAutoOTEnabled, setIsAutoOTEnabled] = useState<boolean>(true);
  const [autoOTPerSunday, setAutoOTPerSunday] = useState<number>(DEFAULT_AUTO_OT_HOURS_PER_SUNDAY_SHIFT_3);

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

  // Otomasi gaji (saklar di Pengaturan Gaji), tersimpan di Cloud Firestore (salarySettings/{ledgerId})
  const [payrollStored, setPayrollStored] = useState<{ enabled: boolean; accountId: string } | null>(null);
  const payrollAuto = useMemo(() => {
    if (payrollStored) return payrollStored;
    const existing = automations.find(a => a.ledgerId === activeLedger?.id && a.type === 'income' && a.name.toLowerCase().includes('payroll'));
    const bank = accounts.find(a => a.type === 'bank' && !a.isArchived);
    return { enabled: !!existing, accountId: existing?.sourceAccountId || bank?.id || accounts[0]?.id || '' };
  }, [payrollStored, automations, accounts, activeLedger?.id]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [historiesLoaded, setHistoriesLoaded] = useState(false);
  const [loadedKey, setLoadedKey] = useState('');
  const [dirtyKey, setDirtyKey] = useState<string | null>(null);

  // Unique Month Key untuk penyimpanan Cloud Firestore per Buku Kas & Grup Shift
  const monthKey = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;
  const periodStorageKey = `${monthKey}_grp_${selectedGroup}`;

  // Manajemen Tanggal Merah (Built-in + API Synced + Custom Manual di Cloud Firestore)
  const [customHolidays, setCustomHolidays] = useState<Record<string, string>>({});
  const [syncedHolidays, setSyncedHolidays] = useState<Record<string, string>>({});
  const mergedHolidays = useMemo(
    () => getMergedHolidays(customHolidays, syncedHolidays),
    [customHolidays, syncedHolidays]
  );

  const [isSyncingHolidays, setIsSyncingHolidays] = useState<boolean>(false);
  const [newHolidayDate, setNewHolidayDate] = useState<string>('');
  const [newHolidayName, setNewHolidayName] = useState<string>('');

  // Hitung tarif dasar lembur per jam secara dinamis dari pengaturan Gaji Pokok + Tunjangan Perumahan
  const otBaseRate = useMemo(() => {
    const basic = customSalarySettings.basicSalary || BASIC_SALARY;
    const housing = customSalarySettings.housingAllowance || HOUSING_ALLOWANCE;
    return (basic + housing) / 173;
  }, [customSalarySettings.basicSalary, customSalarySettings.housingAllowance]);

  // State Daftar Hari Shift Kalender
  const [shiftDays, setShiftDays] = useState<ShiftDayLog[]>(() =>
    generateShiftCalendar(
      currentMonthIndex,
      currentYear,
      selectedGroup,
      mergedHolidays,
      autoOTPerSunday,
      isAutoOTEnabled
    )
  );

  // Jam Lembur Otomatis (Auto O/T) untuk Periode Ini (Minggu Shift III = 8.25j per Minggu)
  const autoOTHours = useMemo(() => {
    if (!isAutoOTEnabled) return 0;
    return shiftDays.reduce(
      (sum, day) => sum + (day.hasAutoOT ? (day.autoOTHours || autoOTPerSunday) : 0),
      0
    );
  }, [shiftDays, isAutoOTEnabled, autoOTPerSunday]);

  // State Komponen Tambahan Gaji (Add-On / Bonus / THR / Rapelan)
  const [addOns, setAddOns] = useState<SalaryAddOn[]>([]);

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
  const [calendarFilter, setCalendarFilter] = useState<'all' | 'work' | 'off' | 'holiday' | 'overtime' | 'meal'>('all');

  // Arsip Riwayat Gaji Bulanan State
  const [salaryHistories, setSalaryHistories] = useState<SalaryHistoryRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);

  // Toast Notification Helper
  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Real-time listener: Hari Libur Kustom & Synced di Firestore
  useEffect(() => {
    if (!uid) return;
    return subscribeHolidays(uid, (data) => {
      setCustomHolidays(data.customHolidays || {});
      setSyncedHolidays(data.syncedHolidays || {});
    });
  }, [uid]);

  // Real-time listener: Arsip Riwayat Gaji Bulanan
  useEffect(() => {
    if (!uid || !activeLedger) {
      setSalaryHistories([]);
      return;
    }
    setIsLoadingHistory(true);
    const unsub = subscribeSalaryHistoriesByLedger(uid, activeLedger.id, (records) => {
      setSalaryHistories(records);
      setIsLoadingHistory(false);
      setHistoriesLoaded(true);
    });
    return () => unsub();
  }, [uid, activeLedger?.id]);

  // Real-time listener: Pengaturan Gaji & Auto-Payroll di Firestore
  useEffect(() => {
    if (!uid || !activeLedger) return;
    setSettingsLoaded(false);
    const unsub = subscribeSalarySettings(uid, activeLedger.id, (settings) => {
      if (settings) {
        setCustomSalarySettings(settings);
        if (settings.ptkpStatus) setPtkpStatus(settings.ptkpStatus);
        if (settings.mealRate !== undefined) setMealRate(settings.mealRate);
        if (settings.medicalAllowanceBik !== undefined) {
          setMedicalBikAmount(settings.medicalAllowanceBik);
          setMedicalBikInput(String(settings.medicalAllowanceBik));
        }
        if (settings.isMedicalBikActive !== undefined) {
          setIsMedicalBikEnabled(settings.isMedicalBikActive);
        }
        if (settings.defaultGroup) {
          setSelectedGroup(settings.defaultGroup);
        }
        if (settings.autoOTHoursPerSundayShift3 !== undefined) {
          setAutoOTPerSunday(settings.autoOTHoursPerSundayShift3);
        }
        if (settings.isAutoOTEnabled !== undefined) {
          setIsAutoOTEnabled(settings.isAutoOTEnabled);
        }
        if (settings.payrollAuto) {
          setPayrollStored(settings.payrollAuto);
        }
      } else {
        setPayrollStored(null);
      }
      setSettingsLoaded(true);
    });
    return () => unsub();
  }, [uid, activeLedger?.id]);

  // Real-time listener: Komponen Tambahan Gaji (Add-On) per Bulan
  useEffect(() => {
    if (!uid || !activeLedger) {
      setAddOns([]);
      return;
    }
    return subscribeSalaryAddOns(uid, activeLedger.id, monthKey, (list) => {
      setAddOns(list);
    });
  }, [uid, monthKey, activeLedger?.id]);

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

  // Real-time listener: Jadwal Shift & Lembur per Periode & Grup dari Cloud Firestore
  useEffect(() => {
    if (!uid || !activeLedger) return;
    const storageKey = `${monthKey}_grp_${selectedGroup}`;
    const unsub = subscribeShiftSchedule(uid, activeLedger.id, storageKey, (remote) => {
      if (remote && remote.length > 0) {
        const refreshed = refreshShiftLogsMetadata(
          remote,
          selectedGroup,
          mergedHolidays,
          autoOTPerSunday,
          isAutoOTEnabled,
          otBaseRate
        );
        setShiftDays(refreshed);
      } else {
        const fresh = generateShiftCalendar(
          currentMonthIndex,
          currentYear,
          selectedGroup,
          mergedHolidays,
          autoOTPerSunday,
          isAutoOTEnabled
        );
        setShiftDays(fresh);
      }
      setLoadedKey(storageKey);
    });
    return () => unsub();
  }, [uid, currentYear, currentMonthIndex, activeLedger?.id, selectedGroup, mergedHolidays, autoOTPerSunday, isAutoOTEnabled, otBaseRate]);

  // Simpan perubahan shiftDays langsung ke Cloud Firestore
  const handleUpdateShiftDays = (newDays: ShiftDayLog[]) => {
    setShiftDays(newDays);
    setDirtyKey(monthKey);
    if (uid && activeLedger) {
      const storageKey = `${monthKey}_grp_${selectedGroup}`;
      void saveShiftScheduleToFirestore(uid, activeLedger.id, storageKey, newDays);
    }
  };

  // Sinkronisasi Tanggal Merah dari API Online (Mendukung Lintas Tahun untuk Periode Des-Jan)
  const handleSyncHolidays = async () => {
    setIsSyncingHolidays(true);
    try {
      const yearsToFetch = currentMonthIndex === 0 ? [currentYear - 1, currentYear] : [currentYear];
      const nextSynced = { ...syncedHolidays };
      let syncedCount = 0;

      for (const y of yearsToFetch) {
        const response = await fetch(`https://dayoffapi.vercel.app/api?year=${y}`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            data.forEach((item: any) => {
              if (item.tanggal && item.keterangan) {
                nextSynced[item.tanggal] = item.keterangan;
                syncedCount++;
              }
            });
          }
        }
      }

      setSyncedHolidays(nextSynced);
      if (uid) {
        await saveHolidaysToFirestore(uid, { syncedHolidays: nextSynced });
      }

      const nextMerged = getMergedHolidays(customHolidays, nextSynced);
      const refreshedDays = refreshShiftLogsMetadata(
        shiftDays,
        selectedGroup,
        nextMerged,
        autoOTPerSunday,
        isAutoOTEnabled,
        otBaseRate
      );
      handleUpdateShiftDays(refreshedDays);

      if (syncedCount > 0) {
        showToast(`Berhasil menyinkronkan ${syncedCount} tanggal merah dari API online!`, 'success');
      } else {
        showToast(`Menggunakan database tanggal merah resmi ${currentYear}.`, 'info');
      }
    } catch {
      showToast(`Menggunakan database tanggal merah resmi ${currentYear}.`, 'info');
    } finally {
      setIsSyncingHolidays(false);
    }
  };

  // Tambah Tanggal Merah / Cuti Bersama / Libur Pabrik Manual
  const handleAddCustomHoliday = () => {
    if (!newHolidayDate || !newHolidayName.trim()) {
      showToast('Pilih tanggal dan masukkan nama hari libur!', 'error');
      return;
    }
    const label = newHolidayName.trim();
    const nextCustom = { ...customHolidays, [newHolidayDate]: label };
    setCustomHolidays(nextCustom);
    if (uid) {
      void saveHolidaysToFirestore(uid, { customHolidays: nextCustom });
    }
    setNewHolidayName('');

    const nextMerged = getMergedHolidays(nextCustom, syncedHolidays);
    const refreshedDays = refreshShiftLogsMetadata(
      shiftDays,
      selectedGroup,
      nextMerged,
      autoOTPerSunday,
      isAutoOTEnabled,
      otBaseRate
    );
    handleUpdateShiftDays(refreshedDays);
    showToast(`Tanggal merah "${label}" (${newHolidayDate}) berhasil ditambahkan!`, 'success');
  };

  // Hapus Tanggal Merah Manual
  const handleDeleteCustomHoliday = (dateStr: string) => {
    const nextCustom = { ...customHolidays };
    delete nextCustom[dateStr];
    setCustomHolidays(nextCustom);
    if (uid) {
      void saveHolidaysToFirestore(uid, { customHolidays: nextCustom });
    }

    const nextMerged = getMergedHolidays(nextCustom, syncedHolidays);
    const refreshedDays = refreshShiftLogsMetadata(
      shiftDays,
      selectedGroup,
      nextMerged,
      autoOTPerSunday,
      isAutoOTEnabled,
      otBaseRate
    );
    handleUpdateShiftDays(refreshedDays);
    showToast(`Tanggal merah manual pada ${dateStr} dihapus.`, 'info');
  };

  // Navigasi Periode Cut-Off (Bulan Sebelumnya / Bulan Berikutnya)
  const handlePrevPeriod = () => {
    leavePeriod();
    if (currentMonthIndex === 0) {
      setCurrentMonthIndex(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonthIndex(prev => prev - 1);
    }
  };

  const handleNextPeriod = () => {
    leavePeriod();
    if (currentMonthIndex === 11) {
      setCurrentMonthIndex(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonthIndex(prev => prev + 1);
    }
  };

  const handleResetToCurrentPeriod = () => {
    leavePeriod();
    const cur = getInitialCutoffPeriod();
    setCurrentYear(cur.year);
    setCurrentMonthIndex(cur.monthIndex);
  };

  // Hitung Kalkulasi Lengkap dengan Auto OT, Add-Ons, Medical BIK, & Override Komponen Gaji
  const salary: SalaryBreakdown = useMemo(() => {
    return calculateSalaryBreakdown(
      shiftDays, 
      ptkpStatus, 
      mealRate, 
      currentYear, 
      currentMonthIndex,
      autoOTHours,
      addOns,
      isMedicalBikEnabled ? medicalBikAmount : 0,
      {
        basicSalary: customSalarySettings.basicSalary || BASIC_SALARY,
        housingAllowance: customSalarySettings.housingAllowance || HOUSING_ALLOWANCE,
        shiftAllowance: customSalarySettings.shiftAllowance || SHIFT_ALLOWANCE,
        housingDeduction: customSalarySettings.housingDeduction || HOUSING_DEDUCTION
      }
    );
  }, [
    shiftDays,
    ptkpStatus,
    mealRate,
    currentYear,
    currentMonthIndex,
    autoOTHours,
    addOns,
    isMedicalBikEnabled,
    medicalBikAmount,
    customSalarySettings
  ]);

  // Hitung Nilai Pengali (Index) Lembur Tambahan Aktual
  const additionalOTIndex = useMemo(() => {
    return Math.max(0, Math.round((salary.totalOTIndex - (salary.autoOTIndex || 0)) * 100) / 100);
  }, [salary.totalOTIndex, salary.autoOTIndex]);

  // Handler CRUD Komponen Tambahan Gaji (Add-On / Bonus / THR)
  const handleUpdateAddOns = (newAddOns: SalaryAddOn[]) => {
    setAddOns(newAddOns);
    setDirtyKey(monthKey);
    if (uid && activeLedger) {
      void saveSalaryAddOnsToFirestore(uid, activeLedger.id, monthKey, newAddOns);
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

  // Daftar Tanggal Auto OT pada Periode Ini
  const autoOTDatesLabel = useMemo(() => {
    const list = shiftDays.filter(d => d.hasAutoOT).map(d => `${d.dayNumber} ${d.dayName}`);
    return list.length > 0 ? list.join(' & ') : 'Tidak ada Minggu Shift III';
  }, [shiftDays]);

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
        const shiftCode: 'I' | 'II' | 'III' | 'O' =
          editDayType.includes('Shift 1') || editDayType.includes('Malam') ? 'I' :
          editDayType.includes('Shift 2') || editDayType.includes('Pagi') ? 'II' :
          editDayType.includes('Shift 3') || editDayType.includes('Sore') ? 'III' : 'O';

        const nextIsWork = shiftCode !== 'O' && editDayIsWork;
        const { dayType, isPublicHoliday, holidayName } = getDayType(day.date, shiftCode, mergedHolidays);
        const { index, amount } = calculateDailyOvertimeAmount(parsedOT, dayType, otBaseRate);

        const parts = day.date.split('-');
        const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const isSunday = dateObj.getDay() === 0;
        const hasAutoOT = isAutoOTEnabled && isSunday && shiftCode === 'III';
        const autoOTHoursDay = hasAutoOT ? autoOTPerSunday : 0;

        return {
          ...day,
          overtimeHours: parsedOT,
          overtimeIndex: index,
          overtimeAmount: amount,
          shiftType: editDayType,
          shiftCode,
          shiftHours: shiftCode === 'I' ? '23:00 - 07:00' : shiftCode === 'II' ? '07:00 - 15:00' : shiftCode === 'III' ? '15:00 - 23:00' : 'Libur',
          isWorkDay: nextIsWork,
          dayType,
          isPublicHoliday,
          holidayName,
          hasAutoOT,
          autoOTHours: autoOTHoursDay,
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

  // Reset Jadwal Periode Aktif ke Siklus Standar 28-Hari AGC
  const handleResetSchedulePattern = () => {
    const fresh = generateShiftCalendar(
      currentMonthIndex,
      currentYear,
      selectedGroup,
      mergedHolidays,
      autoOTPerSunday,
      isAutoOTEnabled
    );
    handleUpdateShiftDays(fresh);
    showToast(`Jadwal Grup ${selectedGroup} berhasil direset sesuai siklus 28-hari resmi AGC!`, 'info');
  };

  // Simpan Pengaturan Khusus Gaji & Shift
  const handleSaveSalarySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLedger) return;

    try {
      const payload: CustomSalarySettings & {
        defaultGroup?: ShiftGroup;
        autoOTHoursPerSundayShift3?: number;
        isAutoOTEnabled?: boolean;
      } = {
        ptkpStatus,
        mealRate,
        basicSalary: customSalarySettings.basicSalary || BASIC_SALARY,
        housingAllowance: customSalarySettings.housingAllowance || HOUSING_ALLOWANCE,
        shiftAllowance: customSalarySettings.shiftAllowance || SHIFT_ALLOWANCE,
        housingDeduction: customSalarySettings.housingDeduction || HOUSING_DEDUCTION,
        medicalAllowanceBik: medicalBikAmount,
        isMedicalBikActive: isMedicalBikEnabled,
        defaultGroup: selectedGroup,
        autoOTHoursPerSundayShift3: autoOTPerSunday,
        isAutoOTEnabled,
        payrollAuto
      };
      setCustomSalarySettings(payload);
      setPayrollStored(payrollAuto);
      if (uid) {
        await saveSalarySettingsToFirestore(uid, activeLedger.id, payload);
      }
      if (payrollAuto.enabled) {
        const up = await upcomingSnapshot();
        if (up) await syncPayrollRule(up.salary, up.key);
      }

      const newBaseRate = ((payload.basicSalary || BASIC_SALARY) + (payload.housingAllowance || HOUSING_ALLOWANCE)) / 173;
      const refreshed = refreshShiftLogsMetadata(
        shiftDays,
        selectedGroup,
        mergedHolidays,
        autoOTPerSunday,
        isAutoOTEnabled,
        newBaseRate
      );
      handleUpdateShiftDays(refreshed);

      setIsSalarySettingsModalOpen(false);
      showToast('Pengaturan Gaji, Auto OT & Tanggal Merah berhasil disimpan ke Cloud!', 'success');
    } catch (err) {
      console.error('Gagal menyimpan pengaturan gaji:', err);
      showToast('Gagal menyimpan pengaturan gaji ke Cloud Firestore.', 'error');
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
    leavePeriod();
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
    if (!uid) return;
    if (!window.confirm(`Hapus arsip riwayat gaji periode ${formatPeriodLabel(periodStr)} (${periodStr})?`)) return;
    setDeletingHistoryId(historyId);
    try {
      await deleteSalaryHistoryDoc(uid, historyId);
      showToast(`Arsip riwayat gaji periode ${periodStr} berhasil dihapus!`, 'info');
    } catch (err) {
      console.error('Gagal menghapus riwayat gaji:', err);
      showToast('Gagal menghapus arsip riwayat gaji.', 'error');
    } finally {
      setDeletingHistoryId(null);
    }
  };

  // =====================================================================
  // ARSIP GAJI OTOMATIS & OTOMASI GAJI (100% Cloud Firestore)
  // =====================================================================
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const isPeriodEnded = (y: number, m: number) => todayStr() > `${y}-${pad2(m + 1)}-20`;
  const periodKeyOf = (y: number, m: number) => `${y}-${pad2(m + 1)}`;
  const prevPeriodOf = (p: { year: number; monthIndex: number }) => (p.monthIndex === 0 ? { year: p.year - 1, monthIndex: 11 } : { year: p.year, monthIndex: p.monthIndex - 1 });
  const historyOf = (key: string) => salaryHistories.find(h => h.ledgerId === activeLedger?.id && h.period === key);

  /** Hitung gaji sebuah periode dari data Cloud Firestore (atau state aktif bila sama). */
  const buildSnapshot = async (y: number, m: number): Promise<{ key: string; salary: SalaryBreakdown } | null> => {
    if (!uid || !activeLedger) return null;
    const key = periodKeyOf(y, m);
    let days: ShiftDayLog[];
    let periodAddOns: SalaryAddOn[];

    if (key === monthKey) {
      days = shiftDays;
      periodAddOns = addOns;
    } else {
      const [remoteDays, remoteAddOns] = await Promise.all([
        fetchShiftScheduleFromFirestore(uid, activeLedger.id, `${key}_grp_${selectedGroup}`),
        fetchSalaryAddOnsFromFirestore(uid, activeLedger.id, key)
      ]);
      days = remoteDays && remoteDays.length > 0
        ? refreshShiftLogsMetadata(remoteDays, selectedGroup, mergedHolidays, autoOTPerSunday, isAutoOTEnabled, otBaseRate)
        : generateShiftCalendar(m, y, selectedGroup, mergedHolidays, autoOTPerSunday, isAutoOTEnabled);
      periodAddOns = remoteAddOns;
    }

    const autoOT = isAutoOTEnabled ? days.reduce((sum, d) => sum + (d.hasAutoOT ? (d.autoOTHours || autoOTPerSunday) : 0), 0) : 0;
    return {
      key,
      salary: calculateSalaryBreakdown(days, ptkpStatus, mealRate, y, m, autoOT, periodAddOns, isMedicalBikEnabled ? medicalBikAmount : 0, {
        basicSalary: customSalarySettings.basicSalary || BASIC_SALARY,
        housingAllowance: customSalarySettings.housingAllowance || HOUSING_ALLOWANCE,
        shiftAllowance: customSalarySettings.shiftAllowance || SHIFT_ALLOWANCE,
        housingDeduction: customSalarySettings.housingDeduction || HOUSING_DEDUCTION
      })
    };
  };

  /** Periode dengan tanggal gajian terdekat yang belum lewat (periode yang baru berakhir, atau periode berjalan). */
  const upcomingSnapshot = async () => {
    const cur = getInitialCutoffPeriod();
    for (const p of [prevPeriodOf(cur), cur]) {
      const snap = await buildSnapshot(p.year, p.monthIndex);
      if (snap && snap.salary.paydayDate >= todayStr()) return snap;
    }
    return null;
  };

  /** Perbarui aturan Pemasukan "Payroll" hanya untuk tanggal gajian terdekat. */
  const syncPayrollRule = async (sal: SalaryBreakdown, key: string) => {
    if (!uid || !activeLedger || !payrollAuto.enabled || !payrollAuto.accountId) return;
    if (!(sal.netSalary > 0) || sal.paydayDate < todayStr()) return;
    const up = await upcomingSnapshot();
    if (up?.key !== key) return;
    const existing = automations.find(a => a.ledgerId === activeLedger.id && a.type === 'income' && a.name.toLowerCase().includes('payroll'));
    await upsertPayrollAutomation(uid, {
      ledgerId: activeLedger.id,
      targetAccountId: payrollAuto.accountId,
      netSalary: sal.netSalary,
      paydayDate: sal.paydayDate,
      paydayNumber: parseInt(sal.paydayDate.split('-')[2], 10),
      noteDesc: `Estimasi Gaji Group ${selectedGroup} (periode ${key}) • Total OT ${sal.totalOTHours}j • Makan ${sal.totalMealCount}x`,
      existingRuleId: existing?.id
    });
    onAutomationUpdated?.();
  };

  /** Simpan (atau simpan ulang) arsip sebuah periode ke Cloud Firestore. */
  const archivePeriod = async (y: number, m: number, notify = false) => {
    if (!uid || !activeLedger) return;
    const snap = await buildSnapshot(y, m);
    if (!snap) return;
    try {
      await archiveSalaryPeriod(uid, {
        ledgerId: activeLedger.id,
        period: snap.key,
        totalOtHours: snap.salary.totalOTHours,
        totalMeals: snap.salary.totalMealCount,
        totalAddOns: snap.salary.totalAddOns,
        netSalary: snap.salary.netSalary,
        grossSalary: snap.salary.grossIncome
      });
      await syncPayrollRule(snap.salary, snap.key);
      if (notify) showToast(`Periode ${formatPeriodLabel(snap.key)} diarsipkan otomatis. Masih bisa diedit kapan saja.`, 'info');
    } catch (err) {
      console.warn('Gagal mengarsipkan periode gaji:', err);
    }
  };

  /** Dipanggil saat meninggalkan periode yang sedang dilihat. */
  const leavePeriod = () => {
    if (!activeLedger) return;
    const cur = getInitialCutoffPeriod();
    const behind = (cur.year * 12 + cur.monthIndex) - (currentYear * 12 + currentMonthIndex);
    const hasActivity = shiftDays.some(d => d.overtimeHours > 0 || d.meals.breakfast || d.meals.lunch || d.meals.dinner) || addOns.length > 0;
    const recentlyEnded = isPeriodEnded(currentYear, currentMonthIndex) && behind >= 0 && behind <= 1;
    if (historyOf(monthKey) || hasActivity || recentlyEnded) void archivePeriod(currentYear, currentMonthIndex, true);
  };

  // Saat aplikasi dibuka: finalkan periode yang baru berakhir (bila belum diarsipkan setelah tanggal tutup buku) dan segarkan aturan Payroll.
  const finalizedLedgerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!uid || !activeLedger || !settingsLoaded || !historiesLoaded) return;
    if (finalizedLedgerRef.current === activeLedger.id) return;
    finalizedLedgerRef.current = activeLedger.id;
    (async () => {
      const cur = getInitialCutoffPeriod();
      const ended = prevPeriodOf(cur);
      const rec = historyOf(periodKeyOf(ended.year, ended.monthIndex));
      const endMs = new Date(ended.year, ended.monthIndex, 20, 23, 59, 59).getTime();
      if (!rec || Number(rec.createdAt) < endMs) await archivePeriod(ended.year, ended.monthIndex, true);
      const up = await upcomingSnapshot();
      if (up) await syncPayrollRule(up.salary, up.key);
    })();
  }, [uid, activeLedger?.id, settingsLoaded, historiesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sinkron aturan Payroll untuk tanggal gajian terdekat setelah semua data siap (hanya bila nilainya berubah).
  const payrollSigRef = useRef('');
  useEffect(() => {
    if (!uid || !activeLedger || !settingsLoaded || !historiesLoaded || !payrollAuto.enabled || !payrollAuto.accountId) return;
    let cancelled = false;
    (async () => {
      const up = await upcomingSnapshot();
      if (cancelled || !up) return;
      const sig = `${activeLedger.id}|${up.key}|${up.salary.netSalary}|${up.salary.paydayDate}|${payrollAuto.accountId}|${automations.length}`;
      if (payrollSigRef.current === sig) return;
      payrollSigRef.current = sig;
      await syncPayrollRule(up.salary, up.key);
    })();
    return () => { cancelled = true; };
  }, [uid, activeLedger?.id, settingsLoaded, historiesLoaded, payrollAuto.enabled, payrollAuto.accountId, automations.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mengedit periode (kalender atau komponen tambahan): simpan ulang arsipnya, atau perbarui aturan Payroll bila periode itu belum diarsipkan.
  useEffect(() => {
    if (!dirtyKey || dirtyKey !== monthKey || loadedKey !== periodStorageKey) return;
    const timer = setTimeout(async () => {
      if (historyOf(monthKey) || isPeriodEnded(currentYear, currentMonthIndex)) {
        await archivePeriod(currentYear, currentMonthIndex);
      } else {
        const snap = await buildSnapshot(currentYear, currentMonthIndex);
        if (snap) await syncPayrollRule(snap.salary, snap.key);
      }
      setDirtyKey(null);
    }, 900);
    return () => clearTimeout(timer);
  }, [dirtyKey, shiftDays, addOns]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter hari untuk kalender
  const filteredDays = useMemo(() => {
    if (calendarFilter === 'work') return shiftDays.filter(d => d.isWorkDay && !d.isPublicHoliday);
    if (calendarFilter === 'off') return shiftDays.filter(d => !d.isWorkDay && !d.isPublicHoliday);
    if (calendarFilter === 'holiday') return shiftDays.filter(d => d.isPublicHoliday);
    if (calendarFilter === 'overtime') return shiftDays.filter(d => d.overtimeHours > 0 || d.hasAutoOT);
    if (calendarFilter === 'meal') return shiftDays.filter(d => d.meals.breakfast || d.meals.lunch || d.meals.dinner);
    return shiftDays;
  }, [shiftDays, calendarFilter]);

  // Statistik Ringkas Kalender
  const workDaysCount = shiftDays.filter(d => d.isWorkDay && !d.isPublicHoliday).length;
  const offDaysCount = shiftDays.filter(d => !d.isWorkDay && !d.isPublicHoliday).length;
  const holidaysCount = shiftDays.filter(d => d.isPublicHoliday).length;
  const otDaysCount = shiftDays.filter(d => d.overtimeHours > 0 || d.hasAutoOT).length;
  const mealDays = shiftDays.filter(d => d.meals.breakfast || d.meals.lunch || d.meals.dinner);

  // Daftar hari libur untuk tahun aktif (ditampilkan di modal pengaturan)
  const activeYearHolidays = useMemo(() => {
    const prefix = `${currentYear}-`;
    return Object.entries(mergedHolidays)
      .filter(([dateStr]) => dateStr.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [mergedHolidays, currentYear]);

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-16 right-4 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className={`brutal-card p-3 px-3 text-xs font-mono font-bold flex items-center gap-2.5 shadow-[var(--shadow-md)] ${
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

      {/* HEADER */}
      <div className="ax-pagehead">
        <div>
          <h2>Gaji & Kalender Shift</h2>
          <p>
            Buku kas <b>{activeLedger?.name || 'Utama'}</b> · Periode cut-off: <b>{periodLabel}</b>
          </p>
        </div>
        <span className="ax-badge-s" style={{ fontSize: 10 }}>4 Regu · 3 Shift · Siklus 28 hari</span>
      </div>

      {/* KONTROL: GRUP + PERIODE */}
      <div className="ax-panel ax-ctl">
        <div className="ax-grp-l">
          <b>Grup</b>
          <div className="ax-chipset" role="radiogroup" aria-label="Pilih grup shift">
            {(['A', 'B', 'C', 'D'] as ShiftGroup[]).map(grp => (
              <button key={grp} type="button" role="radio" aria-checked={selectedGroup === grp} onClick={() => setSelectedGroup(grp)} title={`Pilih Grup ${grp}`}>
                Grup {grp}
              </button>
            ))}
          </div>
        </div>
        <div className="ax-ctl-r">
          <div className="ax-nav3">
            <button type="button" onClick={handlePrevPeriod} title="Periode cut-off sebelumnya" aria-label="Periode sebelumnya"><ChevronLeft className="w-4 h-4" /></button>
            <button type="button" className="mid" onClick={handleResetToCurrentPeriod} title="Kembali ke periode cut-off aktif hari ini">Bulan ini</button>
            <button type="button" onClick={handleNextPeriod} title="Periode cut-off berikutnya" aria-label="Periode berikutnya"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <button type="button" className="ax-iconbtn" onClick={handleResetSchedulePattern} title="Reset ke jadwal standar siklus 28 hari AGC" aria-label="Reset jadwal"><RotateCcw className="w-4 h-4" /></button>
          <button type="button" className="brutal-btn brutal-btn-sand" onClick={() => setIsSalarySettingsModalOpen(true)} title="Buka pengaturan gaji, auto OT & tanggal merah">
            <Settings className="w-4 h-4" />Pengaturan
          </button>
        </div>
      </div>

      {/* RINGKASAN PERIODE */}
      <section className="ax-dash">
        <div className="ax-b s6 ax-panel ax-hero sage">
          <div className="ax-hero-head">
            <div className="ax-eyebrow" style={{ marginTop: 0 }}><Wallet className="w-3.5 h-3.5" />Estimasi take home pay</div>
            <span className="ax-badge-s">Grup {selectedGroup}</span>
          </div>
          <div className="ax-big" style={{ marginBottom: 6 }}>{formatRupiah(salary.netSalary)}</div>
          <p className="ax-note-h">Penerimaan kas {formatRupiah(salary.cashIncome)} dikurangi potongan {formatRupiah(salary.totalDeductions)}</p>
          <div className="ax-hero-foot">
            <span className="ax-pay"><CalendarCheck className="w-3.5 h-3.5" />Gajian: {salary.paydayDate}</span>
            {salary.isPaydayAdjusted && <span className="ax-pay">⚡ Dimajukan (akhir pekan)</span>}
          </div>
        </div>
        <div className="ax-b m6 s3 ax-sc b">
          <span><CalendarIcon className="w-3 h-3" />Hari kerja / off</span>
          <b>{workDaysCount} <small>/ {offDaysCount} off</small></b>
          <small>{shiftDays.length} hari periode ini</small>
        </div>
        <div className="ax-b m6 s3 ax-sc y">
          <span><Zap className="w-3 h-3" />Lembur & merah</span>
          <b>{otDaysCount} <small>lembur</small></b>
          <small>{holidaysCount} tanggal merah</small>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. KALENDER SHIFT (KIRI) & SLIP GAJI (KANAN)                          */}
      {/* ===================================================================== */}
      <div className="ax-gs">

        {/* ------------------------------------------------------------------- */}
        {/* KALENDER SHIFT                                                       */}
        {/* ------------------------------------------------------------------- */}
        <section className="ax-panel ax-sec ax-gs-cal">
          <div className="ax-secthead">
            <div>
              <h3><CalendarIcon className="w-5 h-5" style={{ color: 'var(--accent-blue)' }} />Jadwal Shift & Ceklis Makan</h3>
              <p className="ax-sec-sub">Ketuk tanggal untuk mengisi lembur, ceklis makan, atau mengubah shift.</p>
            </div>
          </div>

          <div className="ax-chipset scroll" role="radiogroup" aria-label="Filter hari">
            <button type="button" role="radio" aria-checked={calendarFilter === 'all'} onClick={() => setCalendarFilter('all')}>Semua ({shiftDays.length})</button>
            <button type="button" role="radio" aria-checked={calendarFilter === 'work'} onClick={() => setCalendarFilter('work')}>Kerja ({workDaysCount})</button>
            <button type="button" role="radio" aria-checked={calendarFilter === 'off'} onClick={() => setCalendarFilter('off')}>Off ({offDaysCount})</button>
            <button type="button" role="radio" aria-checked={calendarFilter === 'holiday'} onClick={() => setCalendarFilter('holiday')}>Tanggal merah ({holidaysCount})</button>
            <button type="button" role="radio" aria-checked={calendarFilter === 'overtime'} onClick={() => setCalendarFilter('overtime')}>Lembur ({otDaysCount})</button>
            <button type="button" role="radio" aria-checked={calendarFilter === 'meal'} onClick={() => setCalendarFilter('meal')}>Makan ({mealDays.length})</button>
          </div>

          {calendarFilter === 'meal' && (
            <div className="ax-mealdates">
              {mealDays.length === 0 ? (
                <span className="ax-fieldhint" style={{ margin: 0 }}>Belum ada ceklis makan pada periode ini.</span>
              ) : (
                <>
                  <div className="ax-fl"><span>Tanggal makan · {mealDays.length} hari · {salary.totalMealCount}x makan</span></div>
                  <div className="ax-mealdates-l">
                    {mealDays.map(d => (
                      <button key={d.date} type="button" onClick={() => openEditDayModal(d)} title={`${d.date} · klik untuk ubah`}>
                        <b>{d.dayNumber}</b>
                        <span>{d.meals.breakfast ? 'P' : ''}{d.meals.lunch ? 'S' : ''}{d.meals.dinner ? 'M' : ''}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Ringkasan kalender */}
          <div className="ax-gstats">
            <div>
              <small>Kerja / Off / Libur</small>
              <b><span style={{ color: 'var(--accent-sage-light)' }}>{workDaysCount}</span> / <span style={{ color: 'var(--accent-terracotta-light)' }}>{offDaysCount}</span> / <span style={{ color: 'var(--accent-sand-light)' }}>{holidaysCount}</span></b>
            </div>
            <div title={`Hari Auto OT: ${autoOTDatesLabel}`}>
              <small>⚡ Auto OT terjadwal</small>
              <b style={{ color: 'var(--accent-sand-light)' }}>{salary.autoOTIndex}x <em>({autoOTHours} jam)</em></b>
            </div>
            <div>
              <small>Lembur tambahan</small>
              <b>{additionalOTIndex}x <em>({salary.actualAdditionalOTHours} jam)</em></b>
            </div>
            <div>
              <small>Ceklis makan</small>
              <b style={{ color: 'var(--accent-blue-light)' }}>{salary.totalMealCount}x makan</b>
            </div>
          </div>

          {/* Kotak hari */}
          <div className="ax-days">
            {filteredDays.map((day) => {
              const dayMealCount = (day.meals.breakfast ? 1 : 0) + (day.meals.lunch ? 1 : 0) + (day.meals.dinner ? 1 : 0);
              const isHoliday = day.isPublicHoliday;
              const otIndex = day.overtimeIndex || calculateOvertimeIndex(day.overtimeHours, day.dayType);
              const otAmount = day.overtimeAmount || calculateDailyOvertimeAmount(day.overtimeHours, day.dayType, otBaseRate).amount;

              const isShiftI = day.shiftCode === 'I' || day.shiftType.includes('Shift 1') || day.shiftType.includes('Malam');
              const isShiftII = day.shiftCode === 'II' || day.shiftType.includes('Shift 2') || day.shiftType.includes('Pagi');
              const kind = isHoliday ? 'holiday' : day.hasAutoOT ? 'autoot' : day.overtimeHours > 0 ? 'ot' : !day.isWorkDay ? 'off' : 'work';
              const shiftKey = !day.isWorkDay ? 'off' : isShiftI ? 'i' : isShiftII ? 'ii' : 'iii';

              return (
                <div
                  key={day.date}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEditDayModal(day)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditDayModal(day); } }}
                  className="ax-sd"
                  data-kind={kind}
                  title={`Klik tanggal ${day.date} untuk mengisi lembur ekstra, ceklis makan, atau ubah shift`}
                  aria-label={`Tanggal ${day.date}, ${day.dayName}`}
                >
                  <div className="ax-sd-h">
                    <span className="n">{day.dayNumber}</span>
                    <span className={`d ${day.dayName === 'Min' || isHoliday ? 'red' : ''}`}>{day.dayName}</span>
                    <span className="ax-shift" data-s={shiftKey}>
                      {!day.isWorkDay ? 'OFF' : isShiftI ? 'I Malam' : isShiftII ? 'II Pagi' : 'III Sore'}
                    </span>
                  </div>

                  {isHoliday && day.holidayName && (
                    <div className="ax-sd-hol" title={day.holidayName}>🎉 <span>{day.holidayName}</span></div>
                  )}

                  {day.isWorkDay && (
                    <div className="ax-sd-time">{day.shiftHours || (isShiftI ? '23:00-07:00' : isShiftII ? '07:00-15:00' : '15:00-23:00')}</div>
                  )}

                  {day.hasAutoOT && (
                    <div className="ax-sd-auto">
                      <span><Zap className="w-3 h-3" />Auto OT</span>
                      <span>+{day.autoOTHours || autoOTPerSunday}j</span>
                    </div>
                  )}

                  {day.overtimeHours > 0 && (
                    <div className="ax-sd-ot">
                      <div><span>⏱️ +{day.overtimeHours}j</span><span>{otIndex}x</span></div>
                      <b>+{formatRupiah(otAmount)}</b>
                    </div>
                  )}

                  <div className="ax-sd-f">
                    <span><Utensils className="w-3 h-3" />{dayMealCount > 0 ? `${dayMealCount}x makan` : '0x'}</span>
                    {dayMealCount > 0 && (
                      <span className="ax-meals">
                        {day.meals.breakfast && <i data-m="p">P</i>}
                        {day.meals.lunch && <i data-m="s">S</i>}
                        {day.meals.dinner && <i data-m="m">M</i>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Panduan sistem shift */}
          <div className="ax-warn" style={{ flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                <Info className="w-4 h-4" />Shift Group {selectedGroup} · 4 regu, 3 shift, siklus 28 hari
              </span>
              <span className="ax-tone" data-tone="mid">Auto OT ({autoOTDatesLabel}): {autoOTHours} jam</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5 }}>
              <li><b>Shift I (Malam):</b> 23:00 – 07:00 · <b>Shift II (Pagi):</b> 07:00 – 15:00 · <b>Shift III (Sore):</b> 15:00 – 23:00.</li>
              <li><b>Auto OT resmi AGC:</b> tiap <b>Shift III (Sore) hari Minggu</b> bernilai <b>{autoOTPerSunday} jam</b> Auto O/T (1x Minggu Shift III = 8,25j; 2x = 16,50j).</li>
              <li><b>Tanggal merah & lembur hari libur:</b> lembur pada hari Off atau tanggal merah dihitung dengan indeks hari libur (2x untuk 8 jam pertama, 3x jam ke-9, 4x jam ke-10 dst).</li>
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------------- */}
        {/* SLIP GAJI                                                            */}
        {/* ------------------------------------------------------------------- */}
        <section className="ax-panel ax-sec ax-slip">
          <div className="ax-slip-h">
            <div className="ax-eyebrow dim" style={{ justifyContent: 'space-between' }}>
              <span>Slip gaji resmi estimasi</span>
              <span className="ax-tone" data-tone="info">Group {selectedGroup}</span>
            </div>
            <h3>Rincian Penghasilan Karyawan</h3>
            <p className="ax-sec-sub">Periode: <b>{periodLabel}</b></p>
          </div>

          {/* 1. PENDAPATAN & TUNJANGAN */}
          <div className="ax-sl-sec">
            <div className="ax-sl-t" style={{ '--c': 'var(--accent-sage)' } as React.CSSProperties}><span>1. Pendapatan & tunjangan</span><span>Nominal</span></div>

            <div className="ax-sl-row"><span>Gaji Pokok (Basic Salary)</span><b>{formatRupiah(salary.basicSalary)}</b></div>
            <div className="ax-sl-row"><span>Tunjangan Perumahan (Housing)</span><b>{formatRupiah(salary.housingAllowance)}</b></div>
            <div className="ax-sl-row"><span>Tunjangan Shift (Group {selectedGroup})</span><b>{formatRupiah(salary.shiftAllowance)}</b></div>

            {/* Medical Allowance BIK (Gross) */}
            <div className="ax-sl-box">
              <div className="ax-sl-bik">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isMedicalBikEnabled}
                  className="ax-tg"
                  onClick={() => {
                    const next = !isMedicalBikEnabled;
                    setIsMedicalBikEnabled(next);
                    if (next && medicalBikAmount <= 0) {
                      setMedicalBikAmount(1500000);
                      setMedicalBikInput('1500000');
                    }
                  }}
                  title={isMedicalBikEnabled ? 'Nonaktifkan Medical BIK' : 'Aktifkan Medical BIK'}
                  aria-label="Medical Allowance BIK"
                ><i /></button>
                <div>
                  <b style={{ opacity: isMedicalBikEnabled ? 1 : 0.6 }}>Medical Allowance BIK (Gross)</b>
                  <small>*Benefit in Kind: menambah PPh 21 TER, tidak masuk net</small>
                </div>
                {!isMedicalBikEnabled && <span className="ax-sl-zero">Rp 0</span>}
              </div>
              {isMedicalBikEnabled && (
                <div className="ax-plain-amt" style={{ marginTop: 8 }}>
                  <span>Rp</span>
                  <input
                    type="text"
                    className="brutal-input"
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
                    aria-label="Nominal Medical Allowance BIK"
                    title="Ubah nominal Medical Allowance BIK (Gross)"
                  />
                </div>
              )}
            </div>

            <div className="ax-sl-row sum"><span>Total Tunjangan Tetap</span><b style={{ color: 'var(--accent-sage-light)' }}>{formatRupiah(salary.totalAllowance)}</b></div>

            {/* Total Upah Lembur */}
            <div className="ax-sl-box">
              <div className="ax-sl-row" style={{ padding: 0, borderBottom: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800, color: 'var(--accent-sand-light)' }}>
                  <Clock className="w-4 h-4" />Total upah lembur ({salary.totalOTHours}j · {salary.totalOTIndex}x)
                </span>
                <b style={{ color: 'var(--accent-sand-light)' }}>+{formatRupiah(salary.totalOTAmount)}</b>
              </div>
              <div className="ax-sl-sub">
                <div><span>⚡ Auto OT terjadwal ({autoOTDatesLabel})</span><span>{salary.autoOTIndex} jam (+{formatRupiah(salary.autoOTAmount)})</span></div>
                <div><span>• Lembur tambahan ekuivalen</span><span>{additionalOTIndex} jam (+{formatRupiah(salary.totalOTAmount - salary.autoOTAmount)})</span></div>
              </div>
            </div>

            {/* Komponen Tambahan (Bonus / THR) */}
            <div className="ax-sl-box gold">
              <div className="ax-sl-addh">
                <span><Gift className="w-4 h-4" />Komponen tambahan (bonus / THR)</span>
                <button type="button" className="ax-sl-add" onClick={() => handleOpenAddOnModal()} title="Tambah komponen penambah gaji"><Plus className="w-3.5 h-3.5" />Tambah</button>
              </div>

              <div className="ax-chips-q">
                <button type="button" style={{ '--c': 'var(--accent-sage)' } as React.CSSProperties} onClick={() => handleQuickAddPredefined('THR Keagamaan (1x Gaji Pokok)', salary.basicSalary, 'Tunjangan Hari Raya')}>+ THR (1x Basic)</button>
                <button type="button" style={{ '--c': 'var(--accent-sand)' } as React.CSSProperties} onClick={() => handleQuickAddPredefined('Bonus Kinerja / Tahunan', 5000000, 'Bonus performance')}>+ Bonus Kinerja</button>
                <button type="button" style={{ '--c': 'var(--accent-blue)' } as React.CSSProperties} onClick={() => handleQuickAddPredefined('Insentif Shift / Kehadiran', 750000, 'Insentif ekstra')}>+ Insentif</button>
                <button type="button" style={{ '--c': 'var(--accent-lavender)' } as React.CSSProperties} onClick={() => handleQuickAddPredefined('Rapelan Kenaikan Gaji', 1000000, 'Rapelan')}>+ Rapelan</button>
              </div>

              {addOns.length > 0 ? (
                <div className="ax-addons">
                  {addOns.map((item) => (
                    <div key={item.id} className={`ax-addon ${item.isEnabled ? '' : 'off'}`}>
                      <button type="button" role="switch" aria-checked={item.isEnabled} className="ax-tg sm" onClick={() => handleToggleAddOn(item.id)} aria-label={`Aktifkan ${item.name}`}><i /></button>
                      <b title={item.name}>{item.name}</b>
                      <span className="v">+{formatRupiah(item.amount)}</span>
                      <button type="button" className="ax-ib" onClick={() => handleOpenAddOnModal(item)} title="Edit" aria-label={`Edit ${item.name}`}><Edit3 className="w-3.5 h-3.5" /></button>
                      <button type="button" className="ax-ib del" onClick={() => handleDeleteAddOn(item.id)} title="Hapus" aria-label={`Hapus ${item.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  <div className="ax-sl-row sum"><span>Subtotal tambahan</span><b style={{ color: 'var(--accent-sand-light)' }}>+{formatRupiah(salary.totalAddOns)}</b></div>
                </div>
              ) : (
                <div className="ax-emptyh">
                  <small>Belum ada tambahan gaji. Pilih chip di atas atau tombol <b>Tambah</b> untuk THR, bonus, atau insentif.</small>
                </div>
              )}
            </div>

            <div className="ax-sl-gross"><span>Pendapatan kotor (gross)</span><b>{formatRupiah(salary.grossIncome)}</b></div>
          </div>

          {/* 2. POTONGAN & PAJAK TER */}
          <div className="ax-sl-sec">
            <div className="ax-sl-t" style={{ '--c': 'var(--accent-terracotta)' } as React.CSSProperties}><span>2. Potongan & pajak TER</span><span>Nominal</span></div>

            <div className="ax-sl-row"><span>Potongan Makan ({salary.totalMealCount}x @ {formatRupiah(salary.mealRate)})</span><b className="neg">-{formatRupiah(salary.totalMealDeduction)}</b></div>
            <div className="ax-sl-row"><span>Potongan Mess/Housing</span><b className="neg">-{formatRupiah(salary.housingDeduction)}</b></div>
            <div className="ax-sl-row"><span>BPJS Ketenagakerjaan JHT (2%)</span><b className="neg">-{formatRupiah(salary.bpjsJhtEmp)}</b></div>
            <div className="ax-sl-row"><span>BPJS Ketenagakerjaan JP (1%)</span><b className="neg">-{formatRupiah(salary.bpjsJpEmp)}</b></div>
            <div className="ax-sl-row"><span>BPJS Kesehatan (1%)</span><b className="neg">-{formatRupiah(salary.bpjsKesEmp)}</b></div>

            <div className="ax-sl-box tax">
              <div className="ax-sl-row" style={{ padding: 0, borderBottom: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 }}><ShieldCheck className="w-4 h-4" />PPh 21 TER otomatis ({salary.terRate}%)</span>
                <b className="neg">-{formatRupiah(salary.terTaxAmount)}</b>
              </div>
              <div className="ax-sl-sub">
                <div><span>Status PTKP: {salary.ptkpStatus} (kategori {salary.terCategory})</span><span>DJP PP 58/2023</span></div>
              </div>
            </div>

            <div className="ax-sl-row sum"><span>Total Potongan</span><b className="neg">-{formatRupiah(salary.totalDeductions)}</b></div>
          </div>

          {/* 3. TAKE HOME PAY */}
          <div className="ax-thp">
            <span>Estimasi pendapatan bersih (take home pay)</span>
            <b>{formatRupiah(salary.netSalary)}</b>
            <small>Penerimaan kas ({formatRupiah(salary.cashIncome)}) dikurangi total potongan ({formatRupiah(salary.totalDeductions)})</small>
          </div>

          {/* 4. JADWAL GAJIAN & AKSI */}
          <div className="ax-sl-box">
            <div className="ax-sl-row" style={{ padding: 0, borderBottom: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 }}><CalendarCheck className="w-4 h-4" style={{ color: 'var(--accent-sand)' }} />Tanggal gajian</span>
              <b>{salary.paydayDate}</b>
            </div>

            {salary.isPaydayAdjusted && (
              <div className="ax-warn" style={{ marginTop: 8 }}>
                <Zap className="w-4 h-4" />
                <span><b>Penyesuaian akhir pekan aktif: </b>tanggal 28 jatuh pada akhir pekan ({salary.paydayOriginalDate}). Sesuai kebijakan payroll, transfer gajian <b>dimajukan ke hari Jumat ({salary.paydayDate})</b>.</span>
              </div>
            )}

            <p className="ax-fieldhint" style={{ margin: '8px 0 0' }}>
              {payrollAuto.enabled
                ? 'Otomasi gaji aktif: take home pay masuk otomatis pada tanggal gajian (atur rekeningnya di Pengaturan).'
                : 'Otomasi gaji nonaktif. Aktifkan di Pengaturan bila ingin gaji masuk otomatis ke rekening.'}
            </p>
            <p className="ax-fieldhint" style={{ margin: '4px 0 0' }}>
              Slip ini diarsipkan otomatis saat Anda pindah periode atau setelah tanggal tutup buku (tgl 20), dan tetap bisa diedit.
            </p>
          </div>
        </section>

      </div>

      {/* ===================================================================== */}
      {/* 3. ARSIP RIWAYAT GAJI BULANAN                                         */}
      {/* ===================================================================== */}
      <SalaryHistorySection
        items={salaryHistories as unknown as HistoryItem[]}
        isLoading={isLoadingHistory}
        deletingId={deletingHistoryId}
        formatRupiah={formatRupiah}
        formatPeriodLabel={formatPeriodLabel}
        formatTimestamp={formatHistoryTimestamp}
        onRefresh={() => {}}
        onOpen={handleSelectHistoryPeriod}
        onDelete={handleDeleteHistory}
      />

      {/* ===================================================================== */}
      {/* 4. MODAL POP-UP EDIT HARI (INPUT LEMBUR & CEKLIS MAKAN)                */}
      {/* ===================================================================== */}
      {editingDay && (
        <EditDayModal
          dayNumber={editingDay.dayNumber}
          dayName={editingDay.dayName}
          date={editingDay.date}
          holidayName={editingDay.holidayName}
          shiftLabel={editDayType}
          onShift={(label, isWork) => { setEditDayType(label); setEditDayIsWork(isWork); }}
          ot={editDayOT} onOt={setEditDayOT}
          otIndex={calculateDailyOvertimeAmount(parseFloat(editDayOT) || 0, getDayType(editingDay.date, editDayType, mergedHolidays).dayType, otBaseRate).index}
          meals={editDayMeals} onMeals={setEditDayMeals}
          note={editDayNote} onNote={setEditDayNote}
          onSubmit={handleSaveDayModal}
          onClose={() => setEditingDay(null)}
        />
      )}

      {/* ===================================================================== */}
      {/* 5. MODAL PENGATURAN KHUSUS MODUL GAJI, AUTO OT & TANGGAL MERAH        */}
      {/* ===================================================================== */}
      {isSalarySettingsModalOpen && (
        <SalarySettingsModal
          group={selectedGroup} onGroup={(g) => setSelectedGroup(g as ShiftGroup)}
          mealRate={mealRate} onMealRate={setMealRate}
          ptkp={ptkpStatus} onPtkp={(v) => setPtkpStatus(v as PTKPStatus)}
          ptkpOptions={PTKP_OPTIONS}
          custom={customSalarySettings}
          onCustom={(key, v) => setCustomSalarySettings({ ...customSalarySettings, [key]: v })}
          autoOT={isAutoOTEnabled} onAutoOT={setIsAutoOTEnabled}
          payrollEnabled={payrollAuto.enabled} onPayrollEnabled={(v) => setPayrollStored({ ...payrollAuto, enabled: v })}
          payrollAccountId={payrollAuto.accountId} onPayrollAccount={(id) => setPayrollStored({ ...payrollAuto, accountId: id })}
          accounts={accounts}
          autoOTHours={autoOTPerSunday} onAutoOTHours={setAutoOTPerSunday}
          year={currentYear}
          holidayCount={activeYearHolidays.length}
          isSyncing={isSyncingHolidays} onSync={handleSyncHolidays}
          newDate={newHolidayDate} onNewDate={setNewHolidayDate}
          newName={newHolidayName} onNewName={setNewHolidayName}
          onAddHoliday={handleAddCustomHoliday}
          holidays={activeYearHolidays.map(([date, desc]) => ({ date, desc, custom: Boolean(customHolidays[date]) }))}
          onDeleteHoliday={handleDeleteCustomHoliday}
          onSubmit={handleSaveSalarySettings}
          onClose={() => setIsSalarySettingsModalOpen(false)}
        />
      )}

      {/* ===================================================================== */}
      {/* 6. MODAL TAMBAH / EDIT KOMPONEN TAMBAHAN GAJI (BONUS / THR / DLL)     */}
      {/* ===================================================================== */}
      {isAddOnModalOpen && (
        <AddOnModal
          editing={Boolean(editingAddOnId)}
          name={addOnName} onName={setAddOnName}
          amount={addOnAmount} onAmount={setAddOnAmount} onAmountBlur={handleAddOnAmountBlur}
          calcNotice={addOnCalcNotice}
          note={addOnNote} onNote={setAddOnNote}
          onSubmit={handleSaveAddOnModal}
          onClose={() => setIsAddOnModalOpen(false)}
        />
      )}

    </div>
  );
};