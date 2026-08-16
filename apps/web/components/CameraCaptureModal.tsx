"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, SwitchCamera, X, Check, Trash2 } from "lucide-react";

interface CameraCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  /** Keep the modal open after a capture so the user can take more than one photo. */
  continuous?: boolean;
  /** Live previews of photos captured so far */
  capturedPreviews?: { previewUrl: string }[];
  /** Callback to remove a captured photo directly inside the camera modal */
  onRemoveCaptured?: (index: number) => void;
}

export default function CameraCaptureModal({
  open,
  onClose,
  onCapture,
  continuous = false,
  capturedPreviews = [],
  onRemoveCaptured,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [flash, setFlash] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    stopStream();
    setError(null);
    setBlocked(false);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err: DOMException) => {
        if (cancelled) return;
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setBlocked(true);
          setError("Camera access is blocked for this site — the browser won't ask again on its own. Click the camera icon in your address bar, allow access, then hit Try Again below.");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setError("No camera was found on this device. Please upload a file instead.");
        } else {
          setError("Camera is unavailable right now. Please upload a file instead.");
        }
      });

    navigator.mediaDevices
      .enumerateDevices()
      .then(devices => setHasMultipleCameras(devices.filter(d => d.kind === "videoinput").length > 1))
      .catch(() => {});

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, facingMode, retryKey]);

  function handleClose() {
    stopStream();
    onClose();
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const MAX_DIM = 1080;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > MAX_DIM || h > MAX_DIM) {
      if (w > h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
      else { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);

    if (continuous) {
      setFlash(true);
      setTimeout(() => setFlash(false), 150);
    }

    canvas.toBlob(blob => {
      if (!blob) return;
      onCapture(new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" }));
      if (!continuous) {
        handleClose();
      }
    }, "image/jpeg", 0.85);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col font-sans">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between p-4 shrink-0 bg-black/80 backdrop-blur-md z-10 border-b border-white/10">
        <button
          type="button"
          onClick={handleClose}
          className="h-10 px-3.5 rounded-full bg-white/10 hover:bg-white/20 flex items-center gap-2 text-white transition-colors text-xs font-extrabold"
          title="Back"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back</span>
        </button>

        {capturedPreviews && capturedPreviews.length > 0 && (
          <div className="text-xs font-extrabold text-white/90 bg-white/10 px-3 py-1 rounded-full">
            {capturedPreviews.length} Photo{capturedPreviews.length > 1 ? "s" : ""} Captured
          </div>
        )}

        {hasMultipleCameras ? (
          <button
            type="button"
            onClick={() => setFacingMode(m => (m === "environment" ? "user" : "environment"))}
            className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            title="Switch camera"
          >
            <SwitchCamera className="h-5 w-5" />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Video Stream Viewport */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black">
        {error ? (
          <div className="flex flex-col items-center gap-4 px-8 text-center">
            <p className="text-white text-sm font-medium">{error}</p>
            {blocked && (
              <button
                type="button"
                onClick={() => setRetryKey(k => k + 1)}
                className="h-10 px-5 rounded-full bg-white text-black text-xs font-bold hover:bg-white/90 transition-colors"
              >
                Try Again
              </button>
            )}
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="max-h-full max-w-full object-contain" />
        )}
        {flash && <div className="absolute inset-0 bg-white/70" />}
      </div>

      {/* Live Captured Thumbnails Strip */}
      {capturedPreviews && capturedPreviews.length > 0 && (
        <div className="px-4 py-2.5 shrink-0 bg-black/90 backdrop-blur-md border-t border-white/10 z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-white/70">
              Captured Photos ({capturedPreviews.length})
            </span>
            <span className="text-[10px] font-semibold text-white/40">
              Tap delete badge to remove
            </span>
          </div>
          <div className="flex items-center gap-2.5 overflow-x-auto py-1 scrollbar-hide">
            {capturedPreviews.map((img, i) => (
              <div key={i} className="relative h-16 w-16 rounded-xl overflow-hidden border border-white/30 shrink-0 group shadow-md">
                <img src={img.previewUrl} alt={`Captured ${i + 1}`} className="w-full h-full object-cover" />
                {onRemoveCaptured && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveCaptured(i);
                    }}
                    className="absolute top-1 right-1 h-5 w-5 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                    title="Remove photo"
                  >
                    <X className="h-3 w-3 stroke-[3]" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Shutter & Controls Bar */}
      <div className="p-4 sm:p-5 flex items-center justify-between shrink-0 bg-black z-10 border-t border-white/10">
        <div className="w-20" />

        {/* Shutter Button */}
        <button
          type="button"
          onClick={capture}
          disabled={!!error}
          aria-label="Take photo"
          className="h-16 w-16 rounded-full bg-white border-4 border-white/30 hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 shadow-lg cursor-pointer"
        />

        {/* Done / Accept Button */}
        <div className="w-20 flex justify-end">
          {capturedPreviews && capturedPreviews.length > 0 && (
            <button
              type="button"
              onClick={handleClose}
              className="h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black transition-all flex items-center gap-1.5 shadow-md"
            >
              <span>Done</span>
              <Check className="h-4 w-4" strokeWidth={3} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
