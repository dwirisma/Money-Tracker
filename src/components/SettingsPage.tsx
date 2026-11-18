import { toLocalDateStr } from '../utils/localDate';
import React, { useState, useRef } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  Eye, 
  EyeOff, 
  Sun, 
  CheckCircle2, 
  AlertCircle,
  FileJson
} from 'lucide-react';
import { useUI } from '../context/UIContext';
import { recordBackupTimestamp } from '../services/notificationService';

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
      const nowStr = toLocalDateStr(new Date());
      const link = document.createElement('a');
      link.href = url;
      link.download = `artha-database-backup-${nowStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      recordBackupTimestamp();

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
    <div className="ax-add">
      <div className="ax-pagehead">
        <div>
          <h2>Pengaturan</h2>
          <p>Tampilan antarmuka dan pencadangan database offline.</p>
        </div>
      </div>

      <div className="ax-dash">
        {/* TAMPILAN */}
        <section className="ax-b s6 ax-panel">
          <div className="ax-ph">
            <h3><span className="ax-ic" style={{ background: 'var(--accent-sand)' }}><Sun className="w-3.5 h-3.5" /></span>Tampilan</h3>
          </div>
          <div className="ax-themes" role="group" aria-label="Pilih tema">
            <button type="button" className="ax-theme" aria-pressed={theme === 'light'} onClick={() => { if (theme !== 'light') toggleTheme(); }}>
              <span className="ax-theme-pv" aria-hidden="true">
                <i style={{ background: '#c4ebd3' }} />
                <div style={{ background: '#fff4dc' }}><b style={{ background: '#ffc933' }} /><b style={{ background: '#fff', width: '70%' }} /></div>
              </span>
              <span>Terang <em>{theme === 'light' ? 'Aktif' : 'Pilih'}</em></span>
            </button>
            <button type="button" className="ax-theme" aria-pressed={theme === 'dark'} onClick={() => { if (theme !== 'dark') toggleTheme(); }}>
              <span className="ax-theme-pv" aria-hidden="true">
                <i style={{ background: '#1f1f27' }} />
                <div style={{ background: '#16161c' }}><b style={{ background: '#ffc933' }} /><b style={{ background: '#292933', width: '70%' }} /></div>
              </span>
              <span>Gelap <em>{theme === 'dark' ? 'Aktif' : 'Pilih'}</em></span>
            </button>
          </div>
          <div className="ax-setrow">
            <div>
              <b>Mode privasi</b>
              <small>Menyensor semua nominal menjadi Rp •••••••</small>
            </div>
            <button type="button" role="switch" aria-checked={privacy} className="ax-sw" onClick={togglePrivacy}>
              <i />{privacy ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}{privacy ? 'Aktif' : 'Mati'}
            </button>
          </div>
        </section>

        {/* RINGKASAN DATA */}
        <section className="ax-b s6 ax-panel ax-hero blue">
          <div className="ax-hero-head">
            <div className="ax-eyebrow" style={{ marginTop: 0 }}><Database className="w-3.5 h-3.5" />Data tersimpan di perangkat ini</div>
            <span className="ax-badge-s">JSON</span>
          </div>
          <div className="ax-big" style={{ marginBottom: 6 }}>{dataSummary.keyCount} <span style={{ fontSize: '.4em', opacity: .75 }}>tabel · {dataSummary.sizeKb} KB</span></div>
          <p className="ax-note-h">Buku kas, rekening, transaksi, target, tagihan, dan pengaturan kalender shift tersimpan lokal. Cadangkan secara berkala.</p>
        </section>
      </div>

      {/* CADANGAN & PEMULIHAN */}
      <section className="ax-panel">
        <div className="ax-ph">
          <h3><span className="ax-ic" style={{ background: 'var(--accent-blue)' }}><Database className="w-3.5 h-3.5" /></span>Cadangkan & pulihkan database</h3>
        </div>
        <p className="ax-sec-sub" style={{ marginBottom: 10 }}>
          Simpan seluruh data ke file <b>JSON</b> di perangkat Anda dan pulihkan kapan saja, termasuk di perangkat lain.
        </p>

        {backupStatus && (
          <div className={`ax-status ${backupStatus.type === 'success' ? 'ok' : 'err'}`} role="status" style={{ marginBottom: 10 }}>
            {backupStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{backupStatus.message}</span>
          </div>
        )}

        <div className="ax-bkgrid">
          <div className="ax-bk">
            <h4><Download className="w-4 h-4" />Cadangkan data (export)</h4>
            <p>Unduh seluruh database ke file JSON lokal sebagai arsip aman.</p>
            <button type="button" onClick={handleExportBackup} className="brutal-btn brutal-btn-sand">
              <FileJson className="w-4 h-4" />Unduh cadangan JSON
            </button>
          </div>
          <div className="ax-bk">
            <h4><Upload className="w-4 h-4" />Pulihkan data (import)</h4>
            <p>Pilih file JSON cadangan untuk memulihkan seluruh data. Data yang ada akan ditimpa.</p>
            <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportBackup} />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="brutal-btn brutal-btn-blue">
              <Upload className="w-4 h-4" />Pilih file JSON
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
