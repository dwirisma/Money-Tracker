import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, RotateCcw, Check, Upload, AlertTriangle } from 'lucide-react';
import { ModalFrame } from './ui/BaseUI';

interface CameraCaptureModalProps {
  onCaptureFile: (file: File) => void;
  onClose: () => void;
}

export function CameraCaptureModal({ onCaptureFile, onClose }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraState, setCameraState] = useState<'loading' | 'ready' | 'preview' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const capturedUrlRef = useRef<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  async function startCamera(targetFacing: 'environment' | 'user') {
    stopStream();
    setCameraState('loading');
    setErrorMessage('');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraState('error');
      setErrorMessage(
        'Browser ini tidak mendukung kamera langsung di dalam halaman. Gunakan tombol Kamera Bawaan / Pilih File di bawah.'
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

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraState('ready');
    } catch (err) {
      console.warn('Camera access failed:', err);
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setErrorMessage(
          'Izin kamera ditolak. Izinkan akses kamera di browser Anda atau gunakan tombol Kamera Bawaan / Upload Foto di bawah.'
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setErrorMessage(
          'Kamera tidak ditemukan pada perangkat ini. Anda tetap bisa memilih foto atau dokumen dari perangkat.'
        );
      } else {
        setErrorMessage(
          'Kamera langsung tidak dapat dibuka pada konteks ini. Gunakan tombol Kamera Bawaan / Pilih File di bawah.'
        );
      }
      setCameraState('error');
    }
  }

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      stopStream();
      if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    };
  }, []);

  function handleSwitchCamera() {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startCamera(next);
  }

  function handleTakeSnapshot() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
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
    startCamera(facingMode);
  }

  function handleConfirmCapture() {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `struk-kamera-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });
    onCaptureFile(file);
    onClose();
  }

  function handleFallbackFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onCaptureFile(file);
    onClose();
  }

  return (
    <ModalFrame
      wide
      title="Kamera Scan Struk"
      subtitle="Arahkan kamera ke struk belanja secara tegak lurus dan terang"
      icon={<Camera className="w-4 h-4" />}
      tint="var(--accent-lavender)"
      onClose={() => {
        stopStream();
        onClose();
      }}
      footer={
        <>
          <button
            type="button"
            className="brutal-btn brutal-btn-ghost"
            onClick={() => {
              stopStream();
              onClose();
            }}
          >
            Tutup
          </button>

          {cameraState === 'ready' && (
            <>
              <button
                type="button"
                className="brutal-btn brutal-btn-ghost"
                onClick={handleSwitchCamera}
                title="Ganti kamera depan/belakang"
              >
                <RefreshCw className="w-4 h-4" />
                Putar Kamera
              </button>
              <button
                type="button"
                className="brutal-btn brutal-btn-sand"
                onClick={handleTakeSnapshot}
              >
                <Camera className="w-4 h-4" />
                Ambil Foto
              </button>
            </>
          )}

          {cameraState === 'preview' && (
            <>
              <button
                type="button"
                className="brutal-btn brutal-btn-ghost"
                onClick={handleRetake}
              >
                <RotateCcw className="w-4 h-4" />
                Foto Ulang
              </button>
              <button
                type="button"
                className="brutal-btn brutal-btn-sage"
                onClick={handleConfirmCapture}
              >
                <Check className="w-4 h-4" />
                Scan Struk Ini
              </button>
            </>
          )}
        </>
      }
    >
      <div className="ax-form">
        <input
          ref={fallbackInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFallbackFile}
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
                onClick={() => startCamera(facingMode)}
                className="brutal-btn brutal-btn-ghost text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Coba Buka Kamera Lagi
              </button>
              <button
                type="button"
                onClick={() => fallbackInputRef.current?.click()}
                className="brutal-btn brutal-btn-sand text-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                Buka Kamera Bawaan / Pilih Foto
              </button>
            </div>
          </div>
        ) : (
          <div className="relative w-full overflow-hidden rounded-2xl border-2 border-[var(--border-color)] bg-[#111] shadow-[var(--shadow-sm)] dark:border dark:border-white/[0.12] dark:bg-[#0B0D12] dark:shadow-none aspect-[3/4] sm:aspect-[4/3] max-h-[60vh]">
            {cameraState === 'loading' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white text-xs font-mono z-10 bg-black/70">
                <RefreshCw className="w-6 h-6 animate-spin text-[var(--accent-sand)]" />
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
                {cameraState === 'ready' && (
                  <div className="pointer-events-none absolute inset-6 border-2 border-dashed border-[var(--accent-sand)]/80 rounded-xl flex items-end justify-center pb-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-black/70 text-[10px] font-mono font-bold text-white">
                      Posisikan struk di dalam bingkai
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {cameraState === 'ready' && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
            <span>Tips: pastikan tulisan nominal TOTAL terlihat tajam & tidak silau.</span>
            <button
              type="button"
              onClick={() => fallbackInputRef.current?.click()}
              className="ax-link shrink-0"
            >
              Pakai kamera bawaan HP →
            </button>
          </div>
        )}
      </div>
    </ModalFrame>
  );
}
