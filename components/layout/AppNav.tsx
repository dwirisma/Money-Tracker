import { useEffect, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Eye, EyeOff, LayoutGrid, Moon, Plus, Sun, Sparkles, X } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { ALL_NAV_ITEMS, SIDEBAR_GROUPS, type ModuleId } from './navConfig';

interface Props {
  active: ModuleId;
  onNavigate: (id: ModuleId) => void;
}

const TABS: ModuleId[] = ['dashboard', 'history_transaction', 'module1'];
const item = (id: ModuleId) => ALL_NAV_ITEMS.find(i => i.id === id)!;

function Tab({ id, active, onGo }: { id: ModuleId; active: boolean; onGo: (id: ModuleId) => void }) {
  const it = item(id);
  const Icon = it.icon;
  return (
    <button type="button" className="ax-tab" data-active={active} onClick={() => onGo(id)} aria-current={active ? 'page' : undefined}>
      <span className="ax-tab-ic"><Icon size={18} strokeWidth={2.6} /></span>
      {it.short}
    </button>
  );
}

export function AppNav({ active, onNavigate }: Props) {
  const { sidebarCollapsed, toggleSidebar, mobileDrawerOpen, setMobileDrawerOpen, theme, privacy, toggleTheme, togglePrivacy } = useUI();
  const [now, setNow] = useState(() => new Date());

  const go = (id: ModuleId) => {
    onNavigate(id);
    setMobileDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileDrawerOpen(false); };
    window.addEventListener('keydown', esc);
    return () => { clearInterval(t); window.removeEventListener('keydown', esc); };
  }, [mobileDrawerOpen, setMobileDrawerOpen]);

  const tgl = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const menuActive = !TABS.includes(active) && active !== 'add_transaction';

  return (
    <>
      {/* ================= DESKTOP: SIDEBAR ================= */}
      <aside className="ax-side" data-collapsed={sidebarCollapsed} aria-label="Navigasi utama">
        <div className="ax-brand">
          <button
            type="button"
            className="ax-logo"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          >
            A
          </button>
          <div>
            <b>Artha</b>
            <small>WEALTH OS</small>
          </div>
        </div>

        {SIDEBAR_GROUPS.map(g => (
          <div key={g.label}>
            <div className="ax-grp">{g.label}</div>
            {g.items.map(it => {
              const Icon = it.icon;
              return (
                <button
                  key={it.id}
                  type="button"
                  className="ax-item"
                  data-active={active === it.id}
                  title={it.label}
                  onClick={() => go(it.id)}
                  aria-current={active === it.id ? 'page' : undefined}
                >
                  <span className="ax-chip" style={{ backgroundColor: it.accent }}>
                    <Icon size={15} strokeWidth={2.6} />
                  </span>
                  <span>{it.label}</span>
                </button>
              );
            })}
          </div>
        ))}

        <button type="button" className="ax-collapse" onClick={toggleSidebar} aria-label="Ciutkan atau perluas sidebar">
          {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          <span>Ciutkan</span>
        </button>
      </aside>

      {/* ================= MOBILE: TAB BAR ================= */}
      <nav className="ax-tabbar" aria-label="Navigasi bawah">
        <Tab id="dashboard" active={active === 'dashboard'} onGo={go} />
        <Tab id="history_transaction" active={active === 'history_transaction'} onGo={go} />
        <button type="button" className="ax-fab" onClick={() => go('add_transaction')} aria-label="Catat transaksi baru">
          <Plus size={27} strokeWidth={3.2} />
        </button>
        <Tab id="module1" active={active === 'module1'} onGo={go} />
        <button type="button" className="ax-tab" data-active={menuActive} onClick={() => setMobileDrawerOpen(true)}>
          <span className="ax-tab-ic"><LayoutGrid size={18} strokeWidth={2.6} /></span>
          Menu
        </button>
      </nav>

      {/* ================= MOBILE: SHEET MENU ================= */}
      {mobileDrawerOpen && (
        <div className="ax-overlay md:hidden" onClick={() => setMobileDrawerOpen(false)}>
          <div className="ax-sheet" role="dialog" aria-label="Menu Artha" onClick={e => e.stopPropagation()}>
            <div className="ax-handle" />

            <div className="ax-sh">
              <div>
                <h2>Menu</h2>
                <p>{tgl} · {jam}</p>
              </div>
              <button type="button" className="brutal-btn !p-2" onClick={() => setMobileDrawerOpen(false)} aria-label="Tutup menu">
                <X size={16} strokeWidth={3} />
              </button>
            </div>

            <div className="ax-tools">
              <button type="button" className="brutal-btn" onClick={togglePrivacy}>
                {privacy ? <EyeOff size={14} /> : <Eye size={14} />}
                {privacy ? 'Saldo disensor' : 'Saldo terbuka'}
              </button>
              <button type="button" className="brutal-btn" onClick={toggleTheme}>
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                {theme === 'dark' ? 'Mode gelap' : 'Mode terang'}
              </button>
            </div>

            {SIDEBAR_GROUPS.map(g => (
              <div key={g.label}>
                <div className="ax-grp">{g.label}</div>
                <div className="ax-grid">
                  {g.items.map(it => {
                    const Icon = it.icon;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        className="ax-tile"
                        data-active={active === it.id}
                        onClick={() => go(it.id)}
                      >
                        <span className="ax-chip" style={{ backgroundColor: it.accent }}>
                          <Icon size={16} strokeWidth={2.6} />
                        </span>
                        {it.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="ax-foot" style={{ marginTop: 18 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={12} /> Artha Wealth OS
              </span>
              <span>v2.0</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
