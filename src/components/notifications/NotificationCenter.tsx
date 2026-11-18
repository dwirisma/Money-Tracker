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
  ShieldCheck
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

type Filter = 'all' | 'unread';

/** Warna per tingkat keparahan (dipakai ikon dan lencana kategori). */
const SEVERITY_COLOR: Record<AppNotification['severity'], string> = {
  danger: 'var(--accent-terracotta)',
  warning: 'var(--accent-sand)',
  success: 'var(--accent-sage)',
  info: 'var(--accent-blue)'
};

function timeAgo(ts: number): string {
  if (!ts || isNaN(ts)) return '';
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Baru saja';
  if (min < 60) return `${min} mnt lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  return `${day} hari lalu`;
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
  const [filter, setFilter] = useState<Filter>('all');
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

  const visible = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;

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

  // Tutup panel ketika klik di luar container, atau tekan Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
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
    const cls = 'w-4 h-4';
    switch (notif.type) {
      case 'automation':
        return <Cpu className={cls} />;
      case 'cutoff':
        return <Calendar className={cls} />;
      case 'payday_adjusted':
      case 'payday_h3':
        return <Banknote className={cls} />;
      case 'bill_due':
      case 'debt_due':
        return <AlertCircle className={cls} />;
      case 'budget_over':
      case 'budget_warning':
        return <AlertTriangle className={cls} />;
      case 'goal_achieved':
        return <PartyPopper className={cls} />;
      case 'backup_reminder':
        return <Database className={cls} />;
      default:
        return <Bell className={cls} />;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Tombol lonceng di header */}
      <button
        id="btn-notification-center"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={unreadCount > 0 ? `Pusat Notifikasi, ${unreadCount} belum dibaca` : 'Pusat Notifikasi'}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={unreadCount > 0 ? `${unreadCount} notifikasi baru belum dibaca` : 'Pusat Notifikasi & Informasi'}
        className={`ax-hbtn ax-bell ${isOpen ? 'on' : ''}`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span id="notification-badge-indicator" className="ax-bell-badge" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div id="notification-panel-popover" className="ax-nc" role="dialog" aria-label="Pusat Notifikasi">
          {/* Header berwarna */}
          <header className="ax-nc-h">
            <span className="ax-ic"><Bell className="w-4 h-4" /></span>
            <div>
              <h3>Pusat Notifikasi</h3>
              <p>Buku kas: {currentLedgerName}</p>
            </div>
            <button type="button" className="ax-iconbtn" onClick={() => setIsOpen(false)} aria-label="Tutup notifikasi" title="Tutup">
              <X className="w-4 h-4" />
            </button>
          </header>

          {/* Filter + aksi massal */}
          {notifications.length > 0 && (
            <div className="ax-nc-bar">
              <div className="ax-chipset" role="radiogroup" aria-label="Filter notifikasi">
                <button type="button" role="radio" aria-checked={filter === 'all'} onClick={() => setFilter('all')}>
                  Semua ({notifications.length})
                </button>
                <button type="button" role="radio" aria-checked={filter === 'unread'} onClick={() => setFilter('unread')}>
                  Belum dibaca ({unreadCount})
                </button>
              </div>
              <div className="ax-nc-acts">
                <button type="button" onClick={markAllAsRead} disabled={unreadCount === 0} title="Tandai semua notifikasi sudah dibaca">
                  <CheckCheck className="w-3.5 h-3.5" /><span>Tandai dibaca</span>
                </button>
                <button type="button" className="del" onClick={clearAllNotifications} title="Hapus dan bersihkan semua notifikasi">
                  <Trash2 className="w-3.5 h-3.5" /><span>Hapus semua</span>
                </button>
              </div>
            </div>
          )}

          {/* Daftar */}
          <div className="ax-nc-list">
            {notifications.length === 0 ? (
              <div className="ax-nc-empty">
                <span className="ax-ic" style={{ background: 'var(--accent-sage)' }}><ShieldCheck className="w-4 h-4" /></span>
                <b>Semua berjalan lancar!</b>
                <p>Belum ada notifikasi baru. Keuangan, tagihan, dan budget terpantau aman.</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="ax-nc-empty">
                <span className="ax-ic" style={{ background: 'var(--accent-sage)' }}><CheckCheck className="w-4 h-4" /></span>
                <b>Semua sudah dibaca</b>
                <p>Tidak ada notifikasi yang belum dibaca.</p>
              </div>
            ) : (
              visible.map((notif) => {
                const isUnread = !notif.read;
                const color = SEVERITY_COLOR[notif.severity] ?? SEVERITY_COLOR.info;
                const ago = timeAgo(notif.timestamp);
                return (
                  <div
                    key={notif.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleNotificationClick(notif)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNotificationClick(notif); } }}
                    className={`ax-nc-item ${isUnread ? 'unread' : ''}`}
                    style={{ '--c': color } as React.CSSProperties}
                  >
                    <span className="ax-ic ax-nc-ic">{renderNotificationIcon(notif)}</span>

                    <div className="ax-nc-body">
                      <div className="ax-nc-meta">
                        <span className="ax-nc-cat">{notif.category}</span>
                        {isUnread && <span className="ax-nc-dot" aria-label="Belum dibaca" />}
                        {ago && <span className="ax-nc-time">{ago}</span>}
                      </div>
                      <h4>{notif.title}</h4>
                      <p>{notif.message}</p>
                      {notif.actionLabel && (
                        <span className="ax-nc-act">{notif.actionLabel}<ArrowRight className="w-3 h-3" /></span>
                      )}
                    </div>

                    <button
                      type="button"
                      className="ax-nc-x"
                      onClick={(e) => dismissNotification(notif.id, e)}
                      aria-label={`Hapus notifikasi: ${notif.title}`}
                      title="Hapus notifikasi ini"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
