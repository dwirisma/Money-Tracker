import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let friendly = error?.message || 'Terjadi kesalahan yang tidak terduga.';
    try {
      const parsed = JSON.parse(friendly);
      if (parsed && typeof parsed.error === 'string') {
        if (parsed.error.toLowerCase().includes('permission') || parsed.error.includes('PERMISSION_DENIED')) {
          friendly = 'Akses ke database ditolak. Pastikan Anda sudah masuk dengan akun yang benar.';
        } else {
          friendly = `Kendala sinkronisasi cloud: ${parsed.error}`;
        }
      }
    } catch {
      // Bukan payload JSON terstruktur
    }
    return { hasError: true, message: friendly };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Artha ErrorBoundary:', error, info);
  }

  handleReload = (): void => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg-primary)] dark:bg-[#0F1117] text-[var(--text-primary)]">
          <div className="max-w-md w-full rounded-2xl border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-[4px_4px_0_0_var(--border-color)] dark:border dark:border-white/[0.08] dark:bg-[#171924] dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)] p-6 space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)]">
                Artha Cloud
              </p>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Terjadi Gangguan Aplikasi</h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)] break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full py-2.5 px-4 rounded-xl border-2 border-[var(--border-color)] bg-[var(--accent-gold)] text-[#111] font-bold text-sm shadow-[3px_3px_0_0_var(--border-color)] dark:border dark:border-[#AF8C6D] dark:bg-[#E2B68E] dark:hover:bg-[#AF8C6D] dark:text-[#0F1117] dark:shadow-[0_4px_12px_rgba(0,0,0,0.3)] hover:translate-y-[-1px] transition-all cursor-pointer"
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
