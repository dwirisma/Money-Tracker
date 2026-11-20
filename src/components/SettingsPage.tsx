import React, { useRef, useState } from 'react';
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
} from 'lucide-react';
import { useUI } from '../context/UIContext';
import { useAuth } from '../context/AuthContext';
import { ARTHA_USER_DOC_ID, IS_SANDBOX_MODE } from '../config/firebase';
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

export function SettingsPage() {
  const { theme, privacy, toggleTheme, togglePrivacy } = useUI();
  const { displayUserId, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
              <span className="px-2.5 py-0.5 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--accent-sand)] text-[#14141a] shadow-[2px_2px_0px_var(--border-color)] font-mono text-[11px] font-bold inline-flex items-center gap-1">
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
              <span className="ax-ic" style={{ background: 'var(--accent-sand)' }}>
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
                <i style={{ background: '#1f1f27' }} />
                <div style={{ background: '#16161c' }}>
                  <b style={{ background: '#ffc933' }} />
                  <b style={{ background: '#292933', width: '70%' }} />
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

      {/* PANEL SANDBOX / DATA DUMMY (HANYA MUNCUL DI PREVIEW / LOCALHOST) */}
      {IS_SANDBOX_MODE && (
        <section className="ax-panel">
          <div className="ax-ph">
            <h3>
              <span className="ax-ic" style={{ background: 'var(--accent-sand)' }}>
                <FlaskConical className="w-3.5 h-3.5" />
              </span>
              SANDBOX / DUMMY MODE
            </h3>
            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded border border-[var(--border-color)] bg-[var(--accent-sand)] text-[#14141a]">
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
            <div className="mt-3 p-3.5 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-[3px_3px_0px_var(--border-color)] flex flex-wrap items-center justify-between gap-3">
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
              className={`mt-3 p-3.5 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] shadow-[3px_3px_0px_var(--border-color)] flex items-start justify-between gap-2 ${
                sandboxNotice.type === 'success'
                  ? 'bg-[var(--accent-sage)] text-[#14141a]'
                  : 'bg-[var(--accent-terracotta)] text-white'
              }`}
            >
              <div className="flex items-start gap-2">
                {sandboxNotice.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
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
                className="p-1 rounded border border-current/40 hover:bg-black/10 shrink-0"
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
            <span className="ax-ic" style={{ background: 'var(--accent-sky)' }}>
              <Database className="w-3.5 h-3.5" />
            </span>
            Backup &amp; Restore Data (.json)
          </h3>
          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
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
          <div className="mt-4 p-3.5 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--accent-sage)] text-[#14141a] shadow-[3px_3px_0px_var(--border-color)] space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
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
                className="p-1 rounded border border-[#14141a]/40 hover:bg-black/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {Object.keys(downloadResult.countsByCollection).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(downloadResult.countsByCollection).map(([col, count]) => (
                  <span
                    key={col}
                    className="text-[11px] font-mono font-bold px-2 py-0.5 rounded border border-[#14141a] bg-white/80 text-[#14141a]"
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
          <div className="mt-4 p-4 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-[3px_3px_0px_var(--border-color)] space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--accent-sand)] text-[#14141a] flex items-center justify-center shrink-0">
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
                  className="p-1.5 rounded-[var(--radius-sm)] border border-[var(--border-color)] text-[var(--text-muted)] hover:bg-[var(--bg-card)]"
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
                  className="px-2.5 py-2 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] flex items-center justify-between gap-2"
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

            <div className="flex items-start gap-2 p-2.5 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] text-xs text-[var(--text-secondary)]">
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
                <div className="w-full h-3 rounded-full border-2 border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
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
          <div className="mt-4 p-3.5 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--accent-sage)] text-[#14141a] shadow-[3px_3px_0px_var(--border-color)] space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
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
                className="p-1 rounded border border-[#14141a]/40 hover:bg-black/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(restoreResult.countsByCollection).map(([col, count]) => (
                <span
                  key={col}
                  className="text-[11px] font-mono font-bold px-2 py-0.5 rounded border border-[#14141a] bg-white/80 text-[#14141a]"
                >
                  {COLLECTION_LABELS[col] || col}: {count}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* NOTIFIKASI GAGAL */}
        {restoreError && (
          <div className="mt-4 p-3.5 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] bg-[var(--accent-terracotta)] text-white shadow-[3px_3px_0px_var(--border-color)] flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-heading font-bold text-sm">Gagal Memproses Restore Backup</p>
                <p className="text-xs opacity-95 mt-0.5 leading-relaxed">{restoreError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRestoreError(null)}
              aria-label="Tutup pesan error"
              className="p-1 rounded border border-white/40 hover:bg-black/15 shrink-0"
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
            <span className="ax-ic" style={{ background: 'var(--accent-sage)' }}>
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
