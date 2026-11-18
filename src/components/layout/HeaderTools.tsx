import { useEffect, useState } from 'react';
import { CalendarDays, Eye, EyeOff, Moon, Sun } from 'lucide-react';
import { useUI } from '../../context/UIContext';

function formatNow(d: Date) {
  const tgl = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return { tgl, jam };
}

/** Alat header desktop: tanggal & jam, mode privasi, dan tema. (Di mobile ada di menu sheet.) */
export function HeaderTools() {
  const { theme, privacy, toggleTheme, togglePrivacy } = useUI();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const { tgl, jam } = formatNow(now);

  return (
    <div className="ax-htools">
      <div className="ax-clock" aria-label={`${tgl}, ${jam}`}>
        <CalendarDays className="w-4 h-4" aria-hidden="true" />
        <div>
          <b>{tgl}</b>
          <small>{jam}</small>
        </div>
      </div>

      <button
        type="button"
        onClick={togglePrivacy}
        aria-pressed={privacy}
        aria-label={privacy ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
        title={privacy ? 'Mode privasi aktif: ketuk untuk tampilkan saldo' : 'Sembunyikan saldo'}
        className={`ax-hbtn ${privacy ? 'on' : ''}`}
      >
        {privacy ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
        title={theme === 'dark' ? 'Tema terang' : 'Tema gelap'}
        className="ax-hbtn"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    </div>
  );
}
