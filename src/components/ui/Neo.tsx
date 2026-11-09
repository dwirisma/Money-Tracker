import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { formatRupiah } from '../../utils/calculator';

type Accent = 'sage' | 'blue' | 'terracotta' | 'sand' | 'lavender';
const cx = (...p: Array<string | false | undefined>) => p.filter(Boolean).join(' ');

export function NeoCard({ interactive, elevated, className, ...rest }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean; elevated?: boolean }) {
  return <div {...rest} className={cx(elevated ? 'brutal-card-elevated' : 'brutal-card', interactive && 'brutal-card-interactive', className)} />;
}

export function NeoButton({ accent, ghost, className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { accent?: Accent; ghost?: boolean }) {
  return <button {...rest} type={type} className={cx('brutal-btn', accent && `brutal-btn-${accent}`, ghost && 'brutal-btn-ghost', className)} />;
}

export function NeoInput({ numeric, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { numeric?: boolean }) {
  return <input {...rest} className={cx('brutal-input', numeric && 'brutal-input-num', className)} />;
}

/** Nominal yang otomatis tersensor saat Mode Privasi aktif (lewat formatRupiah) */
export function Money({ value, tone, className }: { value: number; tone?: 'income' | 'expense' | 'auto'; className?: string }) {
  const t = tone === 'auto' ? (value < 0 ? 'expense' : 'income') : tone;
  const color = t === 'income' ? 'text-[var(--accent-sage-light)]' : t === 'expense' ? 'text-[var(--accent-terracotta-light)]' : '';
  return <span className={cx('font-num', color, className)}>{formatRupiah(value)}</span>;
}

export function NeoLabel({ children }: { children: ReactNode }) {
  return <span className="brutal-label">{children}</span>;
}
