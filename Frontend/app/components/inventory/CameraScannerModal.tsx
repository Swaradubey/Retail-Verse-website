import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { X, Camera, AlertCircle, RefreshCw, Zap, ZapOff } from 'lucide-react';
import { Button } from '../ui/button';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedBarcode: string) => void;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const isScannerRunningRef = useRef(false);

  // Helper to cleanly stop all active video camera tracks
  const stopAllCameraTracks = () => {
    try {
      const videoElements = document.querySelectorAll('video');
      videoElements.forEach((video) => {
        const stream = video.srcObject as MediaStream;
        if (stream && stream.getTracks) {
          stream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch (err) {
              console.warn('[CameraScanner] Error stopping track:', err);
            }
          });
        }
      });
    } catch (e) {
      console.warn('[CameraScanner] Error stopping video tracks:', e);
    }
  };

  // Toggle flashlight / torch if supported by active video track
  const toggleTorch = async () => {
    try {
      const videoElements = document.querySelectorAll('video');
      let foundTorch = false;
      for (const video of Array.from(videoElements)) {
        const stream = video.srcObject as MediaStream;
        if (stream) {
          const track = stream.getVideoTracks()[0];
          if (track) {
            const capabilities: any = track.getCapabilities?.() || {};
            if (capabilities.torch) {
              foundTorch = true;
              const nextState = !torchOn;
              await track.applyConstraints({
                advanced: [{ torch: nextState } as any],
              });
              setTorchOn(nextState);
              break;
            }
          }
        }
      }
      if (!foundTorch) {
        setHasTorch(false);
      }
    } catch (err) {
      console.warn('[CameraScanner] Torch toggle error:', err);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    setCameraError(null);
    setTorchOn(false);
    setHasTorch(false);
    isScannerRunningRef.current = true;

    // Small delay to ensure the DOM node is rendered in modal
    const initTimer = setTimeout(() => {
      try {
        const readerElement = document.getElementById('camera-barcode-reader');
        if (!readerElement) return;

        // Initialize Html5QrcodeScanner
        const scanner = new Html5QrcodeScanner(
          'camera-barcode-reader',
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const minEdgePercentage = 0.75;
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const qrboxSize = Math.floor(minEdge * minEdgePercentage);
              return {
                width: Math.min(320, qrboxSize),
                height: Math.min(180, Math.floor(qrboxSize * 0.6)),
              };
            },
            aspectRatio: 1.333333,
            showTorchButtonIfSupported: true,
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
          },
          /* verbose= */ false
        );

        scannerRef.current = scanner;

        scanner.render(
          (decodedText: string) => {
            if (!isScannerRunningRef.current) return;
            isScannerRunningRef.current = false;

            // Cleanly stop all active video camera tracks
            stopAllCameraTracks();

            // Clear scanner instance
            try {
              scanner.clear().catch((e) => console.warn('[CameraScanner] Clear on scan error:', e));
            } catch (clearErr) {
              console.warn('[CameraScanner] Clear exception:', clearErr);
            }

            // Callback with decoded barcode and close
            onScanSuccess(decodedText.trim());
            onClose();
          },
          (errorMessage: string) => {
            // Per-frame non-decode event - expected while looking for barcode
          }
        );

        // Check if torch is supported on current video track
        setTimeout(() => {
          try {
            const video = document.querySelector('video');
            if (video && video.srcObject) {
              const track = (video.srcObject as MediaStream).getVideoTracks()[0];
              const capabilities: any = track?.getCapabilities?.() || {};
              if (capabilities.torch) {
                setHasTorch(true);
              }
            }
          } catch (e) {
            // Ignore capability check error
          }
        }, 1200);
      } catch (err: any) {
        console.error('[CameraScanner] Initialization error:', err);
        setCameraError(err?.message || 'Failed to initialize camera scanner.');
      }
    }, 250);

    return () => {
      clearTimeout(initTimer);
      isScannerRunningRef.current = false;
      stopAllCameraTracks();
      if (scannerRef.current) {
        try {
          scannerRef.current.clear().catch((e) => console.warn('[CameraScanner] Unmount clear error:', e));
        } catch (e) {
          // ignore
        }
        scannerRef.current = null;
      }
    };
  }, [isOpen]);

  const handleClose = () => {
    isScannerRunningRef.current = false;
    stopAllCameraTracks();
    if (scannerRef.current) {
      try {
        scannerRef.current.clear().catch((e) => console.warn('[CameraScanner] Close clear error:', e));
      } catch (e) {
        // ignore
      }
      scannerRef.current = null;
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Scan Barcode / QR</h3>
              <p className="text-xs text-zinc-400">Point your camera at the product barcode</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasTorch && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleTorch}
                className={`h-9 px-3 rounded-xl border-zinc-700 ${
                  torchOn
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {torchOn ? <Zap className="w-4 h-4 mr-1 text-amber-400 fill-amber-400" /> : <ZapOff className="w-4 h-4 mr-1" />}
                {torchOn ? 'Torch On' : 'Torch'}
              </Button>
            )}
            <button
              onClick={handleClose}
              className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800/80 transition-colors"
              aria-label="Close scanner"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewport Area */}
        <div className="relative p-6 flex flex-col items-center justify-center bg-black min-h-[340px]">
          {cameraError ? (
            <div className="flex flex-col items-center justify-center text-center p-6 space-y-3 max-w-sm">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center border border-red-500/30">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-white">Camera Access Error</h4>
              <p className="text-xs text-zinc-400">{cameraError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCameraError(null);
                  isScannerRunningRef.current = true;
                }}
                className="mt-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry Camera
              </Button>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center relative">
              {/* HTML5 QrCode Container */}
              <div
                id="camera-barcode-reader"
                className="w-full rounded-2xl overflow-hidden [&_video]:rounded-xl [&_img]:hidden [&_button]:text-xs [&_button]:px-3 [&_button]:py-1.5 [&_button]:rounded-lg [&_button]:bg-indigo-600 [&_button]:text-white [&_button]:border-0 [&_select]:text-xs [&_select]:bg-zinc-800 [&_select]:text-white [&_select]:p-1.5 [&_select]:rounded-lg [&_select]:border-zinc-700 [&_a]:hidden"
              />

              {/* Laser scanning beam overlay animation */}
              <div className="pointer-events-none absolute inset-x-6 top-8 bottom-8 flex flex-col items-center justify-center">
                <div className="w-64 h-36 border-2 border-dashed border-indigo-400/60 rounded-xl relative overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.25)]">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-indigo-400" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-indigo-400" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-indigo-400" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-indigo-400" />
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-pulse" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer / Instructions */}
        <div className="px-6 py-4 border-t border-zinc-800/80 bg-zinc-900/90 flex items-center justify-between">
          <p className="text-xs text-zinc-400">
            Supports EAN-13, UPC, CODE128, QR Code, and standard retail barcodes.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};
