import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  RefreshCw,
  RotateCcw,
  Check,
  Upload,
  AlertTriangle,
  Sparkles,
  Image as ImageIcon,
  ScanLine,
} from 'lucide-react';
import { ModalFrame } from './ui/BaseUI';
import {
  analyzeReceiptFrame,
  cropVideoFrameToReceiptFile,
  type NormalizedRect,
  type ReceiptDetectionStatus,
  type ReceiptQuad,
} from '../services/receiptScanService';

interface CameraCaptureModalProps {
  onCaptureFile: (file: File) => void;
  onClose: () => void;
}

const ANALYSIS_WIDTH = 320;
const ANALYSIS_INTERVAL_MS = 200;
const STABILITY_DURATION_MS = 1200;

/** Memetakan titik ternormalisasi pada intrinsic video (0..1) ke persentase viewport container saat video menggunakan object-cover. */
function mapVideoPointToViewport(
  nx: number,
  ny: number,
  vw: number,
  vh: number,
  cw: number,
  ch: number
): { x: number; y: number } {
  if (!vw || !vh || !cw || !ch) return { x: nx * 100, y: ny * 100 };
  const scale = Math.max(cw / vw, ch / vh);
  const renderedW = vw * scale;
  const renderedH = vh * scale;
  const offsetX = (cw - renderedW) / 2;
  const offsetY = (ch - renderedH) / 2;
  const px = (nx * renderedW + offsetX) / cw;
  const py = (ny * renderedH + offsetY) / ch;
  return {
    x: Math.max(1, Math.min(99, px * 100)),
    y: Math.max(1, Math.min(99, py * 100)),
  };
}

/** Menghitung porsi intrinsic video (0..1) yang sedang terlihat di dalam container object-cover. */
function getVisibleVideoRegion(vw: number, vh: number, cw: number, ch: number): NormalizedRect {
  if (!vw || !vh || !cw || !ch) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const scale = Math.max(cw / vw, ch / vh);
  const renderedW = vw * scale;
  const renderedH = vh * scale;
  const cropX = Math.max(0, (renderedW - cw) / 2 / renderedW);
  const cropY = Math.max(0, (renderedH - ch) / 2 / renderedH);
  return {
    x: cropX,
    y: cropY,
    width: Math.max(0.1, 1 - cropX * 2),
    height: Math.max(0.1, 1 - cropY * 2),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function CameraCaptureModal({ onCaptureFile, onClose }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);

  // Refs untuk keamanan lifecycle & pencegahan multi-capture / kebocoran kamera
  const streamSessionRef = useRef(0);
  const prevLumaRef = useRef<Uint8Array | null>(null);
  const smoothQuadRef = useRef<ReceiptQuad | null>(null);
  const smoothBoundsRef = useRef<NormalizedRect | null>(null);
  const missingTicksRef = useRef(0);
  const autoCapturedRef = useRef(false);
  const stableStatusRef = useRef<ReceiptDetectionStatus>('no_document');
  const stableProgressRef = useRef(0);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraState, setCameraState] = useState<'loading' | 'ready' | 'preview' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const capturedUrlRef = useRef<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  // State Auto-Scan real-time
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(true);
  const [detectionStatus, setDetectionStatus] = useState<ReceiptDetectionStatus>('no_document');
  const [overlayQuad, setOverlayQuad] = useState<
    [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] | null
  >(null);
  const [stabilityProgress, setStabilityProgress] = useState<number>(0);
  const [captureFlash, setCaptureFlash] = useState<boolean>(false);

  const resetDetectionState = useCallback(() => {
    prevLumaRef.current = null;
    smoothQuadRef.current = null;
    smoothBoundsRef.current = null;
    missingTicksRef.current = 0;
    stableStatusRef.current = 'no_document';
    stableProgressRef.current = 0;
    setDetectionStatus('no_document');
    setOverlayQuad(null);
    setStabilityProgress(0);
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleSafeClose = useCallback(() => {
    streamSessionRef.current += 1;
    stopStream();
    onClose();
  }, [onClose, stopStream]);

  const startCamera = useCallback(
    async (targetFacing: 'environment' | 'user') => {
      const sessionId = ++streamSessionRef.current;
      autoCapturedRef.current = false;
      resetDetectionState();
      stopStream();
      setCameraState('loading');
      setErrorMessage('');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (sessionId !== streamSessionRef.current) return;
        setCameraState('error');
        setErrorMessage(
          'Browser ini tidak mendukung kamera langsung di dalam halaman. Gunakan tombol Kamera Bawaan / Pilih Galeri di bawah.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        // Jika modal sudah ditutup atau sesi kamera berganti saat getUserMedia selesai, segera matikan track agar kamera tidak bocor
        if (sessionId !== streamSessionRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        if (sessionId !== streamSessionRef.current) {
          stopStream();
          return;
        }

        setCameraState('ready');
      } catch (err) {
        if (sessionId !== streamSessionRef.current) return;
        console.warn('Camera access failed:', err);
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setErrorMessage(
            'Izin kamera ditolak. Izinkan akses kamera di browser Anda atau gunakan tombol Pilih dari Galeri di bawah.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setErrorMessage(
            'Kamera tidak ditemukan pada perangkat ini. Anda tetap bisa memilih foto struk dari galeri perangkat.'
          );
        } else {
          setErrorMessage(
            'Kamera langsung tidak dapat dibuka pada konteks ini. Gunakan tombol Kamera Bawaan / Pilih Galeri di bawah.'
          );
        }
        setCameraState('error');
      }
    },
    [resetDetectionState, stopStream]
  );

  useEffect(() => {
    void startCamera(facingMode);
    return () => {
      streamSessionRef.current += 1;
      stopStream();
      if (capturedUrlRef.current) {
        URL.revokeObjectURL(capturedUrlRef.current);
        capturedUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trigger auto-capture beresolusi penuh + auto-crop, lalu hentikan kamera & kirim 1x ke Gemini (onCaptureFile)
  const triggerAutoCapture = useCallback(async () => {
    if (autoCapturedRef.current) return;
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    autoCapturedRef.current = true;
    streamSessionRef.current += 1;
    setCaptureFlash(true);

    try {
      const croppedFile = await cropVideoFrameToReceiptFile(video, smoothBoundsRef.current, {
        margin: 0.045,
        quality: 0.92,
      });
      stopStream();
      onCaptureFile(croppedFile);
      onClose();
    } catch (err) {
      console.warn('Auto-capture failed, allowing retry:', err);
      autoCapturedRef.current = false;
      setCaptureFlash(false);
    }
  }, [onCaptureFile, onClose, stopStream]);

  // Loop deteksi lokal beresolusi ringan (320px) setiap 200ms saat kamera siap & Auto-Scan aktif
  useEffect(() => {
    if (cameraState !== 'ready' || !autoScanEnabled) {
      resetDetectionState();
      return;
    }

    let rafId = 0;
    let lastRafTime = performance.now();

    // Animasi mulus progress bar kestabilan (~1.2 detik)
    const tickProgress = (now: number) => {
      const dt = Math.min(100, Math.max(0, now - lastRafTime));
      lastRafTime = now;

      if (!autoCapturedRef.current) {
        const status = stableStatusRef.current;
        if (status === 'ready') {
          stableProgressRef.current = Math.min(100, stableProgressRef.current + (dt / STABILITY_DURATION_MS) * 100);
        } else if (status === 'unstable_or_blurry') {
          // Turun perlahan agar getaran mikro tangan tidak langsung mereset seluruh progres
          stableProgressRef.current = Math.max(0, stableProgressRef.current - (dt / 650) * 100);
        } else {
          stableProgressRef.current = 0;
        }

        const rounded = Math.round(stableProgressRef.current);
        setStabilityProgress((prev) => (prev === rounded ? prev : rounded));

        if (stableProgressRef.current >= 100) {
          void triggerAutoCapture();
          return;
        }
      }

      rafId = requestAnimationFrame(tickProgress);
    };

    rafId = requestAnimationFrame(tickProgress);

    const intervalId = window.setInterval(() => {
      if (autoCapturedRef.current) return;
      const video = videoRef.current;
      const canvas = analysisCanvasRef.current;
      const viewport = viewportRef.current;
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const targetW = ANALYSIS_WIDTH;
      const targetH = Math.max(120, Math.round((vh / vw) * targetW));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        prevLumaRef.current = null;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, targetW, targetH);
      const imageData = ctx.getImageData(0, 0, targetW, targetH);

      const cw = viewport?.clientWidth || vw;
      const ch = viewport?.clientHeight || vh;
      const visibleRegion = getVisibleVideoRegion(vw, vh, cw, ch);

      const { analysis, luma } = analyzeReceiptFrame(imageData, prevLumaRef.current, visibleRegion);
      prevLumaRef.current = luma;

      if (analysis.detected && analysis.quad && analysis.bounds) {
        missingTicksRef.current = 0;

        // Smoothing EMA agar poligon overlay halus & tidak melompat-lompat
        const alpha = 0.42;
        const prevQuad = smoothQuadRef.current;
        const nextQuad: ReceiptQuad = prevQuad
          ? [
              { x: lerp(prevQuad[0].x, analysis.quad[0].x, alpha), y: lerp(prevQuad[0].y, analysis.quad[0].y, alpha) },
              { x: lerp(prevQuad[1].x, analysis.quad[1].x, alpha), y: lerp(prevQuad[1].y, analysis.quad[1].y, alpha) },
              { x: lerp(prevQuad[2].x, analysis.quad[2].x, alpha), y: lerp(prevQuad[2].y, analysis.quad[2].y, alpha) },
              { x: lerp(prevQuad[3].x, analysis.quad[3].x, alpha), y: lerp(prevQuad[3].y, analysis.quad[3].y, alpha) },
            ]
          : analysis.quad;

        const prevBounds = smoothBoundsRef.current;
        const nextBounds: NormalizedRect = prevBounds
          ? {
              x: lerp(prevBounds.x, analysis.bounds.x, alpha),
              y: lerp(prevBounds.y, analysis.bounds.y, alpha),
              width: lerp(prevBounds.width, analysis.bounds.width, alpha),
              height: lerp(prevBounds.height, analysis.bounds.height, alpha),
            }
          : analysis.bounds;

        smoothQuadRef.current = nextQuad;
        smoothBoundsRef.current = nextBounds;

        setOverlayQuad([
          mapVideoPointToViewport(nextQuad[0].x, nextQuad[0].y, vw, vh, cw, ch),
          mapVideoPointToViewport(nextQuad[1].x, nextQuad[1].y, vw, vh, cw, ch),
          mapVideoPointToViewport(nextQuad[2].x, nextQuad[2].y, vw, vh, cw, ch),
          mapVideoPointToViewport(nextQuad[3].x, nextQuad[3].y, vw, vh, cw, ch),
        ]);

        stableStatusRef.current = analysis.status;
        setDetectionStatus(analysis.status);
      } else {
        missingTicksRef.current += 1;
        // Toleransi 1 tick (200ms) agar overlay tidak berkedip karena noise 1 frame
        if (missingTicksRef.current >= 2) {
          smoothQuadRef.current = null;
          smoothBoundsRef.current = null;
          setOverlayQuad(null);
          stableStatusRef.current = 'no_document';
          setDetectionStatus('no_document');
        }
      }
    }, ANALYSIS_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      cancelAnimationFrame(rafId);
    };
  }, [autoScanEnabled, cameraState, resetDetectionState, triggerAutoCapture]);

  function handleSwitchCamera() {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    void startCamera(next);
  }

  function handleTakeSnapshot() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    autoCapturedRef.current = true;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      autoCapturedRef.current = false;
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          autoCapturedRef.current = false;
          return;
        }
        if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
        const url = URL.createObjectURL(blob);
        capturedUrlRef.current = url;
        setCapturedBlob(blob);
        setCapturedUrl(url);
        setCameraState('preview');
        stopStream();
      },
      'image/jpeg',
      0.92
    );
  }

  function handleRetake() {
    if (capturedUrlRef.current) {
      URL.revokeObjectURL(capturedUrlRef.current);
      capturedUrlRef.current = null;
    }
    setCapturedUrl(null);
    setCapturedBlob(null);
    void startCamera(facingMode);
  }

  function handleConfirmCapture() {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `struk-kamera-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });
    stopStream();
    onCaptureFile(file);
    onClose();
  }

  function handleSelectedFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    streamSessionRef.current += 1;
    stopStream();
    onCaptureFile(file);
    onClose();
  }

  const isLockedReady = autoScanEnabled && detectionStatus === 'ready';
  const isUnstableDetected = autoScanEnabled && detectionStatus === 'unstable_or_blurry';

  const guidanceText = !autoScanEnabled
    ? 'Mode manual aktif. Cocok untuk struk panjang — tekan Jepret Manual saat posisi pas.'
    : detectionStatus === 'ready'
      ? 'Struk terdeteksi. Tahan HP stabil...'
      : detectionStatus === 'unstable_or_blurry'
        ? 'Gambar belum cukup tajam/terang. Tahan HP stabil...'
        : 'Arahkan kamera ke struk belanja. Pastikan pencahayaan cukup.';

  const polygonStroke = isLockedReady ? '#34D399' : '#FBBF24';
  const polygonFill = isLockedReady ? 'rgba(52, 211, 153, 0.14)' : 'rgba(251, 191, 36, 0.12)';

  const headerToggle = (
    <button
      type="button"
      role="switch"
      aria-checked={autoScanEnabled}
      onClick={() => setAutoScanEnabled((prev) => !prev)}
      title={autoScanEnabled ? 'Matikan Auto-Scan untuk memotret struk panjang secara manual' : 'Aktifkan deteksi & jepret otomatis'}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-mono font-bold transition-all cursor-pointer select-none ${
        autoScanEnabled
          ? 'bg-[#FFFDF7] text-[#171924] border-[1.5px] border-[#171924] shadow-[1.5px_1.5px_0px_#171924] dark:bg-[#171924] dark:text-[#34D399] dark:border dark:border-[#34D399]/50 dark:shadow-none'
          : 'bg-white/75 text-[#171924]/75 border-[1.5px] border-[#171924]/60 dark:bg-[#171924]/80 dark:text-[#8B9A9F] dark:border dark:border-white/[0.12] dark:shadow-none'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
          autoScanEnabled
            ? 'bg-[#10B981] dark:bg-[#34D399] animate-pulse'
            : 'bg-slate-400 dark:bg-slate-500'
        }`}
      />
      <span className="whitespace-nowrap">
        Auto-Scan: {autoScanEnabled ? 'Aktif' : 'Off'}
      </span>
    </button>
  );

  return (
    <ModalFrame
      wide
      title="Kamera Scan Struk"
      subtitle="Deteksi dokumen otomatis & jepret real-time"
      icon={<Camera className="w-4 h-4" />}
      tint="var(--accent-lavender)"
      headerAction={cameraState !== 'preview' ? headerToggle : undefined}
      onClose={handleSafeClose}
      footer={
        <div className="flex flex-wrap items-center gap-2 w-full">
          {cameraState === 'ready' ? (
            <>
              <button
                type="button"
                className="brutal-btn brutal-btn-ghost !flex-none px-3 dark:bg-[#1F2333] dark:border dark:border-white/[0.10] dark:text-[#CBD5E1]"
                onClick={handleSwitchCamera}
                title="Ganti kamera depan/belakang"
                aria-label="Putar kamera"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Putar</span>
              </button>
              <button
                type="button"
                className="brutal-btn brutal-btn-ghost !flex-1 min-w-[115px] dark:bg-[#1F2333] dark:border dark:border-white/[0.10] dark:text-[#F1F5F9]"
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImageIcon className="w-4 h-4" />
                Pilih dari Galeri
              </button>
              <button
                type="button"
                className="brutal-btn brutal-btn-sand !flex-1 min-w-[130px] dark:bg-[#E2B68E] dark:text-[#171924] dark:border-[#E2B68E] dark:shadow-none"
                onClick={handleTakeSnapshot}
              >
                <Camera className="w-4 h-4" />
                Jepret Manual
              </button>
            </>
          ) : cameraState === 'preview' ? (
            <>
              <button
                type="button"
                className="brutal-btn brutal-btn-ghost !flex-1 dark:bg-[#1F2333] dark:border dark:border-white/[0.10] dark:text-[#CBD5E1]"
                onClick={handleRetake}
              >
                <RotateCcw className="w-4 h-4" />
                Foto Ulang
              </button>
              <button
                type="button"
                className="brutal-btn brutal-btn-sage !flex-1 dark:bg-[#34D399] dark:text-[#0F1117] dark:border-[#34D399] dark:shadow-none"
                onClick={handleConfirmCapture}
              >
                <Check className="w-4 h-4" />
                Scan Struk Ini
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="brutal-btn brutal-btn-ghost !flex-none px-4"
                onClick={handleSafeClose}
              >
                Tutup
              </button>
              <button
                type="button"
                className="brutal-btn brutal-btn-sand !flex-1 dark:bg-[#E2B68E] dark:text-[#171924] dark:border-[#E2B68E] dark:shadow-none"
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImageIcon className="w-4 h-4" />
                Pilih dari Galeri
              </button>
            </>
          )}
        </div>
      }
    >
      <div className="ax-form">
        {/* Canvas tersembunyi beresolusi ringan untuk deteksi lokal 200ms */}
        <canvas ref={analysisCanvasRef} className="hidden" aria-hidden="true" />

        {/* Input galeri (tanpa paksa capture kamera agar pengguna bisa memilih dari galeri HP) */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*,.pdf,.txt,.csv"
          className="hidden"
          onChange={handleSelectedFile}
        />

        {/* Input kamera bawaan HP sebagai cadangan saat kamera web tidak tersedia */}
        <input
          ref={nativeCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleSelectedFile}
        />

        {cameraState === 'error' ? (
          <div className="p-4 rounded-xl border-2 border-[var(--border-color)] bg-[var(--bg-elevated)] dark:border dark:border-white/[0.10] dark:bg-[#1F2333] space-y-3 text-center">
            <div className="w-11 h-11 mx-auto rounded-xl bg-[var(--accent-terracotta)] text-[#14141a] border-2 border-[var(--border-color)] dark:bg-[rgba(244,63,94,0.16)] dark:text-[#FB7185] dark:border dark:border-[#FB7185]/35 grid place-items-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <p className="text-xs sm:text-sm font-bold text-[var(--text-primary)] leading-relaxed">
              {errorMessage}
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void startCamera(facingMode)}
                className="brutal-btn brutal-btn-ghost text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Coba Buka Kamera Lagi
              </button>
              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                className="brutal-btn brutal-btn-sand text-xs dark:bg-[#E2B68E] dark:text-[#171924] dark:border-[#E2B68E]"
              >
                <Upload className="w-3.5 h-3.5" />
                Kamera Bawaan HP
              </button>
            </div>
          </div>
        ) : (
          <div
            ref={viewportRef}
            className="relative w-full overflow-hidden rounded-2xl border-2 border-[var(--border-color)] bg-[#111] shadow-[var(--shadow-sm)] dark:border dark:border-white/[0.12] dark:bg-[#0B0D12] dark:shadow-none aspect-[3/4] sm:aspect-[4/3] max-h-[56vh]"
          >
            {cameraState === 'loading' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white text-xs font-mono z-20 bg-black/75">
                <RefreshCw className="w-6 h-6 animate-spin text-[#E2B68E]" />
                <span>Menyalakan kamera…</span>
              </div>
            )}

            {cameraState === 'preview' && capturedUrl ? (
              <img
                src={capturedUrl}
                alt="Hasil foto struk"
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Overlay deteksi dokumen & sudut poligon */}
                {cameraState === 'ready' && (
                  <div className="pointer-events-none absolute inset-0 z-10">
                    {/* Bingkai panduan dasar saat belum ada dokumen terkunci atau saat mode manual */}
                    <div
                      className={`absolute inset-5 sm:inset-7 rounded-xl border-2 border-dashed transition-colors duration-200 ${
                        !autoScanEnabled
                          ? 'border-white/45'
                          : isLockedReady
                            ? 'border-[#34D399]/35'
                            : isUnstableDetected
                              ? 'border-[#FBBF24]/45'
                              : 'border-[#E2B68E]/70'
                      }`}
                    >
                      {/* Siku bingkai dekoratif di 4 sudut panduan */}
                      <span className="absolute -top-[2px] -left-[2px] w-5 h-5 border-t-[3px] border-l-[3px] rounded-tl-lg border-white/85" />
                      <span className="absolute -top-[2px] -right-[2px] w-5 h-5 border-t-[3px] border-r-[3px] rounded-tr-lg border-white/85" />
                      <span className="absolute -bottom-[2px] -left-[2px] w-5 h-5 border-b-[3px] border-l-[3px] rounded-bl-lg border-white/85" />
                      <span className="absolute -bottom-[2px] -right-[2px] w-5 h-5 border-b-[3px] border-r-[3px] rounded-br-lg border-white/85" />
                    </div>

                    {/* Poligon & sudut dokumen terdeteksi secara real-time */}
                    {autoScanEnabled && overlayQuad && (
                      <>
                        <svg
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                          className="absolute inset-0 w-full h-full"
                          aria-hidden="true"
                        >
                          <polygon
                            points={overlayQuad.map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' ')}
                            fill={polygonFill}
                            stroke={polygonStroke}
                            strokeWidth="2.5"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                            style={{
                              filter: isLockedReady
                                ? 'drop-shadow(0 0 6px rgba(52, 211, 153, 0.7))'
                                : 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.55))',
                            }}
                          />
                        </svg>
                        {overlayQuad.map((pt, idx) => (
                          <span
                            key={idx}
                            aria-hidden="true"
                            className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#171924] transition-colors duration-150"
                            style={{
                              left: `${pt.x}%`,
                              top: `${pt.y}%`,
                              backgroundColor: polygonStroke,
                              boxShadow: isLockedReady
                                ? '0 0 8px rgba(52, 211, 153, 0.8)'
                                : '0 0 6px rgba(251, 191, 36, 0.65)',
                            }}
                          />
                        ))}
                      </>
                    )}

                    {/* Badge status ringkas di sudut atas preview kamera */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-mono font-bold backdrop-blur-md border ${
                          !autoScanEnabled
                            ? 'bg-black/65 text-white/90 border-white/15'
                            : isLockedReady
                              ? 'bg-[#064E3B]/85 text-[#34D399] border-[#34D399]/50'
                              : isUnstableDetected
                                ? 'bg-[#451A03]/85 text-[#FBBF24] border-[#FBBF24]/50'
                                : 'bg-black/65 text-[#E2B68E] border-white/15'
                        }`}
                      >
                        <ScanLine className="w-3 h-3 shrink-0" />
                        {!autoScanEnabled
                          ? 'Mode Manual'
                          : isLockedReady
                            ? 'Siap Jepret'
                            : isUnstableDetected
                              ? 'Menyesuaikan Fokus'
                              : 'Mencari Struk'}
                      </span>

                      {autoScanEnabled && stabilityProgress > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-mono font-extrabold bg-black/75 text-[#34D399] border border-[#34D399]/40 backdrop-blur-md">
                          {stabilityProgress}%
                        </span>
                      )}
                    </div>

                    {/* Efek kilat singkat saat auto-capture mengambil gambar */}
                    {captureFlash && (
                      <div className="absolute inset-0 bg-white/70 transition-opacity duration-150" />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Panel Panduan Live + Progress Bar Kestabilan di Bawah Bingkai Kamera */}
        {cameraState === 'ready' && (
          <div className="rounded-xl border-2 border-[var(--border-color)] bg-[#FFFDF7] p-3 space-y-2 dark:bg-[#1F2333] dark:border dark:border-white/[0.10]">
            <div className="flex items-start gap-2">
              <span
                className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 transition-colors ${
                  !autoScanEnabled
                    ? 'bg-slate-400 dark:bg-[#8B9A9F]'
                    : isLockedReady
                      ? 'bg-[#10B981] dark:bg-[#34D399]'
                      : isUnstableDetected
                        ? 'bg-[#F59E0B] dark:bg-[#FBBF24]'
                        : 'bg-[#171924] dark:bg-[#E2B68E]'
                }`}
              />
              <p
                className={`text-xs font-bold leading-snug ${
                  isLockedReady
                    ? 'text-emerald-800 dark:text-[#34D399]'
                    : isUnstableDetected
                      ? 'text-amber-800 dark:text-[#FBBF24]'
                      : 'text-[#171924] dark:text-[#F1F5F9]'
                }`}
                aria-live="polite"
              >
                {guidanceText}
              </p>
            </div>

            {/* Progress bar kestabilan (~1.2 detik) */}
            {autoScanEnabled && (
              <div className="space-y-1">
                <div className="w-full h-2 rounded-full overflow-hidden bg-black/10 border border-[#171924]/20 dark:bg-[#171924] dark:border-white/[0.08]">
                  <div
                    className={`h-full rounded-full transition-[width,background-color] duration-100 ease-linear ${
                      isLockedReady
                        ? 'bg-[#10B981] dark:bg-[#34D399]'
                        : 'bg-[#F59E0B] dark:bg-[#E2B68E]'
                    }`}
                    style={{ width: `${stabilityProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono text-[var(--text-secondary)] dark:text-[#8B9A9F]">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#B45309] dark:text-[#E2B68E]" />
                    Auto-crop & 1x scan AI saat stabil
                  </span>
                  <button
                    type="button"
                    onClick={() => nativeCameraInputRef.current?.click()}
                    className="ax-link shrink-0 text-[10.5px]"
                  >
                    Kamera bawaan HP →
                  </button>
                </div>
              </div>
            )}

            {!autoScanEnabled && (
              <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono text-[var(--text-secondary)] dark:text-[#8B9A9F]">
                <span>Tips: pastikan angka TOTAL terlihat jelas & tidak silau.</span>
                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  className="ax-link shrink-0 text-[10.5px]"
                >
                  Kamera bawaan HP →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </ModalFrame>
  );
}
