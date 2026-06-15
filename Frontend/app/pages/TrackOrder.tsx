import React, { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import {
  Loader2,
  Package,
  MapPin,
  Search,
  ArrowRight,
  Calendar,
  Hash,
  Truck,
  Ban,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isInventoryManagerRole, hasFullAdminPrivileges, isSuperAdminRole } from '../utils/staffRoles';
 import {
   getMyOrdersTracking,
   getOrderTrackingByIdentifier,
   logOrderTracking,
   cancelOrder,
   deleteOrder,
 } from '../api/orders';
 import { OrderTrackingTimeline, type TimelineStage } from '../components/orders/OrderTrackingTimeline';
 import { Button } from '../components/ui/button';
 import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
 } from '../components/ui/dialog';
 import { toast } from 'sonner';
 import { formatINR } from '../utils/formatINR';

type ShiprocketSync = {
  syncStatus?: string;
  message?: string;
  courierName?: string | null;
  awbCode?: string | null;
  trackingUrl?: string | null;
  lastTrackingSyncAt?: string | null;
  shipmentStatus?: string | null;
  /** Courier-provided EDD when available from Shiprocket tracking API */
  estimatedDelivery?: string | null;
};

type TrackingOrder = {
  _id?: string;
  orderId: string;
  trackingId?: string;
  effectiveTrackingId?: string;
  trackingStatusResolved?: string;
  orderStatusResolved?: string;
  currentStageResolved?: number;
  currentStage?: number;
  stages?: TimelineStage[];
  estimatedDelivery?: string | null;
  createdAt?: string;
  totalPrice?: number;
  isCancelled?: boolean;
  cancelledAt?: string;
  cancellationReason?: string;
  items?: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    image: string;
  }>;
  shippingAddress?: {
    fullName?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    email?: string;
    phone?: string;
  };
  trackingHistory?: Array<{ label?: string; message?: string; at?: string }>;
  shiprocket?: ShiprocketSync;
};

const CANCEL_REASON_PRESETS = [
  'Changed my mind',
  'Ordered by mistake',
  'Found better price',
  'Delay in delivery',
  'Other',
] as const;

function canCancelOrder(o: TrackingOrder | null | undefined): boolean {
  if (!o) return false;
  if (o.isCancelled === true) return false;
  const st = String(o.orderStatusResolved || '').toLowerCase();
  if (st === 'cancelled') return false;
  if (st === 'delivered' || st === 'shipped' || st === 'out_for_delivery') return false;
  const stage = o.currentStageResolved ?? o.currentStage ?? 1;
  if (typeof stage === 'number' && stage >= 4) return false;
  return true;
}

function formatMoney(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return formatINR(n);
}

function formatDate(iso: string | undefined | null) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

function formatDeliveryDate(iso: string | undefined | null) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(iso));
  } catch {
    return '—';
  }
}

type Props = {
  /** Renders inside account layout (no full-page shell). */
  variant?: 'page' | 'account';
};

export function TrackOrder({ variant = 'page' }: Props) {
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q')?.trim() || '';

  const [list, setList] = useState<TrackingOrder[]>([]);
  const [selected, setSelected] = useState<TrackingOrder | null>(null);
  const [searchInput, setSearchInput] = useState(q);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTargetOrderId, setCancelTargetOrderId] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>(CANCEL_REASON_PRESETS[0]);
  const [cancelOtherReason, setCancelOtherReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetOrderId, setDeleteTargetOrderId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const loadList = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    setListError(null);
    try {
      const res = await getMyOrdersTracking();
      if (res.success && Array.isArray(res.data)) {
        setList(res.data as TrackingOrder[]);
      } else {
        setList([]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not load orders';
      setListError(msg);
      setList([]);
    } finally {
      setListLoading(false);
    }
  }, [user]);

  const fetchDetail = useCallback(
    async (identifier: string, trackingSource: string = 'track-page') => {
      if (!user || !identifier) return;
      setDetailLoading(true);
      setDetailError(null);
      setSelected(null);
      try {
        const res = await getOrderTrackingByIdentifier(identifier);
        if (res.success && res.data) {
          const trackedOrder = res.data as TrackingOrder;
          setSelected(trackedOrder);
          
          // Log tracking action
          logOrderTracking({
            orderId: trackedOrder.orderId,
            trackingId: trackedOrder.trackingId,
            searchedValue: identifier,
            source: trackingSource,
          }).catch(console.error);

        } else {
          setSelected(null);
          setDetailError('No tracking data found for that reference.');
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Lookup failed';
        setDetailError(msg);
        setSelected(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (!authLoading && user) {
      void loadList();
    }
  }, [authLoading, user, loadList]);

  useEffect(() => {
    if (authLoading || !user || !q) return;
    setSearchInput(q);
    void fetchDetail(q, 'url-query');
  }, [authLoading, user, q, fetchDetail]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const id = searchInput.trim();
    if (!id) return;
    setSearchParams(id ? { q: id } : {});
  };

  const handleSelectFromList = (order: TrackingOrder) => {
    const ref = order.orderId || order.effectiveTrackingId || '';
    if (ref) {
      setSearchParams({ q: ref });
    }
  };

  const sortedHistory = useMemo(() => {
    const h = selected?.trackingHistory;
    if (!h || !Array.isArray(h)) return [];
    return [...h].sort((a, b) => {
      const ta = a.at ? new Date(a.at).getTime() : 0;
      const tb = b.at ? new Date(b.at).getTime() : 0;
      return tb - ta;
    });
  }, [selected?.trackingHistory]);

  const handleConfirmCancel = async () => {
    const oid = cancelTargetOrderId || selected?.orderId;
    if (!oid) return;
    const reasonText =
      cancelReason === 'Other'
        ? (cancelOtherReason.trim() || 'Other')
        : cancelReason;
    setCancelSubmitting(true);
    try {
      const res = await cancelOrder(oid, { cancellationReason: reasonText });
      if (res.success && res.data) {
        toast.success(res.message || 'Order cancelled');
        setCancelOpen(false);
        setCancelTargetOrderId(null);
        const updated = res.data as TrackingOrder;
        setSelected(updated);
        setList((prev) =>
          prev.map((row) => (row.orderId === oid ? { ...row, ...updated } : row))
        );
        void loadList();
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not cancel order');
    } finally {
      setCancelSubmitting(false);
    }
  };
  
  const handleConfirmDelete = async () => {
    const oid = deleteTargetOrderId || selected?.orderId;
    if (!oid) return;
    setDeleteSubmitting(true);
    try {
      // Find the Mongo ID if possible, otherwise use business orderId
      const target = list.find(o => o.orderId === oid);
      const deleteId = target?._id || oid;
      
      const res = await deleteOrder(deleteId);
      if (res.success) {
        toast.success(res.message || 'Order tracking record deleted');
        setDeleteOpen(false);
        setDeleteTargetOrderId(null);
        
        // Clear selection if it was the deleted order
        if (selected?.orderId === oid) {
          setSelected(null);
          setSearchParams({});
        }
        
        // Remove from list
        setList((prev) => prev.filter((row) => row.orderId !== oid));

        // Trigger custom event to notify other components (like Dashboard) to refetch stats
        window.dispatchEvent(new CustomEvent('order-deleted', { detail: { orderId: oid } }));
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not delete record');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const shellClass =
    'min-h-screen bg-[linear-gradient(180deg,#faf9f6_0%,#f4f1eb_45%,#f0ebe3_100%)] text-stone-900';

  const innerClass =
    variant === 'page'
      ? 'mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16'
      : 'px-4 py-6 sm:px-6 sm:py-8';

  if (authLoading) {
    return (
      <div className={`flex min-h-[40vh] items-center justify-center ${shellClass}`}>
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className={shellClass}>
        <div className={`${innerClass} mx-auto max-w-lg text-center`}>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-stone-200/80 bg-white p-10 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.2)]"
          >
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/25">
              <Truck className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">Track Your Order</h1>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              Sign in to view live shipment status, your order history, and step-by-step delivery
              progress backed by your account.
            </p>
            <Button
              asChild
              className="mt-8 h-12 w-full rounded-2xl bg-blue-600 text-base font-semibold hover:bg-blue-500"
            >
              <Link to="/login" state={{ from: { pathname: '/track-order' } }}>
                Sign in to track
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <p className="mt-6 text-xs text-stone-500">
              Guest checkout orders are linked when you use the same account email at checkout.
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  if (isInventoryManagerRole(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const detail = selected;
  const stages: TimelineStage[] =
    detail?.stages && detail.stages.length > 0
      ? detail.stages
      : [
          { step: 1, label: 'Order Placed', status: 'current' },
          { step: 2, label: 'Confirmed', status: 'pending' },
          { step: 3, label: 'Packed', status: 'pending' },
          { step: 4, label: 'Shipped', status: 'pending' },
          { step: 5, label: 'Out for Delivery', status: 'pending' },
          { step: 6, label: 'Delivered', status: 'pending' },
        ];

  return (
    <div className={shellClass}>
      <Dialog
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (!open) setCancelTargetOrderId(null);
          if (open) {
            setCancelReason(CANCEL_REASON_PRESETS[0]);
            setCancelOtherReason('');
          }
        }}
      >
        <DialogContent className="rounded-2xl border-stone-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this order? This cannot be undone if your order has not
              yet shipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="block text-sm font-medium text-stone-700" htmlFor="cancel-reason">
              Reason (optional)
            </label>
            <select
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none ring-blue-500/0 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {CANCEL_REASON_PRESETS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {cancelReason === 'Other' && (
              <textarea
                value={cancelOtherReason}
                onChange={(e) => setCancelOtherReason(e.target.value)}
                placeholder="Tell us more (optional)"
                rows={3}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setCancelOpen(false)}
              disabled={cancelSubmitting}
            >
              Keep order
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-rose-600 hover:bg-rose-500"
              disabled={cancelSubmitting}
              onClick={() => void handleConfirmCancel()}
            >
              {cancelSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Yes, cancel order'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteTargetOrderId(null);
        }}
      >
        <DialogContent className="rounded-2xl border-stone-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-rose-600">Delete Tracking Record?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this order tracking record? This action is permanent and will remove the order and all tracking logs from the database.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-rose-600 hover:bg-rose-500"
              disabled={deleteSubmitting}
              onClick={() => void handleConfirmDelete()}
            >
              {deleteSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Yes, delete permanently'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className={innerClass}>
        {variant === 'page' ? (
          <header className="mb-10 text-center sm:mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-blue-700/90">Daizy Homes</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">
              Track Your Order
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-stone-600">
              Search by order number or tracking ID, or choose a recent order below.
            </p>
          </header>
        ) : (
          <header className="mb-8">
            <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">Track Your Order</h1>
            <p className="mt-2 text-sm text-stone-600">
              Search by order or tracking ID, or pick a recent order.
            </p>
          </header>
        )}

        <form
          onSubmit={handleSearchSubmit}
          className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Order ID, tracking ID, AWB, or Shiprocket shipment ID"
              className="h-12 w-full rounded-2xl border border-stone-200 bg-white py-3 pl-11 pr-4 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 outline-none ring-blue-500/0 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <Button
            type="submit"
            disabled={detailLoading}
            className="h-12 shrink-0 rounded-2xl bg-blue-600 px-8 font-semibold hover:bg-blue-500"
          >
            {detailLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Track
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        {detailError && (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {detailError}
          </div>
        )}

        <div className="grid gap-8 xl:grid-cols-12 xl:gap-10">
          <section className="min-w-0 xl:col-span-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-500">Recent orders</h2>
              {listLoading && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
            </div>
            {listError && <p className="mb-4 text-sm text-rose-600">{listError}</p>}
            <div className="space-y-3">
              {list.length === 0 && !listLoading && !listError && (
                <p className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-8 text-center text-sm text-stone-500 shadow-sm">
                  No orders yet. When you place an order, tracking appears here automatically.
                </p>
              )}
              {list.map((o) => {
                const active =
                  selected &&
                  (selected.orderId === o.orderId || (selected._id && selected._id === o._id));
                return (
                  <button
                    key={o._id || o.orderId}
                    type="button"
                    onClick={() => handleSelectFromList(o)}
                    className={`
                      w-full rounded-2xl border px-4 py-4 text-left transition-all
                      ${
                        active
                          ? 'border-blue-300 bg-white shadow-[0_12px_40px_-18px_rgba(37,99,235,0.35)] ring-1 ring-blue-100'
                          : 'border-stone-200/90 bg-white/90 shadow-sm hover:border-stone-300 hover:shadow-md'
                      }
                    `}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-bold text-stone-900">{o.orderId}</p>
                        <p className="mt-1 text-xs text-stone-500">{formatDate(o.createdAt)}</p>
                      </div>
                      <span className="shrink-0 max-w-[10rem] truncate rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-700">
                        {o.trackingStatusResolved || 'Processing'}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-stone-500">Total</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-900">{formatMoney(o.totalPrice)}</span>
                        {isSuperAdminRole(user?.role) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTargetOrderId(o.orderId);
                              setDeleteOpen(true);
                            }}
                            className="ml-1 rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                            title="Delete record"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <span className="mt-3 inline-flex items-center text-xs font-semibold text-blue-700">
                      View timeline
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="min-w-0 xl:col-span-7">
            {detailLoading && !detail && (
              <div className="flex min-h-[280px] items-center justify-center rounded-3xl border border-stone-200 bg-white shadow-sm">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            )}

            {detail && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-visible rounded-3xl border border-stone-200/90 bg-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.18)]"
              >
                <div className="border-b border-stone-100 bg-gradient-to-r from-blue-50/90 to-indigo-50/50 px-6 py-6 sm:px-8">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-stone-700 shadow-sm ring-1 ring-stone-200/80">
                        <Hash className="h-3.5 w-3.5 text-blue-600" />
                        {detail.orderId}
                      </span>
                      {detail.effectiveTrackingId && detail.effectiveTrackingId !== detail.orderId && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-mono font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
                          {detail.effectiveTrackingId}
                        </span>
                      )}
                    </div>
                    {canCancelOrder(detail) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 rounded-xl border-rose-200 bg-white/90 text-rose-700 hover:bg-rose-50"
                        onClick={() => {
                          setCancelTargetOrderId(detail.orderId);
                          setCancelOpen(true);
                        }}
                      >
                        <Ban className="mr-1.5 h-3.5 w-3.5" />
                        Cancel order
                      </Button>
                    )}
                    {isSuperAdminRole(user?.role) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 rounded-xl border-stone-200 bg-white/90 text-rose-600 hover:bg-rose-50 hover:border-rose-200"
                        onClick={() => {
                          setDeleteTargetOrderId(detail.orderId);
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete record
                      </Button>
                    )}
                  </div>
                  <p className="mt-4 text-lg font-bold text-stone-900">
                    {detail.trackingStatusResolved || 'Processing'}
                  </p>
                  {detail.isCancelled && detail.cancellationReason && (
                    <p className="mt-2 text-sm text-stone-600">
                      <span className="font-medium text-stone-700">Cancellation reason: </span>
                      {detail.cancellationReason}
                    </p>
                  )}
                  {detail.isCancelled && detail.cancelledAt && (
                    <p className="mt-1 text-xs text-stone-500">Cancelled {formatDate(detail.cancelledAt)}</p>
                  )}
                  {detail.shiprocket?.message && detail.shiprocket.syncStatus && detail.shiprocket.syncStatus !== 'ok' && (
                    <p className="mt-3 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
                      {detail.shiprocket.message}
                    </p>
                  )}
                  {detail.shiprocket?.syncStatus === 'ok' && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600">
                      <span className="font-semibold text-emerald-800">Live courier tracking</span>
                      {detail.shiprocket.courierName ? (
                        <span>
                          Courier: <strong className="text-stone-800">{detail.shiprocket.courierName}</strong>
                        </span>
                      ) : null}
                      {detail.shiprocket.awbCode ? (
                        <span className="font-mono text-stone-800">AWB {detail.shiprocket.awbCode}</span>
                      ) : null}
                      {detail.shiprocket.trackingUrl ? (
                        <a
                          href={detail.shiprocket.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-blue-700 underline decoration-blue-700/30 underline-offset-2 hover:text-blue-600"
                        >
                          Open courier page
                        </a>
                      ) : null}
                      {detail.shiprocket.shipmentStatus ? (
                        <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-900">
                          {detail.shiprocket.shipmentStatus}
                        </span>
                      ) : null}
                      {detail.shiprocket.lastTrackingSyncAt ? (
                        <span className="text-stone-500">
                          Sync: {formatDate(detail.shiprocket.lastTrackingSyncAt)}
                        </span>
                      ) : null}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-4 text-sm text-stone-600">
                    <span className="inline-flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0 text-blue-600" />
                      Est. delivery:{' '}
                      <strong className="text-stone-900">
                        {formatDeliveryDate(
                          detail.shiprocket?.estimatedDelivery || detail.estimatedDelivery
                        )}
                      </strong>
                    </span>
                    {detail.shiprocket?.syncStatus === 'ok' && detail.shiprocket.estimatedDelivery && (
                      <span className="text-xs text-stone-500">(from courier)</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-0 lg:flex-row lg:gap-0">
                  <div className="min-w-0 flex-1 border-b border-stone-100 p-6 sm:p-8 lg:max-w-none lg:border-b-0 lg:border-r lg:border-stone-100">
                    <h3 className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-500">
                      <Truck className="h-4 w-4 shrink-0 text-blue-600" />
                      Shipment progress
                    </h3>
                    <div className="min-w-0 max-w-full overflow-visible">
                      {detail.isCancelled ? (
                        <div className="rounded-2xl border border-rose-200/90 bg-rose-50/90 px-4 py-4 text-sm text-rose-950">
                          <p className="font-semibold">This order has been cancelled.</p>
                          <p className="mt-1 text-xs text-rose-900/85">
                            Shipment progress is no longer applicable. If you paid online, refund handling
                            follows our store policy.
                          </p>
                        </div>
                      ) : (
                        <OrderTrackingTimeline stages={stages} variant="light" />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 p-6 sm:p-8">
                    <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-500">
                      <MapPin className="h-4 w-4 shrink-0 text-indigo-600" />
                      Delivery address
                    </h3>
                    {detail.shippingAddress ? (
                      <div className="text-sm leading-relaxed text-stone-700">
                        <p className="font-semibold text-stone-900">{detail.shippingAddress.fullName}</p>
                        <p className="mt-1">{detail.shippingAddress.address}</p>
                        <p>
                          {detail.shippingAddress.city}, {detail.shippingAddress.state}{' '}
                          {detail.shippingAddress.zipCode}
                        </p>
                        <p>{detail.shippingAddress.country}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-stone-500">No address on file.</p>
                    )}

                    <h3 className="mb-3 mt-10 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-500">
                      <Package className="h-4 w-4 shrink-0 text-violet-600" />
                      Items
                    </h3>
                    <ul className="space-y-3">
                      {(detail.items || []).map((item) => (
                        <li
                          key={`${item.productId}-${item.name}`}
                          className="flex gap-3 rounded-xl border border-stone-100 bg-stone-50/80 p-3 shadow-sm"
                        >
                          <img
                            src={item.image}
                            alt=""
                            className="h-14 w-14 shrink-0 rounded-lg object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug text-stone-900">{item.name}</p>
                            <p className="text-xs text-stone-500">
                              Qty {item.quantity} · {formatMoney(item.price * item.quantity)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>

                    {sortedHistory.length > 0 && (
                      <div className="mt-10">
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-500">
                          Activity log
                        </h3>
                        <ul className="space-y-3 text-xs text-stone-600 sm:text-sm">
                          {sortedHistory.slice(0, 12).map((h, i) => (
                            <li
                              key={`${h.at}-${i}`}
                              className="flex flex-col gap-1 border-l-2 border-blue-200 pl-3 sm:flex-row sm:justify-between sm:gap-4"
                            >
                              <span className="min-w-0 break-words">{h.label || h.message || 'Update'}</span>
                              <span className="shrink-0 text-stone-400 sm:text-right">{formatDate(h.at)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {!detail && !detailLoading && !detailError && (
              <div className="flex min-h-[240px] flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300 bg-white/60 px-6 text-center shadow-inner">
                <Package className="mb-3 h-10 w-10 text-stone-300" />
                <p className="text-sm text-stone-500">
                  Select an order or search by ID to see tracking details.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
