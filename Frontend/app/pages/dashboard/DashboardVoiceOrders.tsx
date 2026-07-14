import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Upload, Square, Pause, Play, Trash2, FileAudio,
  Sparkles, ChevronDown, ChevronUp, Edit3, Check, X, RefreshCw,
  ShoppingCart, AlertTriangle, Info, Volume2, Eye, RotateCcw,
  Plus, Minus, Search, Phone, User, MapPin, Clock, Globe,
  CheckCircle2, XCircle, Loader2, ArrowRight, FileText, Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { voiceOrdersApi, type VoiceOrder, type VoiceOrderItem, type VoiceOrderStatus } from '../../api/voiceOrders';
import { toast } from 'sonner';
import { isSuperAdminRole, isClientRole } from '../../utils/staffRoles';

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<VoiceOrderStatus, { label: string; color: string }> = {
  uploaded:              { label: 'Uploaded',            color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' },
  transcribing:          { label: 'Transcribing…',       color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' },
  transcribed:           { label: 'Transcribed',         color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' },
  transcription_failed:  { label: 'Transcription Failed',color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' },
  extracting:            { label: 'Extracting…',         color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200' },
  extracting_order:      { label: 'Extracting Order…',   color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200' },
  needs_review:          { label: 'Needs Review',        color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' },
  ready_for_review:      { label: 'Ready for Review',   color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200' },
  draft:                 { label: 'Draft',               color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200' },
  confirmed:             { label: 'Confirmed',           color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200' },
  order_created:         { label: 'Order Created',       color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' },
  failed:                { label: 'Failed',              color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' },
  order_extraction_failed: { label: 'Extraction Failed', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' },
  cancelled:             { label: 'Cancelled',           color: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
};

function StatusBadge({ status }: { status: VoiceOrderStatus }) {
  const meta = STATUS_META[status] || { label: status, color: 'bg-zinc-100 text-zinc-700' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${meta.color}`}>
      {meta.label}
    </span>
  );
}

// ── Confidence bar ───────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── Format duration ──────────────────────────────────────────────────────────

function formatDuration(secs: number | null | undefined) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Format file size ─────────────────────────────────────────────────────────

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Recording hook ───────────────────────────────────────────────────────────

type RecordingState = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopped' | 'error';

interface UseRecorderReturn {
  state: RecordingState;
  elapsed: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  errorMessage: string | null;
  mimeType: string;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  clear: () => void;
}

function useRecorder(): UseRecorderReturn {
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const MIME =
    MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
      ? 'audio/ogg;codecs=opus'
      : 'audio/webm';

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('error');
      setErrorMessage('Your browser does not support audio recording. Please use Chrome, Firefox, or Edge.');
      return;
    }
    setState('requesting');
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: MIME });
      mediaRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: MIME });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setState('stopped');
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start(250); // collect chunks every 250ms
      setState('recording');
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    } catch (err: unknown) {
      setState('error');
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('notallowed')) {
        setErrorMessage('Microphone access was denied. Please allow microphone permissions in your browser settings and try again.');
      } else {
        setErrorMessage(`Could not start recording: ${msg}`);
      }
    }
  }, [MIME]);

  const pause = useCallback(() => {
    if (mediaRef.current?.state === 'recording') {
      mediaRef.current.pause();
      stopTimer();
      setState('paused');
    }
  }, []);

  const resume = useCallback(() => {
    if (mediaRef.current?.state === 'paused') {
      mediaRef.current.resume();
      setState('recording');
      timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    }
  }, []);

  const stop = useCallback(() => {
    stopTimer();
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      mediaRef.current.stop();
    }
  }, []);

  const clear = useCallback(() => {
    stop();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setState('idle');
    setElapsed(0);
    setErrorMessage(null);
    chunksRef.current = [];
  }, [stop, audioUrl]);

  useEffect(() => () => { stopTimer(); streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  return { state, elapsed, audioBlob, audioUrl, errorMessage, mimeType: MIME, start, pause, resume, stop, clear };
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Page Component
// ══════════════════════════════════════════════════════════════════════════════

export function DashboardVoiceOrders() {
  const { user } = useAuth();
  const recorder = useRecorder();

  // ── View state ─────────────────────────────────────────────────────────────
  const [view, setView] = useState<'capture' | 'review' | 'history'>('capture');

  // ── Upload state ───────────────────────────────────────────────────────────
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Current voice order (after upload/record) ──────────────────────────────
  const [currentVo, setCurrentVo] = useState<VoiceOrder | null>(null);

  // ── Loading states ─────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // ── Error state for error card ────────────────────────────────────────────
  const [transcriptionError, setTranscriptionError] = useState<{
    title: string;
    message: string;
    errorRef?: string;
    code?: string;
  } | null>(null);

  // ── Review state ───────────────────────────────────────────────────────────
  const [editedTranscription, setEditedTranscription] = useState('');
  const [editingTranscription, setEditingTranscription] = useState(false);
  const [editedItems, setEditedItems] = useState<VoiceOrderItem[]>([]);
  const [draftCustomer, setDraftCustomer] = useState({ name: '', phone: '', email: '' });
  const [draftFulfilment, setDraftFulfilment] = useState<{ type: 'delivery' | 'pickup' | 'unknown'; address: string }>({ type: 'unknown', address: '' });

  // ── History ────────────────────────────────────────────────────────────────
  const [history, setHistory] = useState<VoiceOrder[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyFilter, setHistoryFilter] = useState<{ status: string; search: string }>({ status: '', search: '' });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const isSuperAdmin = isSuperAdminRole(user?.role);
  const isClient = isClientRole(user?.role);
  const canUseVoiceOrders = isSuperAdmin || isClient;

  // ── Sync review state when voice order updates ─────────────────────────────
  useEffect(() => {
    if (!currentVo) return;
    setEditedTranscription(currentVo.transcription || '');
    const ex = currentVo.extractedData;
    if (ex) {
      setDraftCustomer({
        name: ex.customer?.name || '',
        phone: ex.customer?.phone || '',
        email: ex.customer?.email || '',
      });
      setDraftFulfilment({
        type: ex.fulfilment?.type || 'unknown',
        address: ex.fulfilment?.address || '',
      });
    }
    setEditedItems(currentVo.resolvedItems || []);
  }, [currentVo]);

  // ── Load history ───────────────────────────────────────────────────────────
  const loadHistory = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const res = await voiceOrdersApi.list({
        page,
        limit: 15,
        status: historyFilter.status as VoiceOrderStatus | '',
        search: historyFilter.search || undefined,
      });
      setHistory(res.data as unknown as VoiceOrder[]);
      setHistoryTotal((res as unknown as { pagination: { total: number } }).pagination?.total || 0);
      setHistoryPage(page);
    } catch (err) {
      toast.error('Failed to load voice order history.');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyFilter]);

  useEffect(() => {
    if (view === 'history') loadHistory(1);
  }, [view, loadHistory]);

  // ── Handle file upload ─────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/ogg', 'video/webm', 'video/ogg'];
    if (!allowed.includes(f.type)) {
      toast.error(`Unsupported format: ${f.type}. Allowed: MP3, WAV, M4A, WEBM, OGG`);
      return;
    }
    const MAX_MB = 25;
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`File is too large. Maximum: ${MAX_MB} MB`);
      return;
    }
    setUploadedFile(f);
    setUploadedUrl(URL.createObjectURL(f));
    recorder.clear();
  };

  // ── Determine active audio blob/file ──────────────────────────────────────
  const activeBlob = recorder.audioBlob || uploadedFile;
  const activeAudioUrl = recorder.audioUrl || uploadedUrl;
  const activeMimeType = recorder.audioBlob ? recorder.mimeType : (uploadedFile?.type || 'audio/webm');
  const activeFileName = uploadedFile?.name || `recording_${new Date().toISOString()}.webm`;
  const hasAudio = !!activeBlob;

  // ── Upload and create voice order ─────────────────────────────────────────
  const handleUploadAndCreate = async () => {
    if (!activeBlob) return;
    setUploading(true);
    try {
      const blob = activeBlob instanceof File ? activeBlob : activeBlob;
      const res = await voiceOrdersApi.uploadAudio(
        blob,
        activeMimeType,
        activeFileName,
        undefined, // storeId resolved server-side for client role
        recorder.elapsed > 0 ? recorder.elapsed : undefined
      );
      setCurrentVo(res.data);
      toast.success('Audio uploaded. Click "Generate Transcription" to continue.');
      setView('review');
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // ── Transcribe ─────────────────────────────────────────────────────────────
  const handleTranscribe = async () => {
    if (!currentVo) return;
    setTranscribing(true);
    setTranscriptionError(null);
    try {
      const res = await voiceOrdersApi.transcribe(currentVo._id);
      const data = res as unknown as { data: VoiceOrder; message?: string; extractionError?: boolean; errorRef?: string };
      setCurrentVo(data.data);
      if (data.extractionError) {
        toast.warning('Transcription complete, but AI extraction encountered an issue. Review the result or retry.');
      } else {
        toast.success(data.message || 'Transcription and extraction complete!');
      }
      if (data.data.status === 'ready_for_review') {
        setView('review');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; errorRef?: string; code?: string } } };
      const msg = axiosErr?.response?.data?.message || (err instanceof Error ? err.message : null) || 'Transcription failed.';
      const errorRef = axiosErr?.response?.data?.errorRef || null;
      const code = axiosErr?.response?.data?.code || null;

      let title = 'Transcription Failed';
      if (code === 'QUOTA_LIMIT_ZERO') title = 'Billing Required';
      else if (code === 'QUOTA_EXCEEDED') title = 'API Quota Exceeded';
      else if (code === 'RATE_LIMITED') title = 'Rate Limited';
      else if (code === 'AUTH_ERROR') title = 'API Key Error';
      else if (code === 'UNSUPPORTED_AUDIO') title = 'Unsupported Audio';
      else if (code === 'FILE_TOO_LARGE') title = 'File Too Large';
      else if (code === 'PROVIDER_NOT_CONFIGURED') title = 'Not Configured';

      setTranscriptionError({ title, message: msg, errorRef, code });
      toast.error(msg);
    } finally {
      setTranscribing(false);
    }
  };

  // ── Extract ────────────────────────────────────────────────────────────────
  const handleExtract = async () => {
    if (!currentVo) return;
    setExtracting(true);
    setTranscriptionError(null);
    try {
      const res = await voiceOrdersApi.extract(currentVo._id);
      setCurrentVo(res.data as unknown as VoiceOrder);
      toast.success('AI extraction complete!');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; errorRef?: string; code?: string } } };
      const msg = axiosErr?.response?.data?.message || (err instanceof Error ? err.message : null) || 'Extraction failed.';
      const errorRef = axiosErr?.response?.data?.errorRef || null;
      const code = axiosErr?.response?.data?.code || null;
      let title = 'Extraction Failed';
      if (code === 'QUOTA_EXCEEDED') title = 'API Quota Exceeded';
      else if (code === 'AUTH_ERROR') title = 'API Key Error';
      setTranscriptionError({ title, message: msg, errorRef, code });
      toast.error(msg);
    } finally {
      setExtracting(false);
    }
  };

  // ── Save draft ─────────────────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    if (!currentVo) return;
    setSavingDraft(true);
    try {
      const res = await voiceOrdersApi.saveDraft(currentVo._id, {
        transcription: editedTranscription,
        draftData: {
          customer: draftCustomer,
          fulfilment: draftFulfilment,
        },
        resolvedItems: editedItems,
      });
      setCurrentVo(res.data as unknown as VoiceOrder);
      toast.success('Draft saved.');
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) || 'Failed to save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  // ── Confirm order ──────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!currentVo || confirming) return;
    setConfirming(true);
    try {
      await handleSaveDraft(); // Ensure latest edits are saved
      const res = await voiceOrdersApi.confirm(currentVo._id);
      const { voiceOrder } = res.data as unknown as { voiceOrder: VoiceOrder; order: Record<string, unknown> };
      setCurrentVo(voiceOrder);
      toast.success('Order created successfully! 🎉');
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) || 'Failed to create order.');
    } finally {
      setConfirming(false);
    }
  };

  // ── Delete voice order ─────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm('Permanently delete this voice order? The audio file and all data will be removed. This cannot be undone.')) return;
    try {
      await voiceOrdersApi.delete(id);
      toast.success('Voice order permanently deleted.');
      setHistory((prev) => prev.filter((vo) => vo._id !== id));
      if (currentVo?._id === id) {
        setCurrentVo(null);
        setView('capture');
        recorder.clear();
      }
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) || 'Failed to delete voice order.');
    }
  };

  // ── Cancel voice order ─────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!currentVo || cancelling) return;
    if (!window.confirm('Cancel this voice order draft? This cannot be undone.')) return;
    setCancelling(true);
    try {
      await voiceOrdersApi.cancel(currentVo._id);
      toast.success('Voice order cancelled.');
      setCurrentVo(null);
      setView('capture');
      recorder.clear();
      setUploadedFile(null);
      setUploadedUrl(null);
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) || 'Failed to cancel.');
    } finally {
      setCancelling(false);
    }
  };

  // ── Can confirm? ───────────────────────────────────────────────────────────
  const hasValidItems = editedItems.length > 0 && editedItems.every((i) => i.matchedProductId && i.requestedQuantity > 0 && !i.confirmationError);
  const canConfirm = hasValidItems && !confirming && currentVo?.status !== 'order_created' && currentVo?.status !== 'cancelled';

  // ── Total ──────────────────────────────────────────────────────────────────
  const subtotal = editedItems.reduce((s, i) => s + (i.matchedProductPrice || 0) * (i.requestedQuantity || 0), 0);

  // ── Item helpers ───────────────────────────────────────────────────────────
  const updateItem = (idx: number, patch: Partial<VoiceOrderItem>) => {
    setEditedItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  };
  const removeItem = (idx: number) => setEditedItems((prev) => prev.filter((_, i) => i !== idx));
  const addItem = () => setEditedItems((prev) => [...prev, { spokenName: '', requestedQuantity: 1, matchedProductId: null, matchedProductName: null, matchedProductPrice: null, confidence: 0 }]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-10">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-1"
      >
        <div className="flex items-center gap-2 text-[#9a7b28] dark:text-amber-300/90">
          <Mic className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">AI Voice Orders</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
          AI Voice Order Capture
        </h1>
        <p className="text-muted-foreground text-base">
          Record or upload customer audio and convert it into a structured order.
        </p>
      </motion.div>

      {/* ── Tab navigation ──────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/30 rounded-xl w-fit">
        {(['capture', 'review', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setView(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              view === tab
                ? 'bg-white dark:bg-zinc-900 shadow-sm text-amber-900 dark:text-amber-100 border border-amber-200/60 dark:border-amber-700/40'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'capture' ? '🎙 Record / Upload' : tab === 'review' ? '📋 Review & Confirm' : '📜 History'}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ══════════════════════════════════════════════════════════════ */}
        {/* CAPTURE TAB                                                   */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {view === 'capture' && (
          <motion.div key="capture" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>

            {/* Privacy notice */}
            <div className="mb-5 flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40 rounded-xl text-sm text-blue-800 dark:text-blue-200">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <strong>Privacy notice:</strong> Make sure the customer has agreed to the recording and processing of their voice before you start recording.
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* ── Recording card ───────────────────────────────────────── */}
              <div className="bg-white dark:bg-zinc-900/80 border border-amber-200/40 dark:border-amber-800/30 rounded-2xl p-6 shadow-sm space-y-5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white shadow-sm">
                    <Mic className="w-4 h-4" />
                  </div>
                  <h2 className="text-lg font-bold">New Voice Order</h2>
                </div>

                {/* Error state */}
                {recorder.state === 'error' && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200/60 rounded-xl text-sm text-red-700 dark:text-red-300">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{recorder.errorMessage}</span>
                  </div>
                )}

                {/* Recording controls */}
                {!hasAudio && recorder.state !== 'stopped' && (
                  <div className="flex flex-col items-center gap-5 py-4">
                    {/* Visualizer ring */}
                    <div className={`relative w-28 h-28 rounded-full flex items-center justify-center ${
                      recorder.state === 'recording'
                        ? 'ring-4 ring-red-400/50 animate-pulse bg-red-50 dark:bg-red-950/30'
                        : 'bg-amber-50 dark:bg-amber-950/30 ring-2 ring-amber-200/50'
                    }`}>
                      {recorder.state === 'recording' ? (
                        <MicOff className="w-10 h-10 text-red-500" />
                      ) : (
                        <Mic className="w-10 h-10 text-amber-600 dark:text-amber-400" />
                      )}
                      {recorder.state === 'recording' && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-white dark:border-zinc-900 animate-pulse" />
                      )}
                    </div>

                    {/* Timer */}
                    {(recorder.state === 'recording' || recorder.state === 'paused') && (
                      <div className="text-3xl font-mono font-bold text-zinc-900 dark:text-zinc-50 tabular-nums">
                        {formatDuration(recorder.elapsed)}
                      </div>
                    )}

                    {/* Controls */}
                    <div className="flex gap-3 flex-wrap justify-center">
                      {recorder.state === 'idle' || recorder.state === 'error' ? (
                        <button
                          onClick={recorder.start}
                          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold shadow-md hover:shadow-lg transition-all"
                        >
                          <Mic className="w-4 h-4" />
                          Start Recording
                        </button>
                      ) : recorder.state === 'requesting' ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" /> Requesting microphone…
                        </div>
                      ) : recorder.state === 'recording' ? (
                        <>
                          {typeof MediaRecorder !== 'undefined' && (
                            <button onClick={recorder.pause} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 font-semibold border border-amber-200/60 hover:bg-amber-200/70 transition-all">
                              <Pause className="w-4 h-4" /> Pause
                            </button>
                          )}
                          <button onClick={recorder.stop} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-semibold border border-red-200/60 hover:bg-red-200/70 transition-all">
                            <Square className="w-4 h-4" /> Stop
                          </button>
                        </>
                      ) : recorder.state === 'paused' ? (
                        <>
                          <button onClick={recorder.resume} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 font-semibold border border-amber-200/60 hover:bg-amber-200/70 transition-all">
                            <Play className="w-4 h-4" /> Resume
                          </button>
                          <button onClick={recorder.stop} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-semibold border border-red-200/60 hover:bg-red-200/70 transition-all">
                            <Square className="w-4 h-4" /> Stop
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                )}

                {/* Audio preview after recording */}
                {hasAudio && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-300">
                      <CheckCircle2 className="w-4 h-4" />
                      {uploadedFile ? `File selected: ${uploadedFile.name}` : `Recording ready (${formatDuration(recorder.elapsed)})`}
                    </div>
                    <audio controls src={activeAudioUrl || undefined} className="w-full rounded-xl" />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (uploadedFile) { setUploadedFile(null); setUploadedUrl(null); }
                          else recorder.clear();
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200/50 hover:bg-red-100 transition-all font-medium"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Upload card ──────────────────────────────────────────── */}
              <div className="bg-white dark:bg-zinc-900/80 border border-amber-200/40 dark:border-amber-800/30 rounded-2xl p-6 shadow-sm space-y-5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white shadow-sm">
                    <Upload className="w-4 h-4" />
                  </div>
                  <h2 className="text-lg font-bold">Upload Audio File</h2>
                </div>

                <div
                  className="border-2 border-dashed border-amber-200/70 dark:border-amber-700/40 rounded-xl p-8 text-center cursor-pointer hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-all"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) {
                      const fakeEvent = { target: { files: [f] } } as unknown as React.ChangeEvent<HTMLInputElement>;
                      handleFileChange(fakeEvent);
                    }
                  }}
                >
                  <FileAudio className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                  <p className="font-semibold text-zinc-700 dark:text-zinc-300">Click to upload or drag and drop</p>
                  <p className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A, WEBM, OGG · Max 25 MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              </div>
            </div>

            {/* ── Generate transcription CTA ─────────────────────────────── */}
            {hasAudio && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 flex gap-3 flex-wrap"
              >
                <button
                  onClick={handleUploadAndCreate}
                  disabled={uploading}
                  className="flex items-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {uploading ? 'Uploading…' : 'Generate Transcription'}
                </button>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* REVIEW TAB                                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {view === 'review' && (
          <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
            {!currentVo ? (
              <div className="text-center py-16 text-muted-foreground">
                <Mic className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="font-semibold">No voice order in progress.</p>
                <p className="text-sm mt-1">Go to the "Record / Upload" tab to start a new voice order.</p>
                <button onClick={() => setView('capture')} className="mt-4 px-5 py-2 rounded-xl border border-amber-200/60 text-amber-700 dark:text-amber-300 text-sm font-semibold hover:bg-amber-50 transition-all">
                  Start New Recording
                </button>
              </div>
            ) : (
              <div className="space-y-6">

                {/* Status + controls */}
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={currentVo.status} />
                    <span className="text-xs text-muted-foreground font-mono">{currentVo._id.slice(-8)}</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {/* Transcribe / re-transcribe */}
                    {(['uploaded', 'transcription_failed', 'order_extraction_failed', 'needs_review', 'ready_for_review', 'draft', 'failed', 'transcribed'].includes(currentVo.status)) && (
                      <button
                        onClick={handleTranscribe}
                        disabled={transcribing}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-60"
                      >
                        {transcribing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                        {transcribing ? 'Transcribing…' : 'Transcribe'}
                      </button>
                    )}
                    {/* Extract */}
                    {currentVo.transcription && ['transcribed', 'needs_review', 'ready_for_review', 'draft', 'failed', 'order_extraction_failed'].includes(currentVo.status) && (
                      <button
                        onClick={handleExtract}
                        disabled={extracting}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-all disabled:opacity-60"
                      >
                        {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        {extracting ? 'Extracting…' : 'AI Extract'}
                      </button>
                    )}
                    {/* Save draft */}
                    {['needs_review', 'ready_for_review', 'draft'].includes(currentVo.status) && (
                      <button
                        onClick={handleSaveDraft}
                        disabled={savingDraft}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-amber-200/60 dark:border-amber-700/40 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all disabled:opacity-60"
                      >
                        {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Edit3 className="w-3.5 h-3.5" />}
                        Save Draft
                      </button>
                    )}
                    {/* Cancel */}
                    {!['order_created', 'cancelled'].includes(currentVo.status) && (
                      <button
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-red-600 dark:text-red-400 border border-red-200/50 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all disabled:opacity-60"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel Draft
                      </button>
                    )}
                  </div>
                </div>

                {/* Error card */}
                {transcriptionError && (
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40 rounded-xl p-5 space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <h3 className="font-bold text-red-800 dark:text-red-200 text-sm">{transcriptionError.title}</h3>
                        <p className="text-sm text-red-700 dark:text-red-300">{transcriptionError.message}</p>
                        {transcriptionError.errorRef && (
                          <p className="text-xs text-red-400 dark:text-red-500 font-mono">Ref: {transcriptionError.errorRef}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-3 flex-wrap pt-1">
                      <button
                        onClick={handleTranscribe}
                        disabled={transcribing}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-all disabled:opacity-60"
                      >
                        {transcribing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        Retry
                      </button>
                      <button
                        onClick={() => {
                          setCurrentVo(null);
                          setTranscriptionError(null);
                          setView('capture');
                          recorder.clear();
                          setUploadedFile(null);
                          setUploadedUrl(null);
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-red-200/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                      >
                        <Mic className="w-3.5 h-3.5" /> Record Again
                      </button>
                    </div>
                  </div>
                )}

                {/* Audio player */}
                {currentVo.audioStorageKey && (
                  <div className="bg-white dark:bg-zinc-900/80 border border-amber-200/40 dark:border-amber-800/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      <Volume2 className="w-4 h-4 text-amber-500" /> Audio Preview
                    </div>
                    <audio controls src={voiceOrdersApi.getAudioUrl(currentVo._id)} className="w-full rounded-lg" />
                    <p className="text-xs text-muted-foreground mt-1.5">{currentVo.originalFileName} · {formatSize(currentVo.fileSize)} · {formatDuration(currentVo.durationSeconds)}</p>
                  </div>
                )}

                {/* Transcription */}
                {(currentVo.transcription || ['transcription_failed', 'order_extraction_failed', 'transcribed'].includes(currentVo.status)) && (
                  <div className="bg-white dark:bg-zinc-900/80 border border-amber-200/40 dark:border-amber-800/30 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        <FileText className="w-4 h-4 text-blue-500" /> Transcription
                        {currentVo.transcriptionLanguage && <span className="ml-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs">{currentVo.transcriptionLanguage}</span>}
                      </div>
                      {(currentVo.status === 'transcription_failed' || currentVo.status === 'order_extraction_failed') && (
                        <span className="text-xs text-red-600 dark:text-red-400 font-medium">{currentVo.failureReason || 'Processing failed'}</span>
                      )}
                    </div>
                    {editingTranscription ? (
                      <>
                        <textarea
                          className="w-full h-28 rounded-xl border border-amber-200/60 dark:border-amber-700/40 bg-amber-50/30 dark:bg-amber-950/20 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                          value={editedTranscription}
                          onChange={(e) => setEditedTranscription(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <button onClick={async () => { await voiceOrdersApi.updateTranscription(currentVo._id, editedTranscription); setEditingTranscription(false); toast.success('Transcription updated.'); }} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-all">Save</button>
                          <button onClick={() => setEditingTranscription(false)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50 transition-all">Cancel</button>
                        </div>
                      </>
                    ) : (
                      <div className="flex gap-2 items-start">
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 leading-relaxed whitespace-pre-wrap">{editedTranscription || <span className="text-muted-foreground italic">No transcription yet.</span>}</p>
                        <button onClick={() => setEditingTranscription(true)} className="shrink-0 p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 text-amber-600 transition-all"><Edit3 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                )}

                {/* Extracted data */}
                {currentVo.extractedData && (
                  <div className="space-y-4">

                    {/* Customer details */}
                    <div className="bg-white dark:bg-zinc-900/80 border border-amber-200/40 dark:border-amber-800/30 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        <User className="w-4 h-4 text-amber-500" /> Customer Details
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {([
                          { key: 'name', label: 'Name', icon: User },
                          { key: 'phone', label: 'Phone', icon: Phone },
                          { key: 'email', label: 'Email', icon: Globe },
                        ] as const).map(({ key, label, icon: Icon }) => (
                          <div key={key} className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Icon className="w-3 h-3" />{label}</label>
                            <input
                              value={draftCustomer[key] || ''}
                              onChange={(e) => setDraftCustomer((p) => ({ ...p, [key]: e.target.value }))}
                              placeholder={`Customer ${label.toLowerCase()}`}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 dark:bg-zinc-800/50"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Fulfilment */}
                    <div className="bg-white dark:bg-zinc-900/80 border border-amber-200/40 dark:border-amber-800/30 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        <MapPin className="w-4 h-4 text-amber-500" /> Fulfilment
                      </div>
                      <div className="flex gap-3 flex-wrap">
                        {(['delivery', 'pickup', 'unknown'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setDraftFulfilment((p) => ({ ...p, type: t }))}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${draftFulfilment.type === t ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-300/60 dark:border-amber-700/40 text-amber-800 dark:text-amber-200' : 'border-gray-200 dark:border-zinc-700 text-muted-foreground hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
                          >
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </button>
                        ))}
                      </div>
                      {draftFulfilment.type === 'delivery' && (
                        <input
                          value={draftFulfilment.address}
                          onChange={(e) => setDraftFulfilment((p) => ({ ...p, address: e.target.value }))}
                          placeholder="Delivery address"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 dark:bg-zinc-800/50"
                        />
                      )}
                    </div>

                    {/* Warnings */}
                    {currentVo.extractedData.warnings.length > 0 && (
                      <div className="flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-950/30 border border-orange-200/60 dark:border-orange-800/40 rounded-xl">
                        <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                        <ul className="text-sm text-orange-800 dark:text-orange-200 space-y-1">
                          {currentVo.extractedData.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Items table */}
                    <div className="bg-white dark:bg-zinc-900/80 border border-amber-200/40 dark:border-amber-800/30 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between p-4 border-b border-amber-100/50 dark:border-amber-900/30">
                        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                          <ShoppingCart className="w-4 h-4 text-amber-500" /> Order Items ({editedItems.length})
                        </div>
                        <button onClick={addItem} className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline">
                          <Plus className="w-3 h-3" /> Add Item
                        </button>
                      </div>

                      {editedItems.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">No items detected. Add items manually or re-run extraction.</div>
                      ) : (
                        <div className="divide-y divide-amber-50/50 dark:divide-amber-900/20">
                          {editedItems.map((item, idx) => (
                            <div key={idx} className={`p-4 space-y-2 ${item.requiresReview ? 'bg-orange-50/30 dark:bg-orange-950/10' : ''}`}>
                              <div className="flex items-start gap-3">
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-muted-foreground">Spoken:</span>
                                    <span className="text-xs font-medium italic text-zinc-600 dark:text-zinc-400">"{item.spokenName}"</span>
                                    {item.matchedProductName && (
                                      <>
                                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{item.matchedProductName}</span>
                                      </>
                                    )}
                                    {item.requiresReview && item.reviewWarning && (
                                      <span className="ml-1 px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-[10px] font-semibold">⚠ Review</span>
                                    )}
                                  </div>
                                  {item.matchedProductPrice != null && (
                                    <p className="text-xs text-muted-foreground">
                                      ₹{item.matchedProductPrice.toFixed(2)} × {item.requestedQuantity} = <strong>₹{((item.matchedProductPrice || 0) * item.requestedQuantity).toFixed(2)}</strong>
                                      {item.matchedProductStock != null && <span className="ml-2 text-zinc-500">({item.matchedProductStock} in stock)</span>}
                                    </p>
                                  )}
                                  <ConfidenceBar value={item.confidence} />
                                  {item.reviewWarning && (
                                    <p className="text-xs text-orange-600 dark:text-orange-400">{item.reviewWarning}</p>
                                  )}
                                  {item.confirmationError && (
                                    <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{item.confirmationError}</p>
                                  )}
                                </div>

                                {/* Qty controls */}
                                <div className="flex items-center gap-1 shrink-0">
                                  <button onClick={() => updateItem(idx, { requestedQuantity: Math.max(1, item.requestedQuantity - 1) })} className="w-7 h-7 rounded-lg border border-gray-200 dark:border-zinc-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all">
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    value={item.requestedQuantity}
                                    onChange={(e) => updateItem(idx, { requestedQuantity: Math.max(1, parseInt(e.target.value) || 1) })}
                                    className="w-12 text-center border border-gray-200 dark:border-zinc-700 rounded-lg py-1 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-amber-400/50"
                                  />
                                  <button onClick={() => updateItem(idx, { requestedQuantity: item.requestedQuantity + 1 })} className="w-7 h-7 rounded-lg border border-gray-200 dark:border-zinc-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all">
                                    <Plus className="w-3 h-3" />
                                  </button>
                                  <button onClick={() => removeItem(idx)} className="w-7 h-7 rounded-lg border border-red-200/50 text-red-500 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/30 transition-all ml-1">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Subtotal */}
                      {editedItems.length > 0 && (
                        <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border-t border-amber-100/50 dark:border-amber-900/30 flex justify-between items-center">
                          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Subtotal</span>
                          <span className="text-lg font-bold text-amber-900 dark:text-amber-100">₹{subtotal.toFixed(2)}</span>
                        </div>
                      )}
                    </div>

                    {/* Overall confidence */}
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>Overall AI Confidence:</span>
                      <div className="w-32"><ConfidenceBar value={currentVo.overallConfidence} /></div>
                    </div>
                  </div>
                )}

                {/* Confirm button */}
                {currentVo.status === 'order_created' ? (
                  <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200/60 rounded-xl text-green-800 dark:text-green-200 font-semibold">
                    <CheckCircle2 className="w-5 h-5" />
                    Order created successfully! Check the Orders section to view it.
                  </div>
                ) : (
                  <div className="flex gap-3 flex-wrap pt-2">
                    <button
                      onClick={handleConfirm}
                      disabled={!canConfirm}
                      title={!hasValidItems ? 'All items must be matched and have valid quantities' : ''}
                      className="flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-green-500 to-green-600 text-white font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      {confirming ? 'Creating Order…' : 'Confirm & Create Order'}
                    </button>
                    {!hasValidItems && (
                      <p className="text-xs text-muted-foreground self-center">All items need valid product matches and quantities to confirm.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* HISTORY TAB                                                   */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {view === 'history' && (
          <motion.div key="history" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
            <div className="space-y-4">

              {/* Filters */}
              <div className="flex gap-3 flex-wrap">
                <input
                  value={historyFilter.search}
                  onChange={(e) => setHistoryFilter((p) => ({ ...p, search: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && loadHistory(1)}
                  placeholder="Search transcription, customer…"
                  className="flex-1 min-w-48 px-3 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 dark:bg-zinc-800/50"
                />
                <select
                  value={historyFilter.status}
                  onChange={(e) => setHistoryFilter((p) => ({ ...p, status: e.target.value }))}
                  className="px-3 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 dark:bg-zinc-800/50"
                >
                  <option value="">All Statuses</option>
                  {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{STATUS_META[s as VoiceOrderStatus].label}</option>)}
                </select>
                <button onClick={() => loadHistory(1)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-sm font-semibold hover:bg-amber-200/70 transition-all border border-amber-200/60">
                  <Search className="w-3.5 h-3.5" /> Search
                </button>
                <button onClick={() => loadHistory(historyPage)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all">
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>

              {historyLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading history…
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileAudio className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold">No voice orders found.</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-zinc-900/80 border border-amber-200/40 dark:border-amber-800/30 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-amber-100/50 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-950/20">
                          {['ID', 'Customer', 'Duration', 'Items', 'Total', 'Confidence', 'Status', 'Created', 'Actions'].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-bold text-amber-900/70 dark:text-amber-100/60 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-50/50 dark:divide-amber-900/20">
                        {history.map((vo) => {
                          const customer = vo.extractedData?.customer;
                          const itemCount = vo.resolvedItems?.length || vo.extractedData?.items?.length || 0;
                          const total = (vo.resolvedItems || []).reduce((s, i) => s + (i.matchedProductPrice || 0) * (i.requestedQuantity || 0), 0);
                          return (
                            <React.Fragment key={vo._id}>
                              <tr className={`hover:bg-amber-50/30 dark:hover:bg-amber-950/10 transition-colors ${expandedRow === vo._id ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''}`}>
                                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{vo._id.slice(-8)}</td>
                                <td className="px-4 py-3 text-xs">{customer?.name || <span className="text-muted-foreground italic">Unknown</span>}</td>
                                <td className="px-4 py-3 text-xs tabular-nums">{formatDuration(vo.durationSeconds)}</td>
                                <td className="px-4 py-3 text-xs tabular-nums">{itemCount}</td>
                                <td className="px-4 py-3 text-xs font-semibold tabular-nums">{total > 0 ? `₹${total.toFixed(2)}` : '—'}</td>
                                <td className="px-4 py-3 w-24"><ConfidenceBar value={vo.overallConfidence} /></td>
                                <td className="px-4 py-3"><StatusBadge status={vo.status} /></td>
                                <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{new Date(vo.createdAt).toLocaleDateString()}</td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => {
                                        setCurrentVo(vo);
                                        setView('review');
                                      }}
                                      className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all text-amber-700 dark:text-amber-300"
                                      title="Review"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setExpandedRow(expandedRow === vo._id ? null : vo._id)}
                                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all text-muted-foreground"
                                      title="Expand"
                                    >
                                      {expandedRow === vo._id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                    {vo.status !== 'order_created' && (
                                      <button
                                        onClick={() => handleDelete(vo._id)}
                                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-all text-red-500 hover:text-red-700 dark:hover:text-red-300"
                                        title="Delete permanently"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {expandedRow === vo._id && (
                                <tr>
                                  <td colSpan={9} className="px-4 py-3 bg-amber-50/20 dark:bg-amber-950/10 border-t border-amber-100/30">
                                    <p className="text-xs text-muted-foreground font-medium mb-1">Transcription preview:</p>
                                    <p className="text-xs text-zinc-700 dark:text-zinc-300 italic line-clamp-3">{vo.transcription || '—'}</p>
                                    {vo.failureReason && <p className="text-xs text-red-500 mt-1">{vo.failureReason}</p>}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {historyTotal > 15 && (
                    <div className="p-4 border-t border-amber-100/50 dark:border-amber-900/30 flex items-center justify-between text-sm text-muted-foreground">
                      <span>{historyTotal} total</span>
                      <div className="flex gap-2">
                        <button onClick={() => loadHistory(historyPage - 1)} disabled={historyPage === 1} className="px-3 py-1 rounded-lg border border-gray-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all text-xs">← Prev</button>
                        <span className="px-3 py-1 text-xs">Page {historyPage}</span>
                        <button onClick={() => loadHistory(historyPage + 1)} disabled={historyPage * 15 >= historyTotal} className="px-3 py-1 rounded-lg border border-gray-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all text-xs">Next →</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
