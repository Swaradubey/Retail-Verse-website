import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, RefreshCw, AlertCircle, Sparkles, SwitchCamera } from 'lucide-react';
import { Button } from '../ui/button';

interface CameraPhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64Image: string) => void;
}

export const CameraPhotoModal: React.FC<CameraPhotoModalProps> = ({
  isOpen,
  onClose,
  onCapture,
}) => {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isLoading, setIsLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Helper to cleanly stop all active video tracks and release hardware resources
  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('[CameraPhotoModal] Track stop warning:', e);
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Start device live camera stream with fallback
  const startCamera = useCallback(async (mode: 'environment' | 'user') => {
    stopTracks();
    setIsLoading(true);
    setCameraError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera API is not supported in this browser environment. Please use file upload.');
      setIsLoading(false);
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch (constraintErr) {
        // Fallback if specific facingMode or resolution constraint is rejected
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch((playErr) => {
          console.warn('[CameraPhotoModal] Video play warning:', playErr);
        });
      }
      setIsLoading(false);
    } catch (err: any) {
      console.error('[CameraPhotoModal] getUserMedia error:', err);
      let message = 'Unable to access device camera. Please check browser permissions.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = 'Camera permission was denied. Please allow camera access in your browser settings to take product photos.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = 'No camera device found on this system.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = 'Camera is already in use by another application.';
      }
      setCameraError(message);
      setIsLoading(false);
    }
  }, [stopTracks]);

  // Manage camera lifecycle based on isOpen and facingMode
  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopTracks();
    }

    return () => {
      stopTracks();
    };
  }, [isOpen, facingMode, startCamera, stopTracks]);

  // Switch between back and front camera
  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
  };

  // Frame capture and client-side compression
  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || isCapturing) {
      return;
    }

    try {
      setIsCapturing(true);

      const canvas = document.createElement('canvas');
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // Limit max dimension to 1200px for high-clarity yet lightweight files (< 150KB)
      const maxDim = 1200;
      let targetW = vw;
      let targetH = vh;
      if (vw > maxDim || vh > maxDim) {
        if (vw > vh) {
          targetH = Math.round((vh * maxDim) / vw);
          targetW = maxDim;
        } else {
          targetW = Math.round((vw * maxDim) / vh);
          targetH = maxDim;
        }
      }

      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas 2D context not available');
      }

      // If user camera, mirror frame horizontally for natural selfie orientation
      if (facingMode === 'user') {
        ctx.translate(targetW, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, targetW, targetH);

      // Convert to WebP 0.8 quality, fallback to JPEG 0.8
      let compressedData = canvas.toDataURL('image/webp', 0.8);
      if (!compressedData.startsWith('data:image/webp')) {
        compressedData = canvas.toDataURL('image/jpeg', 0.8);
      }

      // Immediately stop media stream to free hardware resources & prevent battery drain
      stopTracks();

      onCapture(compressedData);
      onClose();
    } catch (err) {
      console.error('[CameraPhotoModal] Capture error:', err);
      setCameraError('Failed to capture frame. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/80 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Live Camera Photo Capture
              </h3>
              <p className="text-[11px] text-zinc-400">
                Frame your product clearly in the guide reticle
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center transition-colors"
            aria-label="Close camera"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Viewport Container */}
        <div className="relative w-full aspect-[4/3] bg-black overflow-hidden flex items-center justify-center">
          {/* Live Video Feed */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              facingMode === 'user' ? 'scale-x-[-1]' : ''
            } ${isLoading || cameraError ? 'opacity-0' : 'opacity-100'}`}
          />

          {/* Loading Indicator */}
          {isLoading && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/80 text-white">
              <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" />
              <p className="text-xs text-zinc-300 font-medium">Starting camera...</p>
            </div>
          )}

          {/* Error Message */}
          {cameraError && (
            <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center gap-3 bg-zinc-950 text-white">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold text-red-300 max-w-sm">{cameraError}</p>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => startCamera(facingMode)}
                  className="rounded-xl border-zinc-700 text-xs gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Try Again
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={onClose}
                  className="rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs"
                >
                  Close
                </Button>
              </div>
            </div>
          )}

          {/* Reticle Frame Overlay */}
          {!isLoading && !cameraError && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
              <div className="relative w-full h-full max-w-[85%] max-h-[85%] border-2 border-white/30 rounded-2xl flex flex-col items-center justify-between p-3 shadow-[0_0_30px_rgba(0,0,0,0.6)]">
                {/* 4 Corner Accents */}
                <span className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-indigo-400 rounded-tl-xl" />
                <span className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-indigo-400 rounded-tr-xl" />
                <span className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-indigo-400 rounded-bl-xl" />
                <span className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-indigo-400 rounded-br-xl" />

                {/* Reticle Tag */}
                <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 text-[10px] font-semibold text-white/90 flex items-center gap-1.5 shadow-sm">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  Position product in frame
                </div>

                <div className="text-[10px] text-white/60 font-mono">
                  {facingMode === 'environment' ? 'Rear Camera (High-Res)' : 'Front Camera'}
                </div>
              </div>
            </div>
          )}

          {/* Top-Right Camera Switch Floating Button */}
          {!isLoading && !cameraError && (
            <button
              type="button"
              onClick={handleToggleFacingMode}
              title={`Switch to ${facingMode === 'environment' ? 'front' : 'rear'} camera`}
              className="absolute top-4 right-4 z-10 px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md transition-all active:scale-95"
            >
              <SwitchCamera className="w-3.5 h-3.5 text-indigo-400" />
              <span>Switch Camera</span>
            </button>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-6 py-4 bg-zinc-950 flex items-center justify-between gap-4 border-t border-zinc-800">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="text-xs text-zinc-400 hover:text-white rounded-xl"
          >
            Cancel
          </Button>

          {/* Shutter Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isLoading || !!cameraError || isCapturing}
              onClick={handleCapturePhoto}
              aria-label="Capture product photo"
              className="group relative w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 p-1 flex items-center justify-center shadow-lg shadow-indigo-600/40 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              <div className="w-full h-full rounded-full border-2 border-white/80 bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <Camera className="w-7 h-7 text-white stroke-[2.2]" />
              </div>
            </button>
          </div>

          <div className="w-16 text-right">
            <span className="text-[11px] font-mono text-zinc-500">Auto WebP</span>
          </div>
        </div>
      </div>
    </div>
  );
};
