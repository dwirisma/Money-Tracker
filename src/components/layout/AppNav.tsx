import { useState } from 'react';
import { ChevronLeft, ChevronRight, Menu, Plus, X } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { BOTTOM_LEFT, BOTTOM_RIGHT, MORE_ITEMS, SIDEBAR_GROUPS, type ModuleId, type NavItem } from './navConfig';

interface Props {
  active: ModuleId;
  onNavigate: (id: ModuleId) => void;
}

export function AppNav({ active, onNavigate }: Props) {
  const { sidebarCollapsed, toggleSidebar } = useUI();
  const [moreOpen, setMoreOpen] = useState(false);

  const go = (id: ModuleId) => { onNavigate(id); setMoreOpen(false); window.scrollTo({ top: 0 }); };

  // Tombol (+): buka Buku Besar lalu gulir ke form transaksi
  const goAddTransaction = () => {
    go('module1');
    requestAnimationFrame(() => {
      document.getElementById('container-transaksi')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('tx-amount-input')?.focus({ preventScroll: true });
    });
  };

  const bottomBtn = (item: NavItem) => (
    <button key={item.id} type="button" className="bottom-nav-btn" data-active={active === item.id} onClick={() => go(item.id)}>
      <item.icon className="w-5 h-5" />
      <span>{item.short}</span>
    </button>
  );

  const moreActive = MORE_ITEMS.some(i => i.id === active);

  return (
    <>
      {/* ===== DESKTOP: SIDEBAR ===== */}
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

        <nav className="flex-1 px-2 pb-4">
          {SIDEBAR_GROUPS.map(group => (
            <div key={group.label}>
              {!sidebarCollapsed && <div className="nav-group-label">{group.label}</div>}
              {sidebarCollapsed && <div className="h-3" />}
              <div className="space-y-1.5">
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

      {/* ===== MOBILE: BOTTOM NAV ===== */}
      <nav
        aria-label="Navigasi bawah"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--bg-surface)] border-t-4 border-[var(--border-color)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-end px-1 pt-1.5 pb-1.5">
          {BOTTOM_LEFT.map(bottomBtn)}
          <div className="flex-1 flex justify-center">
            <button
              type="button"
              onClick={goAddTransaction}
              aria-label="Tambah transaksi"
              className="brutal-btn brutal-btn-sand !rounded-full !p-0 w-14 h-14 -mt-7 !border-[3px]"
            >
              <Plus className="w-7 h-7" strokeWidth={3} />
            </button>
          </div>
          {BOTTOM_RIGHT.map(bottomBtn)}
          <button type="button" className="bottom-nav-btn" data-active={moreActive || moreOpen} onClick={() => setMoreOpen(true)}>
            <Menu className="w-5 h-5" />
            <span>Menu</span>
          </button>
        </div>
      </nav>

      {/* ===== MOBILE: BOTTOM SHEET "MENU LAINNYA" ===== */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[45] flex items-end bg-black/70" onClick={() => setMoreOpen(false)}>
          <div
            role="dialog"
            aria-label="Menu lainnya"
            className="w-full max-h-[80vh] overflow-y-auto bg-[var(--bg-surface)] border-t-4 border-x-4 border-[var(--border-color)] rounded-t-xl p-4 space-y-3"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-lg text-[var(--text-primary)]">Menu Lainnya</h3>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Tutup" className="brutal-btn !p-2"><X className="w-5 h-5" /></button>
            </div>
            {MORE_ITEMS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className="brutal-card brutal-card-interactive w-full flex items-center gap-3 p-3 text-left"
              >
                <span className="w-11 h-11 shrink-0 flex items-center justify-center border-2 border-[var(--border-color)] rounded-md" style={{ background: item.accent }}>
                  <item.icon className="w-5 h-5 text-[#111]" />
                </span>
                <span className="min-w-0">
                  <span className="block font-heading font-bold text-[var(--text-primary)]">{item.label}</span>
                  <span className="block text-xs text-[var(--text-secondary)]">{item.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
