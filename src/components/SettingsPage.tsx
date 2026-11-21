import React, { useEffect, useRef, useState } from 'react';
import {
  Cloud,
  Eye,
  EyeOff,
  Sun,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  Upload,
  Download,
  FileJson,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
  Database,
  FlaskConical,
  Sparkles,
  Trash2,
  Cpu,
  Clock,
  ImageDown,
  Zap,
  Gauge,
  RotateCcw,
} from 'lucide-react';
import { useUI } from '../context/UIContext';
import { useAuth } from '../context/AuthContext';
import { ARTHA_USER_DOC_ID, IS_SANDBOX_MODE } from '../config/firebase';
import {
  AI_TRACKED_MODELS,
  createDefaultAiUsage,
  resetAiUsageToday,
  subscribeAiUsage,
  updateAiUsageLimits,
  type AiCacheDurationMinutes,
  type AiFocusStyle,
  type AiInsightMode,
  type AiPrimaryModel,
  type AiSettings,
  type AiUsageRecord,
} from '../services/settingsService';
import {
  COLLECTION_LABELS,
  downloadCloudBackupJson,
  executeBackupRestore,
  parseBackupJson,
  type BackupDownloadResult,
  type ParsedBackupPlan,
  type RestoreProgress,
  type RestoreResult,
} from '../services/backupRestoreService';
import {
  resetSandboxDummyData,
  seedSandboxDummyData,
  type SandboxSeedResult,
} from '../services/sandboxDataService';

const INSIGHT_MODE_OPTIONS: Array<{
  value: AiInsightMode;
  title: string;
  desc: string;
  badge?: string;
}> = [
  {
    value: 'manual',
    title: 'Manual (Klik Ikon — Hemat Kuota)',
    desc: 'Hanya memanggil Gemini saat tombol ikon refresh di Dashboard diklik.',
    badge: 'Default',
  },
  {
    value: 'auto',
    title: 'Otomatis saat Buka Dashboard',
    desc: 'Berjalan otomatis saat Dashboard dimuat dan tetap mematuhi durasi cache.',
  },
  {
    value: 'off',
    title: 'Nonaktif (Statistik Lokal Saja)',
    desc: 'Tidak pernah memanggil Gemini API di Dashboard & menyembunyikan tombol refresh AI.',
  },
];

const FOCUS_STYLE_OPTIONS: Array<{
  value: AiFocusStyle;
  title: string;
  desc: string;
}> = [
  {
    value: 'ringkas',
    title: 'Ringkas & Praktis',
    desc: 'Poin singkat, santai, langsung pada aksi nyata harian.',
  },
  {
    value: 'hemat',
    title: 'Ketat & Audit Kebocoran',
    desc: 'Tajam mendeteksi pemborosan dan peluang pemangkasan biaya.',
  },
  {
    value: 'tabungan',
    title: 'Fokus Target & Arus Kas',
    desc: 'Prioritas rasio tabungan, Sinking Fund, dan surplus bulanan.',
  },
];

export function SettingsPage() {
  const { theme, privacy, aiSettings, toggleTheme, togglePrivacy, updateAiSettings } = useUI();
  const { displayUserId, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // State indikator penyimpanan Pengaturan AI (Gemini) ke Cloud Firestore
  const [aiSaveStatus, setAiSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [aiSaveError, setAiSaveError] = useState<string | null>(null);
  const aiSaveTimerRef = useRef<number | null>(null);

  // State Pelacak Estimasi Kuota Harian Gemini API (`users/{ARTHA_USER_DOC_ID}/settings/aiUsage`)
  const [aiUsage, setAiUsage] = useState<AiUsageRecord>(() => createDefaultAiUsage());
  const [limitInputs, setLimitInputs] = useState<Record<AiPrimaryModel, string>>({
    'gemini-3.1-flash-lite': String(createDefaultAiUsage().limits['gemini-3.1-flash-lite']),
    'gemini-4-hydrogen': String(createDefaultAiUsage().limits['gemini-4-hydrogen']),
  });
  const [isResettingUsage, setIsResettingUsage] = useState(false);

  useEffect(() => {
    const unsub = subscribeAiUsage(ARTHA_USER_DOC_ID, (record) => {
      setAiUsage(record);
      setLimitInputs({
        'gemini-3.1-flash-lite': String(record.limits['gemini-3.1-flash-lite']),
        'gemini-4-hydrogen': String(record.limits['gemini-4-hydrogen']),
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    return () => {
      if (aiSaveTimerRef.current) {
        window.clearTimeout(aiSaveTimerRef.current);
      }
    };
  }, []);

  const flashAiSaved = () => {
    setAiSaveStatus('saved');
    if (aiSaveTimerRef.current) {
      window.clearTimeout(aiSaveTimerRef.current);
    }
    aiSaveTimerRef.current = window.setTimeout(() => {
      setAiSaveStatus('idle');
    }, 2200);
  };

  const handleAiSettingChange = async (partial: Partial<AiSettings>) => {
    setAiSaveStatus('saving');
    setAiSaveError(null);
    if (aiSaveTimerRef.current) {
      window.clearTimeout(aiSaveTimerRef.current);
    }
    try {
      await updateAiSettings(partial);
      flashAiSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan pengaturan AI ke Cloud Firestore.';
      setAiSaveStatus('error');
      setAiSaveError(msg);
    }
  };

  const handleCommitUsageLimit = async (model: AiPrimaryModel) => {
    const raw = limitInputs[model].trim();
    const parsed = Math.round(Number(raw));
    if (!Number.isFinite(parsed) || parsed < 1) {
      setLimitInputs((prev) => ({ ...prev, [model]: String(aiUsage.limits[model]) }));
      return;
    }
    const clamped = Math.min(1_000_000, parsed);
    if (clamped === aiUsage.limits[model]) {
      setLimitInputs((prev) => ({ ...prev, [model]: String(clamped) }));
      return;
    }
    setAiSaveStatus('saving');
    setAiSaveError(null);
    try {
      await updateAiUsageLimits(ARTHA_USER_DOC_ID, { [model]: clamped });
      flashAiSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui batas kuota harian AI.';
      setAiSaveStatus('error');
      setAiSaveError(msg);
    }
  };

  const handleResetAiUsageToday = async () => {
    if (isResettingUsage) return;
    setIsResettingUsage(true);
    setAiSaveStatus('saving');
    setAiSaveError(null);
    try {
      await resetAiUsageToday(ARTHA_USER_DOC_ID);
      flashAiSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mereset hitungan kuota hari ini.';
      setAiSaveStatus('error');
      setAiSaveError(msg);
    } finally {
      setIsResettingUsage(false);
    }
  };

  // State Download & Restore Backup (.json) <-> Cloud Firestore (users/user_artha)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const [downloadResult, setDownloadResult] = useState<BackupDownloadResult | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [pendingPlan, setPendingPlan] = useState<ParsedBackupPlan | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgress | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // State Sandbox Dummy Data Generator & Reset (khusus IS_SANDBOX_MODE)
  const [isSeedingSandbox, setIsSeedingSandbox] = useState(false);
  const [isResettingSandbox, setIsResettingSandbox] = useState(false);
  const [confirmResetSandbox, setConfirmResetSandbox] = useState(false);
  const [sandboxNotice, setSandboxNotice] = useState<{ type: 'success' | 'error'; title: string; detail: string } | null>(null);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadBackup = async () => {
    if (isDownloadingBackup || isRestoring || isReadingFile) return;
    setIsDownloadingBackup(true);
    setRestoreError(null);
    setDownloadResult(null);
    try {
      const result = await downloadCloudBackupJson(ARTHA_USER_DOC_ID);
      setDownloadResult(result);
    } catch (err) {
      const rawMsg =
        err instanceof Error ? err.message : 'Gagal mengambil data backup dari Cloud Firestore.';
      let friendlyMsg = rawMsg;
      if (rawMsg.toLowerCase().includes('permission') || rawMsg.toLowerCase().includes('missing or insufficient')) {
        friendlyMsg =
          'Izin baca ditolak oleh Firestore Rules (permission-denied). Pastikan Rules pada database (default) mengizinkan akses baca ke users/user_artha untuk pengguna yang sudah login.';
      }
      setRestoreError(friendlyMsg);
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  const handlePickBackupFile = () => {
    if (isRestoring || isReadingFile || isDownloadingBackup) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreError(null);
    setRestoreResult(null);
    setDownloadResult(null);
    setRestoreProgress(null);
    setPendingPlan(null);
    setSelectedFileName(file.name);
    setIsReadingFile(true);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const plan = parseBackupJson(text, ARTHA_USER_DOC_ID);
        setPendingPlan(plan);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal membaca struktur file backup JSON.';
        setRestoreError(msg);
      } finally {
        setIsReadingFile(false);
        resetFileInput();
      }
    };
    reader.onerror = () => {
      setRestoreError('Gagal membaca file dari perangkat. Silakan pilih ulang file .json Anda.');
      setIsReadingFile(false);
      resetFileInput();
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleCancelRestore = () => {
    if (isRestoring) return;
    setPendingPlan(null);
    setSelectedFileName('');
    setRestoreError(null);
    setRestoreProgress(null);
    resetFileInput();
  };

  const handleConfirmRestore = async () => {
    if (!pendingPlan || isRestoring) return;
    setIsRestoring(true);
    setRestoreError(null);
    setRestoreResult(null);

    try {
      const result = await executeBackupRestore(
        pendingPlan,
        (progress) => setRestoreProgress(progress),
        ARTHA_USER_DOC_ID
      );
      setRestoreResult(result);
      setPendingPlan(null);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Terjadi kesalahan saat mengunggah data backup ke Cloud Firestore.';
      let friendlyMsg = rawMsg;
      if (rawMsg.toLowerCase().includes('permission') || rawMsg.toLowerCase().includes('missing or insufficient')) {
        friendlyMsg =
          'Izin tulis ditolak oleh Firestore Rules (permission-denied). Pastikan Rules pada database (default) mengizinkan akses tulis ke users/user_artha untuk pengguna yang sudah login.';
      }
      setRestoreError(friendlyMsg);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSeedSandbox = async () => {
    if (!IS_SANDBOX_MODE || isSeedingSandbox || isResettingSandbox) return;
    setIsSeedingSandbox(true);
    setConfirmResetSandbox(false);
    setSandboxNotice(null);
    try {
      const res: SandboxSeedResult = await seedSandboxDummyData();
      setSandboxNotice({
        type: 'success',
        title: `Data Dummy Berhasil Diisi (${res.totalCreated} dokumen)`,
        detail: `${res.counts.ledgers} buku kas, ${res.counts.accounts} rekening, ${res.counts.transactions} transaksi, ${res.counts.bills} tagihan, ${res.counts.debts} utang, ${res.counts.goals} target, ${res.counts.automations} otomatisasi, dan ${res.counts.investments} investasi telah ditulis ke users/${ARTHA_USER_DOC_ID}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengisi data dummy ke Sandbox.';
      setSandboxNotice({
        type: 'error',
        title: 'Gagal Mengisi Data Dummy',
        detail: msg.toLowerCase().includes('permission')
          ? 'Izin tulis ke users/user_artha_sandbox ditolak. Pastikan firestore.rules pada database (default) mengizinkan akses ke users/user_artha_sandbox.'
          : msg,
      });
    } finally {
      setIsSeedingSandbox(false);
    }
  };

  const handleConfirmResetSandbox = async () => {
    if (!IS_SANDBOX_MODE || isResettingSandbox || isSeedingSandbox) return;
    setIsResettingSandbox(true);
    setSandboxNotice(null);
    try {
      const res = await resetSandboxDummyData();
      setConfirmResetSandbox(false);
      setSandboxNotice({
        type: 'success',
        title: 'Data Dummy Sandbox Dikosongkan',
        detail:
          res.totalDeleted > 0
            ? `${res.totalDeleted} dokumen di users/${ARTHA_USER_DOC_ID} telah dihapus. Data produksi users/user_artha tetap aman tidak tersentuh.`
            : `Jalur users/${ARTHA_USER_DOC_ID} sudah dalam kondisi bersih.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mereset data dummy Sandbox.';
      setSandboxNotice({
        type: 'error',
        title: 'Gagal Mereset Data Dummy',
        detail: msg.toLowerCase().includes('permission')
          ? 'Izin hapus pada users/user_artha_sandbox ditolak. Pastikan firestore.rules pada database (default) mengizinkan akses ke users/user_artha_sandbox.'
          : msg,
      });
    } finally {
      setIsResettingSandbox(false);
    }
  };

  return (
    <div className="ax-add">
      <div className="ax-pagehead">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2>Pengaturan</h2>
            {IS_SANDBOX_MODE && (
              <span className="px-2.5 py-0.5 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--accent-sand)] text-[#14141a] shadow-[2px_2px_0px_var(--border-color)] dark:border dark:border-[#E2B68E]/35 dark:bg-[#E2B68E]/15 dark:text-[#E2B68E] dark:shadow-none font-mono text-[11px] font-bold inline-flex items-center gap-1">
                <FlaskConical className="w-3.5 h-3.5" />
                SANDBOX / DUMMY MODE
              </span>
            )}
          </div>
          <p>Tampilan antarmuka, akun aktif, restore backup JSON, dan sinkronisasi real-time Cloud Firestore.</p>
        </div>
      </div>

      <div className="ax-dash">
        {/* TAMPILAN */}
        <section className="ax-b s6 ax-panel">
          <div className="ax-ph">
            <h3>
              <span className="ax-ic" style={{ background: 'var(--accent-sand)', '--c': 'var(--accent-sand)' } as React.CSSProperties}>
                <Sun className="w-3.5 h-3.5" />
              </span>
              Tampilan
            </h3>
          </div>
          <div className="ax-themes" role="group" aria-label="Pilih tema">
            <button
              type="button"
              className="ax-theme"
              aria-pressed={theme === 'light'}
              onClick={() => {
                if (theme !== 'light') toggleTheme();
              }}
            >
              <span className="ax-theme-pv" aria-hidden="true">
                <i style={{ background: '#c4ebd3' }} />
                <div style={{ background: '#fff4dc' }}>
                  <b style={{ background: '#ffc933' }} />
                  <b style={{ background: '#fff', width: '70%' }} />
                </div>
              </span>
              <span>
                Terang <em>{theme === 'light' ? 'Aktif' : 'Pilih'}</em>
              </span>
            </button>
            <button
              type="button"
              className="ax-theme"
              aria-pressed={theme === 'dark'}
              onClick={() => {
                if (theme !== 'dark') toggleTheme();
              }}
            >
              <span className="ax-theme-pv" aria-hidden="true">
                <i style={{ background: '#13151F' }} />
                <div style={{ background: '#0F1117' }}>
                  <b style={{ background: '#E2B68E' }} />
                  <b style={{ background: '#1F2333', width: '70%' }} />
                </div>
              </span>
              <span>
                Gelap <em>{theme === 'dark' ? 'Aktif' : 'Pilih'}</em>
              </span>
            </button>
          </div>
          <div className="ax-setrow">
            <div>
              <b>Mode privasi</b>
              <small>Menyensor semua nominal menjadi Rp •••••••</small>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={privacy}
              className="ax-sw"
              onClick={togglePrivacy}
            >
              <i />
              {privacy ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {privacy ? 'Aktif' : 'Mati'}
            </button>
          </div>
        </section>

        {/* AKUN & CLOUD SYNC */}
        <section className="ax-b s6 ax-panel ax-hero blue">
          <div className="ax-hero-head">
            <div className="ax-eyebrow" style={{ marginTop: 0 }}>
              <Cloud className="w-3.5 h-3.5" />
              Cloud Firestore Real-Time
            </div>
            <span className="ax-badge-s">AUTO SYNC</span>
          </div>
          <div
            className="ax-big"
            style={{ marginBottom: 6, fontSize: 'clamp(20px, 3vw, 28px)', wordBreak: 'break-word' }}
          >
            <UserIcon className="w-5 h-5 inline mr-2 -mt-1" />
            {displayUserId}
          </div>
          <p className="ax-note-h">
            Seluruh buku kas, rekening, transaksi, target, tagihan, investasi, gaji &amp; shift, serta
            preferensi Anda tersimpan aman di Cloud Firestore dan tersinkron otomatis di semua perangkat.
          </p>
        </section>
      </div>

      {/* PENGATURAN AI & KUOTA (GEMINI) */}
      <section className="ax-panel">
        <div className="ax-ph">
          <h3>
            <span className="ax-ic" style={{ background: 'var(--accent-lavender)', '--c': 'var(--accent-lavender)' } as React.CSSProperties}>
              <Cpu className="w-3.5 h-3.5" />
            </span>
            Pengaturan AI &amp; Kuota
          </h3>
          <div className="flex items-center gap-2">
            {aiSaveStatus === 'saving' && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded border border-[var(--border-color)] bg-[var(--accent-sand)] text-[#14141a] dark:border-[#E2B68E]/35 dark:bg-[#E2B68E]/15 dark:text-[#E2B68E]">
                <Loader2 className="w-3 h-3 animate-spin" />
                Menyimpan...
              </span>
            )}
            {aiSaveStatus === 'saved' && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded border border-[var(--border-color)] bg-[var(--accent-sage)] text-[#14141a] dark:border-[#34D399]/35 dark:bg-[#34D399]/15 dark:text-[#34D399]">
                <CheckCircle2 className="w-3 h-3" />
                Tersimpan di Cloud
              </span>
            )}
            {aiSaveStatus === 'idle' && (
              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] dark:border-white/[0.12] dark:bg-[#1F2333] dark:text-[#CBD5E1]">
                Gemini AI
              </span>
            )}
          </div>
        </div>

        {aiSaveError && (
          <div className="mt-3 p-3 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--accent-terracotta)] text-white dark:border dark:border-[#FB7185]/35 dark:bg-[#FB7185]/14 dark:text-[#F1F5F9] flex items-start justify-between gap-2 text-xs">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 dark:text-[#FB7185]" />
              <span>{aiSaveError}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setAiSaveError(null);
                setAiSaveStatus('idle');
              }}
              aria-label="Tutup pesan error pengaturan AI"
              className="p-0.5 rounded hover:bg-black/15 dark:hover:bg-white/10 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="space-y-4 mt-3">
          {/* 1. Mode Pemicu AI Insight */}
          <div className="space-y-2">
            <div>
              <b className="block text-sm font-heading font-extrabold text-[var(--text-primary)]">
                Mode Pemicu AI Insight
              </b>
              <small className="block text-xs text-[var(--text-secondary)]">
                Atur kapan kartu AI Insight di Dashboard memanggil Gemini API agar penggunaan kuota tetap terkendali.
              </small>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5" role="radiogroup" aria-label="Mode Pemicu AI Insight">
              {INSIGHT_MODE_OPTIONS.map((opt) => {
                const active = aiSettings.insightMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => void handleAiSettingChange({ insightMode: opt.value })}
                    className={`text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${
                      active
                        ? 'border-[var(--border-color)] bg-[var(--accent-sand)] text-[#14141a] shadow-[3px_3px_0_var(--border-color)] dark:border dark:border-[#E2B68E]/45 dark:bg-[#E2B68E]/14 dark:text-[#F1F5F9] dark:shadow-none'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--border-color)] dark:border dark:border-white/[0.08] dark:bg-[#1F2333] dark:hover:border-white/[0.16]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-heading font-extrabold text-xs leading-snug">{opt.title}</span>
                      {opt.badge && (
                        <span
                          className={`shrink-0 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            active
                              ? 'border-[#14141a] bg-white/80 text-[#14141a] dark:border-[#E2B68E]/40 dark:bg-[#E2B68E]/20 dark:text-[#E2B68E]'
                              : 'border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:border-white/[0.12] dark:bg-[#171924] dark:text-[#8B9A9F]'
                          }`}
                        >
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-1 text-[11.5px] leading-relaxed ${
                        active ? 'text-[#14141a]/85 dark:text-[#CBD5E1]' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2 & 4. Model Gemini Utama + Durasi Cache Analisis */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t-2 border-dashed border-[var(--border-subtle)] dark:border-t dark:border-white/[0.08]">
            <label className="block space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-heading font-extrabold text-[var(--text-primary)]">
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent-lavender)]" />
                Model Gemini Utama
              </span>
              <select
                value={aiSettings.primaryModel}
                onChange={(e) =>
                  void handleAiSettingChange({ primaryModel: e.target.value as AiPrimaryModel })
                }
                className="brutal-input w-full text-xs font-bold"
                aria-label="Pilih Model Gemini Utama"
              >
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Hemat Kuota &amp; Cepat - Default)</option>
                <option value="gemini-4-hydrogen">gemini-4-hydrogen (Analisis Mendalam)</option>
              </select>
              <span className="block text-[11px] text-[var(--text-secondary)]">
                Dipakai sebagai model prioritas untuk AI Insight Dashboard dan Scan Struk.
              </span>
            </label>

            <label className="block space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-heading font-extrabold text-[var(--text-primary)]">
                <Clock className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                Durasi Cache Analisis (Cooldown)
              </span>
              <select
                value={aiSettings.cacheDurationMinutes}
                onChange={(e) =>
                  void handleAiSettingChange({
                    cacheDurationMinutes: Number(e.target.value) as AiCacheDurationMinutes,
                  })
                }
                className="brutal-input w-full text-xs font-bold"
                aria-label="Pilih Durasi Cache Analisis"
              >
                <option value={10}>10 Menit (Default)</option>
                <option value={30}>30 Menit</option>
                <option value={60}>1 Jam</option>
                <option value={360}>6 Jam</option>
              </select>
              <span className="block text-[11px] text-[var(--text-secondary)]">
                Menyimpan hasil analisis sementara agar data yang sama tidak memakan kuota berulang kali.
              </span>
            </label>
          </div>

          {/* 5. Gaya Fokus Analisis AI */}
          <div className="space-y-2 pt-2 border-t-2 border-dashed border-[var(--border-subtle)] dark:border-t dark:border-white/[0.08]">
            <div>
              <b className="block text-sm font-heading font-extrabold text-[var(--text-primary)]">
                Gaya Fokus Analisis AI
              </b>
              <small className="block text-xs text-[var(--text-secondary)]">
                Tentukan sudut pandang rekomendasi yang dihasilkan oleh Gemini AI pada kartu AI Insight.
              </small>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5" role="radiogroup" aria-label="Gaya Fokus Analisis AI">
              {FOCUS_STYLE_OPTIONS.map((opt) => {
                const active = aiSettings.focusStyle === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => void handleAiSettingChange({ focusStyle: opt.value })}
                    className={`text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${
                      active
                        ? 'border-[var(--border-color)] bg-[var(--accent-sage)] text-[#14141a] shadow-[3px_3px_0_var(--border-color)] dark:border dark:border-[#34D399]/45 dark:bg-[#34D399]/14 dark:text-[#F1F5F9] dark:shadow-none'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--border-color)] dark:border dark:border-white/[0.08] dark:bg-[#1F2333] dark:hover:border-white/[0.16]'
                    }`}
                  >
                    <span className="block font-heading font-extrabold text-xs">{opt.title}</span>
                    <p
                      className={`mt-1 text-[11.5px] leading-relaxed ${
                        active ? 'text-[#14141a]/85 dark:text-[#CBD5E1]' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3 & 6. Toggles: Auto-Fallback Model & Kompresi Foto Scan Struk */}
          <div className="space-y-2 pt-2 border-t-2 border-dashed border-[var(--border-subtle)] dark:border-t dark:border-white/[0.08]">
            <div className="ax-setrow" style={{ marginTop: 0 }}>
              <div>
                <b className="inline-flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                  Auto-Fallback Model
                </b>
                <small>
                  Otomatis beralih ke model cadangan ({aiSettings.primaryModel === 'gemini-3.1-flash-lite' ? 'gemini-4-hydrogen' : 'gemini-3.1-flash-lite'}) saat model utama terkena error kuota <code>429</code>.
                </small>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={aiSettings.autoFallback}
                className="ax-sw"
                onClick={() => void handleAiSettingChange({ autoFallback: !aiSettings.autoFallback })}
              >
                <i />
                {aiSettings.autoFallback ? 'Aktif' : 'Mati'}
              </button>
            </div>

            <div className="ax-setrow" style={{ marginTop: 0 }}>
              <div>
                <b className="inline-flex items-center gap-1.5">
                  <ImageDown className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                  Kompresi Foto Scan Struk
                </b>
                <small>
                  Mengompresi resolusi &amp; ukuran gambar struk di perangkat sebelum dikirim ke AI agar proses lebih cepat dan hemat token.
                </small>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={aiSettings.compressReceiptImage}
                className="ax-sw"
                onClick={() =>
                  void handleAiSettingChange({ compressReceiptImage: !aiSettings.compressReceiptImage })
                }
              >
                <i />
                {aiSettings.compressReceiptImage ? 'Aktif' : 'Mati'}
              </button>
            </div>
          </div>

          {/* ESTIMASI KUOTA HARIAN (HARI INI) - REAL-TIME FIRESTORE `settings/aiUsage` */}
          <div className="space-y-3 pt-3 border-t-2 border-dashed border-[var(--border-subtle)] dark:border-t dark:border-white/[0.08]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <b className="inline-flex items-center gap-1.5 text-sm font-heading font-extrabold text-[var(--text-primary)]">
                  <Gauge className="w-4 h-4 text-[var(--accent-sage)]" />
                  Estimasi Kuota Harian (Hari Ini)
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] dark:border-white/[0.12] dark:bg-[#1F2333] dark:text-[#CBD5E1]">
                    {aiUsage.date}
                  </span>
                </b>
                <small className="block text-xs text-[var(--text-secondary)] mt-0.5">
                  Menghitung panggilan Gemini API nyata (respons dari cache tidak dihitung) dan reset otomatis setiap ganti hari.
                </small>
              </div>
              <button
                type="button"
                onClick={() => void handleResetAiUsageToday()}
                disabled={isResettingUsage}
                className="brutal-btn text-xs !py-1.5 !px-2.5 shrink-0"
              >
                {isResettingUsage ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                Reset Hitungan Hari Ini
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {AI_TRACKED_MODELS.map((model) => {
                const used = aiUsage.usage[model] ?? 0;
                const limit = Math.max(1, aiUsage.limits[model] ?? 1);
                const remaining = Math.max(0, limit - used);
                const isReached = Boolean(aiUsage.limitReached[model]);
                const pct = Math.min(100, Math.round((used / limit) * 100));
                const barColor =
                  isReached || pct >= 90
                    ? 'var(--accent-terracotta)'
                    : pct >= 70
                      ? 'var(--accent-sand)'
                      : 'var(--accent-sage)';
                const subtitle =
                  model === 'gemini-3.1-flash-lite'
                    ? 'Hemat Kuota & Cepat'
                    : 'Analisis Mendalam';

                return (
                  <div
                    key={model}
                    className="p-3 rounded-xl border-2 border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-[2px_2px_0_var(--border-color)] dark:border dark:border-white/[0.08] dark:bg-[#1F2333] dark:shadow-none space-y-2.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-extrabold text-[var(--text-primary)] break-all">
                            {model}
                          </span>
                          {aiSettings.primaryModel === model && (
                            <span className="font-mono text-[9.5px] font-bold px-1.5 py-0.5 rounded border border-[var(--border-color)] bg-[var(--accent-sand)] text-[#14141a] dark:border-[#E2B68E]/35 dark:bg-[#E2B68E]/16 dark:text-[#E2B68E]">
                              Utama
                            </span>
                          )}
                        </div>
                        <span className="block text-[11px] text-[var(--text-secondary)]">
                          {subtitle}
                        </span>
                      </div>

                      {isReached && (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded border-2 border-[var(--border-color)] bg-[var(--accent-terracotta)] text-white dark:border dark:border-[#FB7185]/35 dark:bg-[#FB7185]/16 dark:text-[#FB7185] shrink-0">
                          <AlertTriangle className="w-3 h-3" />
                          Limit 429 Tercapai Hari Ini
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-bold text-[var(--text-primary)]">
                          Terpakai: {used} / {limit} request (Sisa ±{remaining})
                        </span>
                        <span className="font-mono text-[11px] font-bold text-[var(--text-secondary)]">
                          {pct}%
                        </span>
                      </div>
                      <div
                        className="w-full h-3 rounded-full border-2 border-[var(--border-color)] bg-[var(--bg-surface)] dark:border dark:border-white/[0.08] dark:bg-white/[0.08] overflow-hidden"
                        role="progressbar"
                        aria-valuenow={used}
                        aria-valuemin={0}
                        aria-valuemax={limit}
                        aria-label={`Pemakaian kuota harian ${model}`}
                      >
                        <div
                          className="h-full transition-all duration-300"
                          style={{
                            width: `${isReached ? 100 : pct}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-dashed border-[var(--border-subtle)] dark:border-white/[0.08]">
                      <label
                        htmlFor={`ai-limit-${model}`}
                        className="text-[11px] font-semibold text-[var(--text-secondary)]"
                      >
                        Batas kuota / hari:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          id={`ai-limit-${model}`}
                          type="number"
                          min={1}
                          max={1000000}
                          value={limitInputs[model]}
                          onChange={(e) =>
                            setLimitInputs((prev) => ({ ...prev, [model]: e.target.value }))
                          }
                          onBlur={() => void handleCommitUsageLimit(model)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          className="brutal-input !w-24 !py-1 !px-2 text-right font-mono text-xs font-bold"
                          aria-label={`Batas kuota harian ${model}`}
                        />
                        <span className="font-mono text-[10.5px] text-[var(--text-secondary)]">
                          req
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* PANEL SANDBOX / DATA DUMMY (HANYA MUNCUL DI PREVIEW / LOCALHOST) */}
      {IS_SANDBOX_MODE && (
        <section className="ax-panel">
          <div className="ax-ph">
            <h3>
              <span className="ax-ic" style={{ background: 'var(--accent-sand)', '--c': 'var(--accent-sand)' } as React.CSSProperties}>
                <FlaskConical className="w-3.5 h-3.5" />
              </span>
              SANDBOX / DUMMY MODE
            </h3>
            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded border border-[var(--border-color)] bg-[var(--accent-sand)] text-[#14141a] dark:border-[#E2B68E]/35 dark:bg-[#E2B68E]/15 dark:text-[#E2B68E]">
              users/{ARTHA_USER_DOC_ID}
            </span>
          </div>

          <div className="ax-setrow" style={{ marginTop: 4 }}>
            <div>
              <b>Lingkungan Uji Coba Terisolasi (Data Produksi Aman)</b>
              <small>
                Aplikasi sedang berjalan di luar domain produksi (<code>artha-apps.vercel.app</code>). Semua
                perubahan hanya menulis ke <code>users/{ARTHA_USER_DOC_ID}</code> dan tidak menyentuh data asli{' '}
                <code>users/user_artha</code>.
              </small>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSeedSandbox}
                disabled={isSeedingSandbox || isResettingSandbox}
                className="brutal-btn brutal-btn-sand shrink-0"
              >
                {isSeedingSandbox ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {isSeedingSandbox ? 'Mengisi Data...' : 'Isi Data Dummy Contoh'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSandboxNotice(null);
                  setConfirmResetSandbox((v) => !v);
                }}
                disabled={isSeedingSandbox || isResettingSandbox}
                className="brutal-btn brutal-btn-terracotta shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                Reset Data Dummy
              </button>
            </div>
          </div>

          {confirmResetSandbox && (
            <div className="mt-3 p-3.5 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-[3px_3px_0px_var(--border-color)] dark:border dark:border-white/[0.10] dark:bg-[#1F2333] dark:shadow-none flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-xs text-[var(--text-primary)]">
                <AlertTriangle className="w-4 h-4 text-[var(--accent-terracotta)] shrink-0 mt-0.5" />
                <span>
                  Hapus seluruh data uji coba di <code className="font-mono font-bold">users/{ARTHA_USER_DOC_ID}</code>?
                  Data asli di <code className="font-mono">users/user_artha</code> tetap aman.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmResetSandbox(false)}
                  disabled={isResettingSandbox}
                  className="brutal-btn"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmResetSandbox}
                  disabled={isResettingSandbox}
                  className="brutal-btn brutal-btn-terracotta"
                >
                  {isResettingSandbox ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Menghapus...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Ya, Kosongkan Sandbox
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {sandboxNotice && (
            <div
              className={`mt-3 p-3.5 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] shadow-[3px_3px_0px_var(--border-color)] dark:border dark:shadow-none flex items-start justify-between gap-2 ${
                sandboxNotice.type === 'success'
                  ? 'bg-[var(--accent-sage)] text-[#14141a] dark:border-[#34D399]/35 dark:bg-[#34D399]/14 dark:text-[#F1F5F9]'
                  : 'bg-[var(--accent-terracotta)] text-white dark:border-[#FB7185]/35 dark:bg-[#FB7185]/14 dark:text-[#F1F5F9]'
              }`}
            >
              <div className="flex items-start gap-2">
                {sandboxNotice.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 dark:text-[#34D399]" />
                ) : (
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 dark:text-[#FB7185]" />
                )}
                <div>
                  <p className="font-heading font-bold text-sm">{sandboxNotice.title}</p>
                  <p className="text-xs opacity-95 mt-0.5 leading-relaxed">{sandboxNotice.detail}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSandboxNotice(null)}
                aria-label="Tutup notifikasi sandbox"
                className="p-1 rounded border border-current/40 hover:bg-black/10 dark:border-white/20 dark:hover:bg-white/10 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </section>
      )}

      {/* BACKUP & RESTORE DATA (.JSON) */}
      <section className="ax-panel">
        <div className="ax-ph">
          <h3>
            <span className="ax-ic" style={{ background: 'var(--accent-blue)', '--c': 'var(--accent-blue)' } as React.CSSProperties}>
              <Database className="w-3.5 h-3.5" />
            </span>
            Backup &amp; Restore Data (.json)
          </h3>
          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] dark:border-white/[0.12] dark:bg-[#1F2333] dark:text-[#CBD5E1]">
            users/{ARTHA_USER_DOC_ID}
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Pilih file backup JSON"
        />

        <div className="ax-setrow" style={{ marginTop: 4 }}>
          <div>
            <b>Cadangkan &amp; Pulihkan Data Cloud Firestore</b>
            <small>
              Unduh seluruh data terbaru dari <code>users/{ARTHA_USER_DOC_ID}</code> ke satu file{' '}
              <code>.json</code>, atau unggah file backup lama (termasuk format <code>artha_offline_*</code>)
              untuk dipulihkan langsung ke Cloud.
            </small>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadBackup}
              disabled={isDownloadingBackup || isReadingFile || isRestoring}
              className="brutal-btn shrink-0"
            >
              {isDownloadingBackup ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isDownloadingBackup ? 'Menyiapkan Backup...' : 'Download Backup (.json)'}
            </button>
            <button
              type="button"
              onClick={handlePickBackupFile}
              disabled={isDownloadingBackup || isReadingFile || isRestoring}
              className="brutal-btn brutal-btn-primary shrink-0"
            >
              {isReadingFile ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {isReadingFile ? 'Membaca File...' : 'Restore Backup (.json)'}
            </button>
          </div>
        </div>

        {/* KONFIRMASI DOWNLOAD BACKUP BERHASIL */}
        {downloadResult && (
          <div className="mt-4 p-3.5 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--accent-sage)] text-[#14141a] shadow-[3px_3px_0px_var(--border-color)] dark:border dark:border-[#34D399]/35 dark:bg-[#34D399]/14 dark:text-[#F1F5F9] dark:shadow-none space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 dark:text-[#34D399]" />
                <div>
                  <p className="font-heading font-bold text-sm">
                    Backup Berhasil Diunduh ({downloadResult.totalDocuments} dokumen)
                  </p>
                  <p className="text-xs opacity-90 mt-0.5">
                    File <code className="font-mono font-bold">{downloadResult.fileName}</code> telah tersimpan di
                    perangkat Anda dan siap digunakan kembali kapan saja melalui tombol Restore Backup (.json).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDownloadResult(null)}
                aria-label="Tutup notifikasi download"
                className="p-1 rounded border border-[#14141a]/40 hover:bg-black/10 dark:border-white/20 dark:hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {Object.keys(downloadResult.countsByCollection).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(downloadResult.countsByCollection).map(([col, count]) => (
                  <span
                    key={col}
                    className="text-[11px] font-mono font-bold px-2 py-0.5 rounded border border-[#14141a] bg-white/80 text-[#14141a] dark:border-white/[0.14] dark:bg-[#171924] dark:text-[#CBD5E1]"
                  >
                    {COLLECTION_LABELS[col] || col}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* KONFIRMASI SEBELUM MENIMPA / MERGE KE FIRESTORE */}
        {pendingPlan && (
          <div className="mt-4 p-4 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-[3px_3px_0px_var(--border-color)] dark:border dark:border-white/[0.10] dark:bg-[#1F2333] dark:shadow-none space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--accent-sand)] text-[#14141a] dark:border dark:border-[#E2B68E]/35 dark:bg-[#E2B68E]/16 dark:text-[#E2B68E] flex items-center justify-center shrink-0">
                  <FileJson className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-heading font-bold text-sm text-[var(--text-primary)] truncate">
                    Konfirmasi Restore: {selectedFileName}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Ditemukan <strong className="text-[var(--text-primary)]">{pendingPlan.totalDocuments} dokumen</strong> siap ditulis ke{' '}
                    <code className="font-mono text-[11px]">users/{ARTHA_USER_DOC_ID}</code> (database{' '}
                    <code className="font-mono text-[11px]">(default)</code>).
                  </p>
                </div>
              </div>
              {!isRestoring && (
                <button
                  type="button"
                  onClick={handleCancelRestore}
                  aria-label="Batalkan restore"
                  className="p-1.5 rounded-[var(--radius-sm)] border border-[var(--border-color)] text-[var(--text-muted)] hover:bg-[var(--bg-card)] dark:border-white/[0.12] dark:hover:bg-[#262B3D]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Rincian koleksi yang terdeteksi */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {Object.entries(pendingPlan.countsByCollection).map(([col, count]) => (
                <div
                  key={col}
                  className="px-2.5 py-2 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] dark:border-white/[0.08] dark:bg-[#171924] flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-medium text-[var(--text-secondary)] truncate">
                    {COLLECTION_LABELS[col] || col}
                  </span>
                  <span className="font-mono text-xs font-bold text-[var(--text-primary)] shrink-0">
                    {count}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 p-2.5 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] dark:border-white/[0.08] dark:bg-[#171924] text-xs text-[var(--text-secondary)]">
              <AlertTriangle className="w-4 h-4 text-[var(--accent-terracotta)] shrink-0 mt-0.5" />
              <span>
                Dokumen dengan ID yang sama di Cloud Firestore akan digabungkan &amp; diperbarui (
                <code className="font-mono text-[11px]">merge: true</code>). Setelah selesai, seluruh halaman akan
                otomatis memperbarui data secara real-time.
              </span>
            </div>

            {/* Progress bar selama proses upload batch */}
            {isRestoring && restoreProgress && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Mengunggah batch {Math.max(1, restoreProgress.currentBatch)}/{restoreProgress.totalBatches}...
                  </span>
                  <span className="text-[var(--text-muted)]">
                    {restoreProgress.completedDocs}/{restoreProgress.totalDocs} ({restoreProgress.percent}%)
                  </span>
                </div>
                <div className="w-full h-3 rounded-full border-2 border-[var(--border-color)] bg-[var(--bg-card)] dark:border dark:border-white/[0.08] dark:bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent-sage)] transition-all duration-200"
                    style={{ width: `${Math.max(5, restoreProgress.percent)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCancelRestore}
                disabled={isRestoring}
                className="brutal-btn"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isRestoring}
                className="brutal-btn brutal-btn-primary"
              >
                {isRestoring ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan ke Cloud...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Ya, Restore {pendingPlan.totalDocuments} Dokumen
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* NOTIFIKASI SUKSES */}
        {restoreResult && (
          <div className="mt-4 p-3.5 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--accent-sage)] text-[#14141a] shadow-[3px_3px_0px_var(--border-color)] dark:border dark:border-[#34D399]/35 dark:bg-[#34D399]/14 dark:text-[#F1F5F9] dark:shadow-none space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 dark:text-[#34D399]" />
                <div>
                  <p className="font-heading font-bold text-sm">
                    Restore Backup Berhasil ({restoreResult.totalWritten} dokumen)
                  </p>
                  <p className="text-xs opacity-90 mt-0.5">
                    Seluruh data dari <strong>{selectedFileName}</strong> telah ditulis ke{' '}
                    <code className="font-mono">users/{restoreResult.targetUserDocId}</code> dalam{' '}
                    {restoreResult.totalBatches} batch dan otomatis tersinkron ke seluruh halaman.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRestoreResult(null)}
                aria-label="Tutup notifikasi sukses"
                className="p-1 rounded border border-[#14141a]/40 hover:bg-black/10 dark:border-white/20 dark:hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(restoreResult.countsByCollection).map(([col, count]) => (
                <span
                  key={col}
                  className="text-[11px] font-mono font-bold px-2 py-0.5 rounded border border-[#14141a] bg-white/80 text-[#14141a] dark:border-white/[0.14] dark:bg-[#171924] dark:text-[#CBD5E1]"
                >
                  {COLLECTION_LABELS[col] || col}: {count}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* NOTIFIKASI GAGAL */}
        {restoreError && (
          <div className="mt-4 p-3.5 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--accent-terracotta)] text-white shadow-[3px_3px_0px_var(--border-color)] dark:border dark:border-[#FB7185]/35 dark:bg-[#FB7185]/14 dark:text-[#F1F5F9] dark:shadow-none flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 dark:text-[#FB7185]" />
              <div>
                <p className="font-heading font-bold text-sm">Gagal Memproses Restore Backup</p>
                <p className="text-xs opacity-95 mt-0.5 leading-relaxed">{restoreError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRestoreError(null)}
              aria-label="Tutup pesan error"
              className="p-1 rounded border border-white/40 hover:bg-black/15 dark:border-white/20 dark:hover:bg-white/10 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </section>

      {/* SESI AKUN */}
      <section className="ax-panel">
        <div className="ax-ph">
          <h3>
            <span className="ax-ic" style={{ background: 'var(--accent-sage)', '--c': 'var(--accent-sage)' } as React.CSSProperties}>
              <ShieldCheck className="w-3.5 h-3.5" />
            </span>
            Sesi &amp; Keamanan Akun
          </h3>
        </div>
        <div className="ax-setrow" style={{ marginTop: 4 }}>
          <div>
            <b>Masuk sebagai: {displayUserId}</b>
            <small>
              Data Anda terisolasi khusus untuk akun ini. Keluar untuk berpindah akun atau mengakhiri sesi di
              perangkat ini.
            </small>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="brutal-btn brutal-btn-terracotta shrink-0"
          >
            <LogOut className="w-4 h-4" />
            {isLoggingOut ? 'Keluar...' : 'Keluar (Logout)'}
          </button>
        </div>
      </section>
    </div>
  );
}
