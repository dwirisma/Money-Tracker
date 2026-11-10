import React, { useState, useRef } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  Eye, 
  EyeOff, 
  Moon, 
  Sun, 
  CheckCircle2, 
  AlertCircle,
  FileJson
} from 'lucide-react';
import { useUI } from '../context/UIContext';
import { NeoButton, NeoCard } from './ui/Neo';

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-t-2 border-[var(--border-subtle)] first:border-t-0">
      <div className="min-w-0">
        <div className="font-bold text-sm text-[var(--text-primary)]">{title}</div>
        <div className="text-xs text-[var(--text-secondary)]">{hint}</div>
      </div>
      {children}
    </div>
  );
}

export function SettingsPage() {
  const { theme, privacy, toggleTheme, togglePrivacy } = useUI();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Menghitung ringkasan data yang tersimpan di localStorage
  const dataSummary = React.useMemo(() => {
    let keyCount = 0;
    let approxSizeKb = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('artha_')) {
          keyCount++;
          const val = localStorage.getItem(k) || '';
          approxSizeKb += (k.length + val.length) * 2 / 1024;
        }
      }
    } catch {
      // ignore
    }
    return { keyCount, sizeKb: approxSizeKb.toFixed(1) };
  }, [backupStatus]);

  // Fungsi Export / Unduh Backup Database JSON
  const handleExportBackup = () => {
    try {
      const backupPayload: Record<string, any> = {
        meta: {
          app: 'Artha Wealth Management OS',
          version: '2.0.0',
          exportedAt: new Date().toISOString()
        },
        data: {}
      };

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('artha_') || key === 'theme' || key === 'privacy')) {
          try {
            backupPayload.data[key] = JSON.parse(localStorage.getItem(key) || '""');
          } catch {
            backupPayload.data[key] = localStorage.getItem(key);
          }
        }
      }

      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const nowStr = new Date().toISOString().split('T')[0];
      const link = document.createElement('a');
      link.href = url;
      link.download = `artha-database-backup-${nowStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setBackupStatus({
        type: 'success',
        message: `Cadangan database berhasil diunduh (${Object.keys(backupPayload.data).length} entitas data tersimpan).`
      });
    } catch (err) {
      console.error('Gagal mengekspor data cadangan:', err);
      setBackupStatus({
        type: 'error',
        message: 'Gagal membuat file cadangan JSON. Silakan coba lagi.'
      });
    }
  };

  // Fungsi Impor / Pulihkan Database JSON
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        if (!parsed || typeof parsed !== 'object' || !parsed.data) {
          throw new Error('Format file cadangan tidak valid (hilang data payload).');
        }

        const confirmRestore = window.confirm(
          `Pulihkan data dari cadangan tanggal ${parsed.meta?.exportedAt ? new Date(parsed.meta.exportedAt).toLocaleDateString('id-ID') : 'tidak diketahui'}? Seluruh data yang ada saat ini akan digantikan dengan data cadangan ini.`
        );

        if (!confirmRestore) {
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        // Terapkan data ke localStorage
        Object.entries(parsed.data).forEach(([key, val]) => {
          if (typeof val === 'string') {
            localStorage.setItem(key, val);
          } else {
            localStorage.setItem(key, JSON.stringify(val));
          }
        });

        setBackupStatus({
          type: 'success',
          message: 'Data berhasil dipulihkan! Aplikasi akan dimuat ulang untuk memperbarui tampilan.'
        });

        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } catch (err) {
        console.error('Gagal memulihkan database:', err);
        setBackupStatus({
          type: 'error',
          message: 'File cadangan JSON rusak atau tidak valid. Pemulihan dibatalkan.'
        });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-heading font-bold text-2xl text-[var(--text-primary)]">Pengaturan Umum</h2>
        <p className="text-sm text-[var(--text-secondary)]">Tampilan antarmuka dan pencadangan database offline.</p>
      </div>

      {/* 1. Pengaturan Tampilan */}
      <NeoCard className="p-4">
        <h3 className="font-heading font-bold mb-1 text-[var(--text-primary)]">Tampilan</h3>
        <Row title="Tema" hint={theme === 'dark' ? 'Gelap (Dark Charcoal)' : 'Terang (Krem Sand Pastel)'}>
          <NeoButton onClick={toggleTheme} className="flex items-center gap-2 text-xs">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === 'dark' ? 'Pakai Terang' : 'Pakai Gelap'}
          </NeoButton>
        </Row>
        <Row title="Mode Privasi" hint="Menyensor semua nominal menjadi Rp •••••••">
          <NeoButton onClick={togglePrivacy} aria-pressed={privacy} className="flex items-center gap-2 text-xs">
            {privacy ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {privacy ? 'Tampilkan' : 'Sembunyikan'}
          </NeoButton>
        </Row>
      </NeoCard>

      {/* 2. Cadangkan & Pulihkan Database (JSON) */}
      <NeoCard className="p-4 space-y-4">
        <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-2.5">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-[var(--accent-sand)]" />
            <div>
              <h3 className="font-heading font-bold text-[var(--text-primary)]">
                Cadangkan & Pulihkan Database
              </h3>
              <p className="text-xs text-[var(--text-secondary)] font-mono">
                Format file cadangan JSON mandiri untuk keamanan data offline Anda
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
            {dataSummary.keyCount} Tabel ({dataSummary.sizeKb} KB)
          </span>
        </div>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Simpan seluruh data buku kas, rekening, transaksi, target tabungan, tagihan, serta pengaturan kalender shift ke dalam file <strong>JSON</strong> di perangkat Anda. Anda dapat mengunduh berkas cadangan kapan saja atau memulihkannya ke peramban lain.
        </p>

        {/* Notifikasi Status Backup / Restore */}
        {backupStatus && (
          <div className={`p-3 rounded-[var(--radius-sm)] border-2 text-xs font-mono flex items-center gap-2 ${
            backupStatus.type === 'success'
              ? 'bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border-[var(--accent-sage)]'
              : 'bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] border-[var(--accent-terracotta)]'
          }`}>
            {backupStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{backupStatus.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Tombol Unduh Cadangan JSON */}
          <div className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] space-y-2">
            <div className="flex items-center gap-2 text-xs font-heading font-bold text-[var(--text-primary)]">
              <Download className="w-4 h-4 text-[var(--accent-sand)]" />
              <span>Cadangkan Data (Export)</span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Unduh seluruh database ke file JSON lokal sebagai arsip aman.
            </p>
            <NeoButton 
              accent="sand" 
              onClick={handleExportBackup} 
              className="w-full text-xs font-bold flex items-center justify-center gap-1.5 py-2 !shadow-[2px_2px_0px_#000]"
            >
              <FileJson className="w-3.5 h-3.5 text-black" />
              <span className="text-black">Unduh Cadangan JSON</span>
            </NeoButton>
          </div>

          {/* Tombol Pulihkan Data JSON */}
          <div className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] space-y-2">
            <div className="flex items-center gap-2 text-xs font-heading font-bold text-[var(--text-primary)]">
              <Upload className="w-4 h-4 text-[var(--accent-blue)]" />
              <span>Pulihkan Data (Import)</span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Pilih file JSON cadangan untuk memulihkan seluruh data buku kas.
            </p>
            <input 
              ref={fileInputRef} 
              type="file" 
              accept=".json,application/json" 
              className="hidden" 
              onChange={handleImportBackup} 
            />
            <NeoButton 
              accent="blue" 
              onClick={() => fileInputRef.current?.click()} 
              className="w-full text-xs font-bold flex items-center justify-center gap-1.5 py-2 !shadow-[2px_2px_0px_#000]"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Pilih File JSON</span>
            </NeoButton>
          </div>
        </div>
      </NeoCard>
    </div>
  );
}
