import React, { useState } from 'react';
import {
  Cloud,
  Eye,
  EyeOff,
  Sun,
  LogOut,
  User as UserIcon,
  ShieldCheck,
} from 'lucide-react';
import { useUI } from '../context/UIContext';
import { useAuth } from '../context/AuthContext';

export function SettingsPage() {
  const { theme, privacy, toggleTheme, togglePrivacy } = useUI();
  const { displayUserId, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="ax-add">
      <div className="ax-pagehead">
        <div>
          <h2>Pengaturan</h2>
          <p>Tampilan antarmuka, akun aktif, dan sinkronisasi real-time Cloud Firestore.</p>
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
