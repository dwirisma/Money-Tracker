import { useEffect, useState } from 'react';
import { Eye, EyeOff, Moon, Sun } from 'lucide-react';
import { useUI } from '../../context/UIContext';

function formatNow(d: Date) {
  const tgl = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return { tgl, jam };
}

export function HeaderTools() {
  const { theme, privacy, toggleTheme, togglePrivacy } = useUI();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const { tgl, jam } = formatNow(now);

  return (
    <div className="max-md:hidden flex items-center gap-1 sm:gap-2">
      <div className="max-lg:hidden text-right leading-tight mr-1">
        <div className="font-heading font-bold text-xs text-[var(--text-primary)]">{tgl}</div>
        <div className="font-mono text-[11px] text-[var(--text-secondary)]">{jam}</div>
      </div>
      <button
        type="button"
        onClick={togglePrivacy}
        aria-pressed={privacy}
        aria-label={privacy ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
        title={privacy ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
        className="brutal-btn !p-1.5 sm:!p-2 !shadow-[var(--shadow-sm)]"
      >
        {privacy ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
        title={theme === 'dark' ? 'Tema terang' : 'Tema gelap'}
        className="brutal-btn !p-1.5 sm:!p-2 !shadow-[var(--shadow-sm)]"
      >
        {theme === 'dark' ? <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
      </button>
    </div>
  );
}
