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
  Cpu,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import {
  AppNotification,
  AutomationEvent,
  evaluateNotifications,
  saveReadNotificationIdsCloud,
  saveDismissedNotificationIdsCloud,
} from '../../services/notificationService';
import type { CategoryBudgetMap } from '../../services/budgetService';
import type { Transaction, Bill, Debt, Goal, Account } from '../../types';

interface NotificationCenterProps {
  uid: string;
  transactions: Transaction[];
  bills: Bill[];
  debts: Debt[];
  goals: Goal[];
  accounts: Account[];
  currentLedgerId: string;
  currentLedgerName: string;
  categoryBudgets: CategoryBudgetMap;
  readIds: string[];
  dismissedIds: string[];
  autoEvents: AutomationEvent[];
  onNavigate?: (moduleName: string) => void;
}

type Filter = 'all' | 'unread';

const SEVERITY_COLOR: Record<AppNotification['severity'], string> = {
  danger: 'var(--accent-terracotta)',
  warning: 'var(--accent-sand)',
  success: 'var(--accent-sage)',
  info: 'var(--accent-blue)',
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
  uid,
  transactions,
  bills,
  debts,
  goals,
  accounts,
  currentLedgerId,
  currentLedgerName,
  categoryBudgets,
  readIds,
  dismissedIds,
  autoEvents,
  onNavigate,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  const notifications = useMemo(() => {
    return evaluateNotifications({
      transactions,
      bills,
      debts,
      goals,
      accounts,
      currentLedgerId,
      categoryBudgets,
      readIds,
      dismissedIds,
      autoEvents,
    });
  }, [
    transactions,
    bills,
    debts,
    goals,
    accounts,
    currentLedgerId,
    categoryBudgets,
    readIds,
    dismissedIds,
    autoEvents,
  ]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const visible = filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

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

  const markAsRead = (id: string) => {
    if (readIds.includes(id)) return;
    void saveReadNotificationIdsCloud(uid, [...readIds, id]);
  };

  const markAllAsRead = () => {
    const next = Array.from(new Set([...readIds, ...notifications.map((n) => n.id)]));
    void saveReadNotificationIdsCloud(uid, next);
  };

  const dismissNotification = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = Array.from(new Set([...dismissedIds, id]));
    void saveDismissedNotificationIdsCloud(uid, next);
  };

  const clearAllNotifications = () => {
    const next = Array.from(new Set([...dismissedIds, ...notifications.map((n) => n.id)]));
    void saveDismissedNotificationIdsCloud(uid, next);
  };

  const handleNotificationClick = (notif: AppNotification) => {
    markAsRead(notif.id);
    if (notif.actionModule && onNavigate) {
      onNavigate(notif.actionModule);
      setIsOpen(false);
    }
  };

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
      default:
        return <Bell className={cls} />;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        id="btn-notification-center"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={
          unreadCount > 0 ? `Pusat Notifikasi, ${unreadCount} belum dibaca` : 'Pusat Notifikasi'
        }
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={
          unreadCount > 0
            ? `${unreadCount} notifikasi baru belum dibaca`
            : 'Pusat Notifikasi & Informasi'
        }
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
        <div
          id="notification-panel-popover"
          className="ax-nc"
          role="dialog"
          aria-label="Pusat Notifikasi"
        >
          <header className="ax-nc-h">
            <span className="ax-ic">
              <Bell className="w-4 h-4" />
            </span>
            <div>
              <h3>Pusat Notifikasi</h3>
              <p>Buku kas: {currentLedgerName}</p>
            </div>
            <button
              type="button"
              className="ax-iconbtn"
              onClick={() => setIsOpen(false)}
              aria-label="Tutup notifikasi"
              title="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          {notifications.length > 0 && (
            <div className="ax-nc-bar">
              <div className="ax-chipset" role="radiogroup" aria-label="Filter notifikasi">
                <button
                  type="button"
                  role="radio"
                  aria-checked={filter === 'all'}
                  onClick={() => setFilter('all')}
                >
                  Semua ({notifications.length})
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={filter === 'unread'}
                  onClick={() => setFilter('unread')}
                >
                  Belum dibaca ({unreadCount})
                </button>
              </div>
              <div className="ax-nc-acts">
                <button
                  type="button"
                  onClick={markAllAsRead}
                  disabled={unreadCount === 0}
                  title="Tandai semua notifikasi sudah dibaca"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Tandai dibaca</span>
                </button>
                <button
                  type="button"
                  className="del"
                  onClick={clearAllNotifications}
                  title="Hapus dan bersihkan semua notifikasi"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus semua</span>
                </button>
              </div>
            </div>
          )}

          <div className="ax-nc-list">
            {notifications.length === 0 ? (
              <div className="ax-nc-empty">
                <span className="ax-ic" style={{ background: 'var(--accent-sage)' }}>
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <b>Semua berjalan lancar!</b>
                <p>Belum ada notifikasi baru. Keuangan, tagihan, dan budget terpantau aman.</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="ax-nc-empty">
                <span className="ax-ic" style={{ background: 'var(--accent-sage)' }}>
                  <CheckCheck className="w-4 h-4" />
                </span>
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleNotificationClick(notif);
                      }
                    }}
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
                        <span className="ax-nc-act">
                          {notif.actionLabel}
                          <ArrowRight className="w-3 h-3" />
                        </span>
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
