import React, { useState } from 'react';
import { Lock, User as UserIcon, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await login(userId, password);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal masuk ke akun Anda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[var(--bg-primary)] dark:bg-[#0F1117] text-[var(--text-primary)]">
      <div className="w-full max-w-md">
        <div
          className="rounded-2xl border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-[6px_6px_0_0_var(--border-color)] dark:border dark:border-white/[0.08] dark:bg-[#171924] dark:shadow-[0_12px_32px_rgba(0,0,0,0.45)] p-6 sm:p-8"
        >
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center mb-7">
            <div
              className="w-14 h-14 rounded-2xl border-2 border-[var(--border-color)] bg-[var(--accent-gold)] shadow-[3px_3px_0_0_var(--border-color)] dark:border dark:border-[#E2B68E]/35 dark:bg-[rgba(226,182,142,0.16)] dark:shadow-none flex items-center justify-center mb-4"
            >
              <img src="/icon.svg" alt="Artha" className="w-8 h-8 object-contain" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)] dark:text-[#F1F5F9]">
              Artha
            </h1>
            <p className="text-sm text-[var(--text-secondary)] dark:text-[#94A3B8] mt-1">
              Masuk untuk mengakses data keuangan real-time Anda
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-xl border-2 border-[var(--accent-coral)] bg-[var(--accent-coral)]/10 dark:border dark:border-[#FB7185]/35 dark:bg-[rgba(244,63,94,0.14)] px-3.5 py-3 text-sm text-[var(--text-primary)] dark:text-[#F1F5F9]"
            >
              <AlertCircle className="w-4 h-4 text-[var(--accent-coral)] dark:text-[#FB7185] shrink-0 mt-0.5" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label
                htmlFor="artha-user-id"
                className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[#94A3B8]"
              >
                User ID
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-[var(--text-muted)] dark:text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="artha-user-id"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="Masukkan User ID"
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border-2 border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)] dark:border dark:border-white/[0.12] dark:bg-[#1F2333] dark:text-[#F1F5F9] dark:placeholder:text-[#64748B] dark:focus:border-[#E2B68E] dark:focus:ring-2 dark:focus:ring-[#E2B68E] transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="artha-password"
                className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[#94A3B8]"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[var(--text-muted)] dark:text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="artha-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan Password"
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl border-2 border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)] dark:border dark:border-white/[0.12] dark:bg-[#1F2333] dark:text-[#F1F5F9] dark:placeholder:text-[#64748B] dark:focus:border-[#E2B68E] dark:focus:ring-2 dark:focus:ring-[#E2B68E] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] dark:text-[#94A3B8] dark:hover:text-[#F1F5F9] cursor-pointer transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 rounded-xl border-2 border-[var(--border-color)] bg-[var(--accent-gold)] text-[#111] shadow-[3px_3px_0_0_var(--border-color)] dark:border dark:border-[#E2B68E]/60 dark:bg-[#E2B68E] dark:hover:bg-[#D4A373] dark:text-[#171924] dark:shadow-none font-extrabold text-sm flex items-center justify-center gap-2 transition-all active:translate-y-[1px] disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-[#111] dark:border-[#171924] border-t-transparent rounded-full animate-spin" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <>
                  <span>Masuk</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
