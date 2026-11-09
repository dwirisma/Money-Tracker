import { useEffect, useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Eye, 
  EyeOff, 
  Moon, 
  Sun, 
  X, 
  Calendar 
} from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { SIDEBAR_GROUPS, type ModuleId } from './navConfig';

interface Props {
  active: ModuleId;
  onNavigate: (id: ModuleId) => void;
}

function formatDrawerNow(d: Date) {
  const hari = d.toLocaleDateString('id-ID', { weekday: 'long' });
  const tgl = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return { hari, tgl, jam };
}

export function AppNav({ active, onNavigate }: Props) {
  const { 
    sidebarCollapsed, 
    toggleSidebar, 
    mobileDrawerOpen, 
    setMobileDrawerOpen,
    theme,
    privacy,
    toggleTheme,
    togglePrivacy
  } = useUI();

  const [drawerTime, setDrawerTime] = useState(() => new Date());

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const interval = setInterval(() => setDrawerTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, [mobileDrawerOpen]);

  const go = (id: ModuleId) => {
    onNavigate(id);
    setMobileDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const { hari, tgl, jam } = formatDrawerNow(drawerTime);

  return (
    <>
      {/* =================================================================== */}
      {/* DESKTOP SIDEBAR (FIXED LEFT ON SCREENS >= MD)                      */}
      {/* =================================================================== */}
      <aside
        aria-label="Navigasi utama"
        className="max-md:hidden flex fixed inset-y-0 left-0 z-40 flex-col bg-[var(--bg-surface)] border-r-[2.5px] border-[var(--border-color)] overflow-y-auto"
        style={{ width: 'var(--sidebar-w)' }}
      >
        <div className="flex items-center justify-between px-3 py-4 border-b-2 border-[var(--border-subtle)]">
          {!sidebarCollapsed && (
            <div>
              <div className="font-heading font-bold text-lg leading-none text-[var(--text-primary)]">Artha</div>
              <div className="font-mono text-[10px] text-[var(--text-muted)] mt-1">WEALTH OS • V2</div>
            </div>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            className="brutal-btn !p-1.5 !shadow-[var(--shadow-sm)] mx-auto"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 px-2 pb-4 space-y-4 pt-2">
          {SIDEBAR_GROUPS.map(group => (
            <div key={group.label}>
              {!sidebarCollapsed && <div className="nav-group-label">{group.label}</div>}
              {sidebarCollapsed && <div className="h-3" />}
              <div className="space-y-1">
                {group.items.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="nav-item"
                    data-active={active === item.id}
                    title={sidebarCollapsed ? item.label : undefined}
                    onClick={() => go(item.id)}
                    aria-current={active === item.id ? 'page' : undefined}
                  >
                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* =================================================================== */}
      {/* MOBILE SIDEBAR DRAWER (DIPICU OLEH KLIK LOGO 'A' DI TOP HEADER)     */}
      {/* Menggantikan navigasi bawah sesuai permintaan pengguna              */}
      {/* =================================================================== */}
      {mobileDrawerOpen && (
        <div 
          className="md:hidden fixed inset-0 z-50 flex bg-black/75 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Menu Navigasi Artha"
            className="w-[85%] max-w-[320px] h-full bg-[var(--bg-surface)] border-r-4 border-[var(--border-color)] shadow-[var(--shadow-lg)] flex flex-col overflow-hidden animate-in slide-in-from-left duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Drawer */}
            <div className="p-4 border-b-2 border-[var(--border-color)] bg-[var(--bg-elevated)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-[var(--accent-sage)] text-[var(--text-inverted)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[2px_2px_0px_#000] flex items-center justify-center font-heading font-bold text-lg">
                    A
                  </div>
                  <div>
                    <h2 className="font-heading font-bold text-base leading-none text-[var(--text-primary)]">ARTHA</h2>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Wealth OS Drawer</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="brutal-btn !p-1.5"
                  aria-label="Tutup Menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* WIDGET TANGGAL & JAM REALTIME KHUSUS MOBILE (DIPINDAHKAN KE SINI SESUAI REQUEST) */}
              <div className="p-2.5 bg-[var(--bg-surface)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[2px_2px_0px_#000] space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 font-heading font-bold text-[var(--text-primary)]">
                    <Calendar className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                    {hari}, {tgl}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-1">
                  <span className="flex items-center gap-1 font-mono text-xs text-[var(--text-secondary)]">
                    <Clock className="w-3 h-3 text-[var(--accent-sage)]" />
                    Waktu Saat Ini
                  </span>
                  <span className="font-mono font-bold text-xs text-[var(--accent-sand-light)]">
                    {jam}
                  </span>
                </div>
              </div>

              {/* QUICK CONTROLS: TEMA & PRIVASI DALAM DRAWER */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={togglePrivacy}
                  className="brutal-btn text-xs py-1.5 px-2 flex items-center justify-center gap-1.5 !shadow-[1px_1px_0px_#000]"
                >
                  {privacy ? <EyeOff className="w-3.5 h-3.5 text-[var(--accent-sand)]" /> : <Eye className="w-3.5 h-3.5 text-[var(--accent-sage)]" />}
                  <span className="truncate">{privacy ? 'Saldo Sensor' : 'Saldo Terbuka'}</span>
                </button>

                <button
                  type="button"
                  onClick={toggleTheme}
                  className="brutal-btn text-xs py-1.5 px-2 flex items-center justify-center gap-1.5 !shadow-[1px_1px_0px_#000]"
                >
                  {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-[var(--accent-sand)]" /> : <Moon className="w-3.5 h-3.5 text-[var(--accent-blue)]" />}
                  <span className="truncate">{theme === 'dark' ? 'Mode Gelap' : 'Mode Terang'}</span>
                </button>
              </div>
            </div>

            {/* List Menu Navigasi Lengkap di Drawer */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-4">
              {SIDEBAR_GROUPS.map(group => (
                <div key={group.label} className="space-y-1.5">
                  <div className="px-2 text-[10px] font-mono uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.items.map(item => {
                      const isActive = active === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => go(item.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] border-2 transition-all text-left ${
                            isActive
                              ? 'bg-[var(--bg-elevated)] border-[var(--border-color)] shadow-[2px_2px_0px_#000] font-bold text-[var(--text-primary)]'
                              : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                          }`}
                        >
                          <span 
                            className="w-7 h-7 shrink-0 flex items-center justify-center border border-[var(--border-color)] rounded-[var(--radius-xs)] shadow-[1px_1px_0px_#000]"
                            style={{ backgroundColor: isActive ? item.accent : 'var(--bg-surface)' }}
                          >
                            <item.icon className="w-4 h-4 text-[#111]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="block font-heading text-xs truncate leading-tight">
                              {item.label}
                            </span>
                            <span className="block text-[10px] text-[var(--text-muted)] truncate">
                              {item.hint}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* Footer Drawer */}
            <div className="p-3 border-t-2 border-[var(--border-color)] bg-[var(--bg-elevated)] text-center">
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                Artha Wealth OS • Offline-First PWA
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
