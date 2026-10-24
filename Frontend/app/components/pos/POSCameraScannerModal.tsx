import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  X,
  Camera,
  AlertCircle,
  RefreshCw,
  Zap,
  ZapOff,
  CheckCircle2,
  ScanBarcode,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Button } from '../ui/button';

export interface ScanResultFeedback {
  success: boolean;
  productName?: string;
  barcode?: string;
  message?: string;
}

interface POSCameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanBarcode: (decodedBarcode: string) => Promise<ScanResultFeedback | boolean>;
}

const READER_ELEMENT_ID = 'pos-camera-barcode-reader';

export const POSCameraScannerModal: React.FC<POSCameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScanBarcode,
}) => {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isContinuousScan, setIsContinuousScan] = useState(true);
  const [lastScanFeedback, setLastScanFeedback] = useState<ScanResultFeedback | null>(null);
  const [flashFeedback, setFlashFeedback] = useState<'success' | 'error' | null>(null);
  const [scannedCount, setScannedCount] = useState(0);

  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const isScanningActiveRef = useRef(false);
  const lastScannedBarcodeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const isProcessingScanRef = useRef(false);

  // Helper to cleanly stop all active video camera tracks
  const stopAllCameraTracks = useCallback(() => {
    try {
      const videoElements = document.querySelectorAll('video');
      videoElements.forEach((video) => {
        const stream = video.srcObject as MediaStream;
        if (stream && stream.getTracks) {
          stream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch (err) {
              console.warn('[POSCameraScanner] Error stopping track:', err);
            }
          });
        }
      });
    } catch (e) {
      console.warn('[POSCameraScanner] Error stopping video tracks:', e);
    }
  }, []);

  // Cleanup scanner instance safely
  const cleanupScanner = useCallback(async () => {
    isScanningActiveRef.current = false;
    const scanner = scannerInstanceRef.current;
    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch (err) {
        console.warn('[POSCameraScanner] Error stopping scanner:', err);
      }
      try {
        scanner.clear();
      } catch (err) {
        console.warn('[POSCameraScanner] Error clearing scanner:', err);
      }
      scannerInstanceRef.current = null;
    }
    stopAllCameraTracks();
  }, [stopAllCameraTracks]);

  // Toggle torch / flashlight if supported
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
      console.warn('[POSCameraScanner] Torch toggle error:', err);
    }
  };

  // Main barcode detection handler
  const handleDecodedBarcode = useCallback(
    async (decodedText: string) => {
      const rawCode = decodedText.trim();
      if (!rawCode || isProcessingScanRef.current || !isScanningActiveRef.current) return;

      const now = Date.now();
      // Debounce duplicate reads of the exact same barcode within 1.8 seconds
      if (
        lastScannedBarcodeRef.current.code === rawCode &&
        now - lastScannedBarcodeRef.current.time < 1800
      ) {
        return;
      }

      isProcessingScanRef.current = true;
      lastScannedBarcodeRef.current = { code: rawCode, time: now };

      try {
        const result = await onScanBarcode(rawCode);
        const isSuccess =
          typeof result === 'boolean' ? result : Boolean(result && result.success);

        if (isSuccess) {
          const prodName = typeof result === 'object' && result?.productName ? result.productName : undefined;
          setLastScanFeedback({
            success: true,
            barcode: rawCode,
            productName: prodName,
            message: prodName ? `Added "${prodName}" to cart` : `Barcode "${rawCode}" added to cart`,
          });
          setFlashFeedback('success');
          setScannedCount((prev) => prev + 1);

          setTimeout(() => {
            setFlashFeedback(null);
          }, 600);

          if (!isContinuousScan) {
            // Close modal after brief feedback
            setTimeout(async () => {
              await cleanupScanner();
              onClose();
            }, 300);
            return;
          }
        } else {
          setLastScanFeedback({
            success: false,
            barcode: rawCode,
            message: 'Product not found for scanned barcode',
          });
          setFlashFeedback('error');
          setTimeout(() => {
            setFlashFeedback(null);
          }, 800);
        }
      } catch (err: any) {
        console.error('[POSCameraScanner] Error processing barcode:', err);
        setLastScanFeedback({
          success: false,
          barcode: rawCode,
          message: err?.message || 'Error adding scanned product',
        });
        setFlashFeedback('error');
      } finally {
        setTimeout(() => {
          isProcessingScanRef.current = false;
        }, 500);
      }
    },
    [isContinuousScan, onScanBarcode, cleanupScanner, onClose]
  );

  // Initialize camera scanner
  const startScanner = useCallback(async () => {
    setCameraError(null);
    setIsInitializing(true);
    setTorchOn(false);
    setHasTorch(false);

    try {
      await cleanupScanner();

      // Ensure DOM element is present
      const container = document.getElementById(READER_ELEMENT_ID);
      if (!container) {
        throw new Error('Scanner container not found in DOM');
      }

      const html5QrCode = new Html5Qrcode(READER_ELEMENT_ID, false);
      scannerInstanceRef.current = html5QrCode;

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdgePercentage = 0.75;
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minEdge * minEdgePercentage);
          return {
            width: Math.min(360, qrboxSize),
            height: Math.min(200, Math.floor(qrboxSize * 0.6)),
          };
        },
        aspectRatio: 1.333333,
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText: string) => {
          handleDecodedBarcode(decodedText);
        },
        () => {
          // Frame non-decode (expected while scanning)
        }
      );

      isScanningActiveRef.current = true;
      setIsInitializing(false);

      // Check torch capability after stream starts
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
          // ignore
        }
      }, 1000);
    } catch (err: any) {
      console.error('[POSCameraScanner] Init error:', err);
      setIsInitializing(false);
      isScanningActiveRef.current = false;
      const msg = err?.message || String(err);
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setCameraError('Camera access denied. Please allow camera permissions in your browser to scan barcodes.');
      } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError')) {
        setCameraError('No camera detected on this device. Please connect a webcam.');
      } else if (msg.includes('NotReadableError') || msg.includes('TrackStartError')) {
        setCameraError('Camera is currently in use by another application.');
      } else {
        setCameraError('Could not start camera scanner. Please verify device permissions.');
      }
    }
  }, [cleanupScanner, handleDecodedBarcode]);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const timer = setTimeout(() => {
      if (mounted) {
        startScanner();
      }
    }, 200);

    return () => {
      mounted = false;
      clearTimeout(timer);
      cleanupScanner();
    };
  }, [isOpen, startScanner, cleanupScanner]);

  const handleModalClose = async () => {
    await cleanupScanner();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="POS Camera Barcode Scanner"
    >
      <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80 bg-zinc-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center border border-violet-500/30 shrink-0">
              <Camera className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Live Camera Scanner</h3>
                {scannedCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {scannedCount} added
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400">Scan product barcode or SKU to add to cart</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Continuous Scan Toggle */}
            <button
              type="button"
              onClick={() => setIsContinuousScan((prev) => !prev)}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition flex items-center gap-1 ${
                isContinuousScan
                  ? 'bg-violet-600/20 text-violet-300 border-violet-500/40 hover:bg-violet-600/30'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
              }`}
              title="Continuous scan keeps camera open to scan multiple items"
            >
              <Layers className="w-3 h-3" />
              <span>{isContinuousScan ? 'Continuous: ON' : 'Single Scan'}</span>
            </button>

            {hasTorch && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleTorch}
                className={`h-8 px-2.5 rounded-lg border-zinc-700 text-xs ${
                  torchOn
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {torchOn ? <Zap className="w-3.5 h-3.5 mr-1 text-amber-400 fill-amber-400" /> : <ZapOff className="w-3.5 h-3.5 mr-1" />}
                {torchOn ? 'Torch' : 'Torch'}
              </Button>
            )}

            <button
              onClick={handleModalClose}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
              aria-label="Close scanner"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewport Area */}
        <div className="relative p-4 flex flex-col items-center justify-center bg-black min-h-[320px] max-h-[460px] overflow-hidden">
          {cameraError ? (
            <div className="flex flex-col items-center justify-center text-center p-6 space-y-3 max-w-sm">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-white">Camera Access Error</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">{cameraError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startScanner}
                className="mt-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry Camera
              </Button>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center relative">
              {/* HTML5 QrCode Reader Container */}
              <div
                id={READER_ELEMENT_ID}
                className="w-full rounded-2xl overflow-hidden [&_video]:rounded-xl [&_img]:hidden [&_button]:text-xs [&_button]:px-3 [&_button]:py-1.5 [&_button]:rounded-lg [&_button]:bg-violet-600 [&_button]:text-white [&_button]:border-0 [&_select]:text-xs [&_select]:bg-zinc-800 [&_select]:text-white [&_select]:p-1.5 [&_select]:rounded-lg [&_select]:border-zinc-700 [&_a]:hidden"
              />

              {/* Initializing Spinner */}
              {isInitializing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-xs gap-2 z-10">
                  <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-zinc-300 font-medium">Starting camera stream...</span>
                </div>
              )}

              {/* Laser Scanning Reticle & Overlay Box */}
              {!cameraError && !isInitializing && (
                <div
                  className={`pointer-events-none absolute inset-x-4 top-4 bottom-4 flex flex-col items-center justify-center transition-all duration-200 ${
                    flashFeedback === 'success'
                      ? 'scale-[1.02]'
                      : flashFeedback === 'error'
                      ? 'shake'
                      : ''
                  }`}
                >
                  <div
                    className={`w-64 sm:w-72 h-36 sm:h-40 border-2 rounded-2xl relative overflow-hidden transition-all duration-200 ${
                      flashFeedback === 'success'
                        ? 'border-emerald-400 bg-emerald-500/15 shadow-[0_0_25px_rgba(16,185,129,0.5)]'
                        : flashFeedback === 'error'
                        ? 'border-rose-400 bg-rose-500/15 shadow-[0_0_25px_rgba(244,63,94,0.5)]'
                        : 'border-dashed border-violet-400/70 shadow-[0_0_20px_rgba(139,92,246,0.3)]'
                    }`}
                  >
                    {/* Reticle Corner Brackets */}
                    <div className="absolute top-0 left-0 w-5 h-5 border-t-3 border-l-3 border-violet-400 rounded-tl" />
                    <div className="absolute top-0 right-0 w-5 h-5 border-t-3 border-r-3 border-violet-400 rounded-tr" />
                    <div className="absolute bottom-0 left-0 w-5 h-5 border-b-3 border-l-3 border-violet-400 rounded-bl" />
                    <div className="absolute bottom-0 right-0 w-5 h-5 border-b-3 border-r-3 border-violet-400 rounded-br" />

                    {/* Animated Red Laser Beam */}
                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_10px_#ef4444] animate-pulse relative top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Inline Live Feedback Toast / Banner */}
          {lastScanFeedback && (
            <div
              className={`mt-3 w-full max-w-sm px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150 ${
                lastScanFeedback.success
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                  : 'bg-rose-950/80 text-rose-300 border border-rose-800'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                {lastScanFeedback.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span className="truncate">{lastScanFeedback.message}</span>
              </div>
              {lastScanFeedback.barcode && (
                <span className="font-mono text-[10px] text-zinc-400 bg-black/40 px-1.5 py-0.5 rounded shrink-0">
                  {lastScanFeedback.barcode}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer / Instructions */}
        <div className="px-5 py-3 border-t border-zinc-800/80 bg-zinc-900/90 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <ScanBarcode className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span>Position retail barcode or QR code inside the box</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleModalClose}
            className="text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 h-8 px-3 rounded-lg"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
