import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Bell, 
  CheckCheck, 
  Trash2, 
  X, 
  Calendar, 
  Banknote, 
  AlertCircle, 
  AlertTriangle, 
  PartyPopper, 
  Database, 
  Cpu, 
  ArrowRight,
  ShieldCheck,
  Clock
} from 'lucide-react';
import { 
  AppNotification, 
  evaluateNotifications, 
  getReadNotificationIds, 
  saveReadNotificationIds, 
  getDismissedNotificationIds, 
  saveDismissedNotificationIds 
} from '../../services/notificationService';
import type { Transaction, Bill, Debt, Goal, Account } from '../../types';

interface NotificationCenterProps {
  transactions: Transaction[];
  bills: Bill[];
  debts: Debt[];
  goals: Goal[];
  accounts: Account[];
  currentLedgerId: string;
  currentLedgerName: string;
  onNavigate?: (moduleName: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  transactions,
  bills,
  debts,
  goals,
  accounts,
  currentLedgerId,
  currentLedgerName,
  onNavigate
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Evaluasi notifikasi berdasarkan data aktif aplikasi
  const notifications = useMemo(() => {
    return evaluateNotifications({
      transactions,
      bills,
      debts,
      goals,
      accounts,
      currentLedgerId,
    });
  }, [transactions, bills, debts, goals, accounts, currentLedgerId, refreshTrigger]);

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length;
  }, [notifications]);

  // Listener untuk event real-time update notifikasi
  useEffect(() => {
    const handleUpdate = () => setRefreshTrigger(prev => prev + 1);
    window.addEventListener('artha-notifications-updated', handleUpdate);
    window.addEventListener('artha-budgets-updated', handleUpdate);
    return () => {
      window.removeEventListener('artha-notifications-updated', handleUpdate);
      window.removeEventListener('artha-budgets-updated', handleUpdate);
    };
  }, []);

  // Tutup panel ketika klik di luar container
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Tandai 1 notifikasi sebagai sudah dibaca
  const markAsRead = (id: string) => {
    const readIds = getReadNotificationIds();
    readIds.add(id);
    saveReadNotificationIds(readIds);
    setRefreshTrigger(prev => prev + 1);
  };

  // Tandai semua notifikasi sebagai sudah dibaca
  const markAllAsRead = () => {
    const readIds = getReadNotificationIds();
    notifications.forEach(n => readIds.add(n.id));
    saveReadNotificationIds(readIds);
    setRefreshTrigger(prev => prev + 1);
  };

  // Hapus / Bersihkan satu notifikasi
  const dismissNotification = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const dismissedIds = getDismissedNotificationIds();
    dismissedIds.add(id);
    saveDismissedNotificationIds(dismissedIds);
    setRefreshTrigger(prev => prev + 1);
  };

  // Bersihkan semua notifikasi yang ada saat ini
  const clearAllNotifications = () => {
    const dismissedIds = getDismissedNotificationIds();
    notifications.forEach(n => dismissedIds.add(n.id));
    saveDismissedNotificationIds(dismissedIds);
    setRefreshTrigger(prev => prev + 1);
  };

  // Handler aksi klik notifikasi (navigasi + tandai dibaca)
  const handleNotificationClick = (notif: AppNotification) => {
    markAsRead(notif.id);
    if (notif.actionModule && onNavigate) {
      onNavigate(notif.actionModule);
      setIsOpen(false);
    }
  };

  // Ikon sesuai kategori notifikasi
  const renderNotificationIcon = (notif: AppNotification) => {
    switch (notif.type) {
      case 'automation':
        return <Cpu className="w-4 h-4 text-emerald-500 shrink-0" />;
      case 'cutoff':
        return <Calendar className="w-4 h-4 text-amber-500 shrink-0" />;
      case 'payday_adjusted':
      case 'payday_h3':
        return <Banknote className="w-4 h-4 text-blue-500 shrink-0" />;
      case 'bill_due':
      case 'debt_due':
        return <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />;
      case 'budget_over':
      case 'budget_warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
      case 'goal_achieved':
        return <PartyPopper className="w-4 h-4 text-emerald-500 shrink-0" />;
      case 'backup_reminder':
        return <Database className="w-4 h-4 text-purple-500 shrink-0" />;
      default:
        return <Bell className="w-4 h-4 text-[var(--accent-sand)] shrink-0" />;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Tombol Lonceng Navigasi Atas */}
      <button
        id="btn-notification-center"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Pusat Notifikasi"
        aria-expanded={isOpen}
        title={unreadCount > 0 ? `${unreadCount} notifikasi baru belum dibaca` : 'Pusat Notifikasi & Informasi'}
        className={`brutal-btn !p-1.5 sm:!p-2 !shadow-[var(--shadow-sm)] relative flex items-center justify-center transition-all ${
          isOpen ? 'bg-[var(--accent-sand)] text-black border-black' : 'hover:bg-[var(--bg-muted)] hover:border-[var(--border-color)]'
        }`}
      >
        <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--text-primary)]" />
        
        {/* Indikator Titik Merah / Badge Counter */}
        {unreadCount > 0 && (
          <span 
            id="notification-badge-indicator"
            className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] px-1 items-center justify-center rounded-full bg-rose-500 text-white font-mono text-[9px] font-extrabold border-2 border-black dark:border-white shadow-[1px_1px_0px_#000] animate-pulse"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Slide-out / Popover Panel Pusat Notifikasi Neo-brutalism */}
      {isOpen && (
        <div 
          id="notification-panel-popover"
          className="absolute right-0 mt-2.5 w-[330px] sm:w-[410px] max-w-[calc(100vw-1.5rem)] bg-[var(--bg-surface)] border-2 border-[var(--border-color)] rounded-[var(--radius-md)] shadow-[4px_4px_0px_#000] z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header Panel Notifikasi */}
          <div className="p-3 bg-[var(--bg-elevated)] border-b-2 border-[var(--border-color)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-[var(--radius-sm)] bg-[var(--accent-sand)] text-black border border-black shadow-[1px_1px_0px_#000]">
                <Bell className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-heading font-extrabold text-sm text-[var(--text-primary)]">
                    Pusat Notifikasi
                  </h3>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-rose-500 text-white border border-black">
                      {unreadCount} Baru
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-mono text-[var(--text-muted)]">
                  Buku Kas: {currentLedgerName}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] border border-transparent hover:border-[var(--border-color)] transition-colors"
              title="Tutup Notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Sub-bar Aksi: Tandai Semua & Bersihkan */}
          {notifications.length > 0 && (
            <div className="px-3 py-1.5 bg-[var(--bg-muted)]/50 border-b border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-mono">
              <button
                type="button"
                onClick={markAllAsRead}
                disabled={unreadCount === 0}
                className="flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline disabled:opacity-40 disabled:hover:no-underline font-bold"
                title="Tandai semua notifikasi sudah dibaca"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Tandai Semua Dibaca</span>
              </button>

              <button
                type="button"
                onClick={clearAllNotifications}
                className="flex items-center gap-1 text-[var(--text-muted)] hover:text-rose-500 hover:underline font-bold transition-colors"
                title="Hapus dan bersihkan semua notifikasi"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Semua</span>
              </button>
            </div>
          )}

          {/* Daftar Notifikasi Terstruktur */}
          <div className="max-h-[380px] sm:max-h-[440px] overflow-y-auto divide-y divide-[var(--border-subtle)]">
            {notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full mx-auto bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-500">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h4 className="font-heading font-bold text-sm text-[var(--text-primary)]">
                  Semua Berjalan Lancar!
                </h4>
                <p className="text-xs text-[var(--text-muted)] font-mono max-w-[260px] mx-auto">
                  Belum ada notifikasi baru. Sistem keuangan, tagihan, dan budget terpantau aman terkendali.
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const isUnread = !notif.read;

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-3 sm:p-3.5 transition-colors cursor-pointer group flex items-start gap-2.5 relative ${
                      isUnread
                        ? 'bg-[var(--bg-elevated)] border-l-4 border-l-[var(--accent-sand)]'
                        : 'hover:bg-[var(--bg-elevated)]/60 opacity-80 hover:opacity-100'
                    }`}
                  >
                    {/* Icon Box */}
                    <div className="p-2 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-[1px_1px_0px_#000] shrink-0 mt-0.5">
                      {renderNotificationIcon(notif)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.2 text-[9px] font-mono font-bold rounded uppercase border ${
                            notif.severity === 'danger'
                              ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                              : notif.severity === 'warning'
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : notif.severity === 'success'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                          }`}>
                            {notif.category}
                          </span>
                          {isUnread && (
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                          )}
                        </div>

                        {/* Individual Dismiss Button */}
                        <button
                          type="button"
                          onClick={(e) => dismissNotification(notif.id, e)}
                          className="text-[var(--text-muted)] hover:text-rose-500 p-0.5 rounded transition-colors"
                          title="Hapus notifikasi ini"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <h4 className="font-heading font-bold text-xs text-[var(--text-primary)] leading-tight group-hover:text-[var(--accent-sand-light)] transition-colors">
                        {notif.title}
                      </h4>

                      <p className="text-xs text-[var(--text-secondary)] font-body leading-relaxed">
                        {notif.message}
                      </p>

                      {/* Action Link Footer */}
                      {notif.actionLabel && (
                        <div className="pt-1 flex items-center justify-between text-[10px] font-mono">
                          <span className="text-[var(--accent-sand)] font-bold flex items-center gap-1 group-hover:underline">
                            <span>{notif.actionLabel}</span>
                            <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                          </span>

                          <span className="text-[var(--text-muted)] flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span>Terkini</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Panel */}
          {notifications.length > 0 && (
            <div className="p-2 bg-[var(--bg-elevated)] border-t border-[var(--border-subtle)] text-center">
              <p className="text-[10px] font-mono text-[var(--text-muted)]">
                Notifikasi otomatis diperbarui berdasarkan siklus kas & aktivitas terkini.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
