import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ShoppingCart,
  Clock,
  CheckCircle2,
  Search,
  Filter,
  Route,
  DollarSign,
  Receipt,
  Eye,
  CreditCard,
  Truck,
  Calendar,
  User as UserIcon,
  Mail,
  Phone,
  Package,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { useNavigate } from 'react-router';
import ApiService from '../../api/apiService';
import { patchOrderTrackingStatus, deleteOrder, cancelOrder } from '../../api/orders';
import { useAuth } from '../../context/AuthContext';
import { hasFullAdminPrivileges, isStaffRole, isCustomerAccountRole, isSuperAdminRole } from '../../utils/staffRoles';
import { OrderTrackingTimeline, type TimelineStage } from '../../components/orders/OrderTrackingTimeline';
import { toast } from 'sonner';
import { formatINR } from '../../utils/formatINR';

const ADMIN_STAGE_ACTIONS: { label: string; trackingStatus: string; stage: number }[] = [
  { label: 'Confirm order', trackingStatus: 'Confirmed', stage: 2 },
  { label: 'Mark as Packed', trackingStatus: 'Packed', stage: 3 },
  { label: 'Mark as Shipped', trackingStatus: 'Shipped', stage: 4 },
  { label: 'Out for Delivery', trackingStatus: 'Out for Delivery', stage: 5 },
  { label: 'Mark as Delivered', trackingStatus: 'Delivered', stage: 6 },
];

function isCancelledOrder(o: any): boolean {
  if (!o) return false;
  if (o.isCancelled === true) return true;
  const s = String(o.orderStatusResolved || o.orderStatus || '').toLowerCase();
  return s === 'cancelled';
}

export function DashboardOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = hasFullAdminPrivileges(user?.role);
  const isStaff = isStaffRole(user?.role);
  const isCustomer = isCustomerAccountRole(user?.role);
  const isSuperAdmin = isSuperAdminRole(user?.role);

  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [manageOrder, setManageOrder] = useState<any | null>(null);
  const [viewOrder, setViewOrder] = useState<any | null>(null);
  const [trackingSubmitting, setTrackingSubmitting] = useState(false);
  const [backendStats, setBackendStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const endpoint = isCustomer ? '/orders/my-tracking' : (isStaff ? '/orders' : '/orders/my-tracking');
      console.log('[DEBUG Frontend Sale Page] API URL:', endpoint, 'User Role:', user?.role, 'ClientId:', user?.clientId);
      const response = await ApiService.get(endpoint, { pageName: 'Sale' });
      console.log('[DEBUG Frontend Sale Page] API response success:', response.success, 'Orders count:', response.data?.length);
      if (response.success && response.data && Array.isArray(response.data)) {
        setOrders(response.data);
        if (response.stats) {
          setBackendStats(response.stats);
        }
      } else {
        setOrders([]);
        if (!response.success && response.message) {
          setError(response.message);
          toast.error(response.message);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch orders', err);
      setOrders([]);
      const msg = err.message || 'Could not load orders. Check that the server is running.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [isStaff, isCustomer, user]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const filteredOrders = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    if (!t) return orders;
    return orders.filter((o) => {
      const id = String(o.orderId || o.id || '');
      const name = (o.shippingAddress?.fullName || o.customerName || o.customer || '').toLowerCase();
      const email = String(o.customerEmail || '').toLowerCase();
      return id.toLowerCase().includes(t) || name.includes(t) || email.includes(t);
    });
  }, [orders, searchTerm]);

  const stats = useMemo(() => {
    // Priority to backend stats if available and not searching
    if (backendStats && !searchTerm.trim() && !isCustomer) {
      return [
        { title: 'Total Orders', value: backendStats.totalOrders, icon: ShoppingCart, color: 'blue' },
        { title: 'In Progress', value: backendStats.inProgress, icon: Clock, color: 'amber' },
        { title: 'Delivered', value: backendStats.delivered, icon: CheckCircle2, color: 'emerald' },
        { title: 'Revenue', value: formatINR(backendStats.revenue), icon: DollarSign, color: 'indigo' },
      ];
    }

    const total = orders.length;
    const delivered = orders.filter((o) => o.isDelivered === true || ['completed', 'delivered'].includes((o.orderStatus || '').toLowerCase())).length;
    const inProgress = orders.filter(
      (o) => o.isDelivered !== true && !isCancelledOrder(o) && !['completed', 'delivered'].includes((o.orderStatus || '').toLowerCase())
    ).length;
    const revenue = orders.reduce((acc, o) => {
      const isPaid = o.isPaid === true || o.paymentStatus === 'paid' || o.isDelivered === true || ['completed', 'delivered'].includes((o.orderStatus || '').toLowerCase());
      if (isPaid && !isCancelledOrder(o)) {
        return acc + (Number(o.totalPrice || o.total) || 0);
      }
      return acc;
    }, 0);

    if (isCustomer) {
      return [
        { title: 'My Orders', value: total, icon: ShoppingCart, color: 'blue' },
        { title: 'In Progress', value: inProgress, icon: Clock, color: 'amber' },
        { title: 'Delivered', value: delivered, icon: CheckCircle2, color: 'emerald' },
      ];
    }
    return [
      { title: 'Total Orders', value: total, icon: ShoppingCart, color: 'blue' },
      { title: 'In Progress', value: inProgress, icon: Clock, color: 'amber' },
      { title: 'Delivered', value: delivered, icon: CheckCircle2, color: 'emerald' },
      { title: 'Revenue', value: formatINR(revenue), icon: DollarSign, color: 'indigo' },
    ];
  }, [orders, isCustomer, backendStats, searchTerm]);


  const currentStageForOrder = (o: any) => {
    const s = o?.currentStageResolved ?? o?.currentStage;
    if (typeof s === 'number' && s >= 1 && s <= 6) return s;
    if (o?.isDelivered) return 6;
    return 1;
  };

  const stagesForModal = (o: any): TimelineStage[] => {
    if (o?.stages && Array.isArray(o.stages) && o.stages.length > 0) return o.stages as TimelineStage[];
    const cs = currentStageForOrder(o);
    const labels = [
      'Order Placed',
      'Confirmed',
      'Packed',
      'Shipped',
      'Out for Delivery',
      'Delivered',
    ];
    return labels.map((label, i) => {
      const step = i + 1;
      let status: TimelineStage['status'] = 'pending';
      if (o?.isDelivered) status = 'complete';
      else if (step < cs) status = 'complete';
      else if (step === cs) status = 'current';
      return { step, label, status };
    });
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Are you sure you want to delete this order permanently?')) return;
    try {
      const order = orders.find((o) => o.orderId === orderId);
      const idToDelete = order?._id || orderId;
      const res = await deleteOrder(idToDelete);
      if (res.success) {
        toast.success(res.message || 'Order deleted');
        setOrders((prev) => prev.filter((o) => o.orderId !== orderId && o._id !== idToDelete));
        // Notify Dashboard to refetch analytics so revenue/stats update immediately
        window.dispatchEvent(new CustomEvent('order-deleted', { detail: { orderId } }));
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleTrackingAction = async (trackingStatus: string) => {
    if (!manageOrder || !isAdmin) return;
    const oid = manageOrder.orderId || manageOrder._id;
    if (!oid) return;
    setTrackingSubmitting(true);
    try {
      const res = await patchOrderTrackingStatus(String(oid), { trackingStatus });
      if (res.success && res.data) {
        toast.success(res.message || 'Tracking updated');
        setManageOrder(res.data);
        setOrders((prev) =>
          prev.map((row) =>
            row.orderId === res.data.orderId || String(row._id) === String(res.data._id)
              ? { ...row, ...res.data }
              : row
          )
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Update failed';
      toast.error(msg);
    } finally {
      setTrackingSubmitting(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!manageOrder) return;
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    
    const oid = manageOrder.orderId || manageOrder._id;
    if (!oid) return;
    setTrackingSubmitting(true);
    try {
      const res = await cancelOrder(String(oid));
      if (res.success && res.data) {
        toast.success(res.message || 'Order cancelled successfully');
        setManageOrder(res.data);
        setOrders((prev) =>
          prev.map((row) =>
            row.orderId === res.data.orderId || String(row._id) === String(res.data._id)
              ? { ...row, ...res.data }
              : row
          )
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Cancellation failed';
      toast.error(msg);
    } finally {
      setTrackingSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    const s = status?.toLowerCase() || '';
    switch (s) {
      case 'completed':
      case 'delivered':
        return 'bg-emerald-100/50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400';
      case 'processing':
      case 'order placed':
      case 'confirmed':
      case 'packed':
      case 'shipped':
      case 'out for delivery':
        return 'bg-blue-100/50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400';
      case 'pending':
        return 'bg-amber-100/50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400';
      case 'cancelled':
        return 'bg-rose-100/50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400';
      default:
        return 'bg-gray-100/50 text-gray-600 dark:bg-white/5 dark:text-gray-400';
    }
  };

  const modalCurrent = manageOrder ? currentStageForOrder(manageOrder) : 1;

  return (
    <div className="space-y-6">
      <div className={`grid gap-4 ${isCustomer ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'}`}>
        {stats.map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="relative overflow-hidden border-none bg-white/50 shadow-md backdrop-blur-md dark:bg-black/40">
              <div
                className={`absolute top-0 left-0 h-full w-1 opacity-70 ${stat.color === 'blue'
                    ? 'bg-blue-500'
                    : stat.color === 'amber'
                      ? 'bg-amber-500'
                      : stat.color === 'emerald'
                        ? 'bg-emerald-500'
                        : 'bg-indigo-500'
                  }`}
              />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div
                  className={`rounded-lg p-1.5 ${stat.color === 'blue'
                      ? 'bg-blue-500/10 text-blue-500'
                      : stat.color === 'amber'
                        ? 'bg-amber-500/10 text-amber-500'
                        : stat.color === 'emerald'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-indigo-500/10 text-indigo-500'
                    }`}
                >
                  <stat.icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black">{stat.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="overflow-hidden rounded-2xl border-none bg-white/80 shadow-xl backdrop-blur-xl dark:bg-black/40">
        <CardHeader className="border-b border-gray-100 pb-6 dark:border-white/5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <CardTitle className="text-xl font-bold">{isCustomer ? 'My Orders' : 'Recent Orders'}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {isCustomer
                  ? 'Track and manage your orders.'
                  : 'Track and manage customer orders. Admins can advance delivery stages step by step.'}
              </p>
            </div>
            {!isCustomer && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Order ID or customer..."
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pr-4 pl-10 text-sm transition-all focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-white/10 dark:bg-white/5 md:w-64"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button variant="outline" className="h-10 rounded-xl border-gray-200 dark:border-white/10" disabled>
                  <Filter className="mr-2 h-4 w-4" />
                  Filter
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="mx-6 my-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
              <p className="font-bold">Error loading orders</p>
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-8 border-rose-200 text-rose-600 hover:bg-rose-100"
                onClick={() => void fetchOrders()}
              >
                Try Again
              </Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50/50 text-[12px] font-bold tracking-wider text-muted-foreground uppercase dark:bg-white/[0.02]">
                <tr>
                  <th className="px-6 py-4">Order ID</th>
                  {isCustomer ? (
                    <>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Items</th>
                      <th className="px-6 py-4">Total</th>
                      <th className="px-6 py-4">Status</th>
                    </>
                  ) : (
                    <>
                      <th className="px-6 py-4">Customer</th>
                      {isSuperAdmin && <th className="px-6 py-4">Store</th>}
                      <th className="px-6 py-4">Items</th>
                      <th className="px-6 py-4">Total</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-center">Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {isLoading ? (
                  <tr>
                    <td colSpan={isCustomer ? 5 : (isSuperAdmin ? 7 : 6)} className="px-6 py-12 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                        Loading orders…
                      </div>
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={isCustomer ? 5 : (isSuperAdmin ? 7 : 6)} className="px-6 py-12 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <ShoppingCart className="h-8 w-8 text-gray-300" />
                        <p>{isCustomer ? 'You haven\'t placed any orders yet.' : 'No orders match your search.'}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order, idx) => (
                    <motion.tr
                      key={order.orderId || order._id || idx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.03 }}
                      className="group transition-colors hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
                          #{order.orderId || order.id || 'N/A'}
                        </span>
                      </td>
                      {isCustomer ? (
                        <>
                          <td className="px-6 py-4">
                            <span className="text-sm text-muted-foreground">
                              {order.createdAt
                                ? new Date(order.createdAt).toISOString().split('T')[0]
                                : '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-medium">
                              {Array.isArray(order.items) ? order.items.length : order.items || 0} items
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-black text-foreground">
                              {formatINR(order.totalPrice || order.total || 0)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase ${getStatusColor(
                                order.trackingStatusResolved || order.status || 'Processing'
                              )}`}
                            >
                              {order.trackingStatusResolved || order.status || 'Processing'}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-foreground">
                                {order.shippingAddress?.fullName || order.customerName || order.customer || 'Unknown'}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {order.createdAt
                                  ? new Date(order.createdAt).toISOString().split('T')[0]
                                  : '—'}
                              </span>
                            </div>
                          </td>
                          {isSuperAdmin && (
                            <td className="px-6 py-4">
                              <span className="text-xs font-medium text-muted-foreground">
                                {order.clientId?.businessName || order.clientId?.name || 'Main Store'}
                              </span>
                            </td>
                          )}
                          <td className="px-6 py-4">
                            <span className="text-sm font-medium">
                              {Array.isArray(order.items) ? order.items.length : order.items || 0} items
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-black text-foreground">
                              {formatINR(order.totalPrice || order.total || 0)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase ${getStatusColor(
                                order.trackingStatusResolved || order.status || 'Processing'
                              )}`}
                            >
                              {order.trackingStatusResolved || order.status || 'Processing'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-lg border-stone-200 text-stone-700 hover:bg-stone-50 dark:border-white/10 dark:text-stone-300 dark:hover:bg-white/5"
                                onClick={() => setViewOrder(order)}
                              >
                                <Eye className="mr-1.5 h-3.5 w-3.5" />
                                View
                              </Button>
                              {isAdmin && (
                                <>
                                  {isSuperAdmin && (
                                    <>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="rounded-lg border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40"
                                        onClick={() => navigate(`/super-admin/invoice/${order.orderId}`)}
                                      >
                                        <Receipt className="mr-1.5 h-3.5 w-3.5" />
                                        Invoice
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
                                        onClick={() => void handleDeleteOrder(order.orderId)}
                                      >
                                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                        Delete
                                      </Button>
                                    </>
                                  )}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40"
                                    onClick={() => setManageOrder(order)}
                                  >
                                    <Route className="mr-1.5 h-3.5 w-3.5" />
                                    Manage
                                  </Button>
                                </>
                              )}
                              {!isAdmin && <span className="text-xs text-muted-foreground">Limited access</span>}
                            </div>
                          </td>
                        </>
                      )}
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!manageOrder} onOpenChange={(open) => !open && setManageOrder(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border-stone-200 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage tracking</DialogTitle>
            <DialogDescription>
              Advance stages in order: Confirmed → Packed → Shipped → Out for Delivery → Delivered.
              {manageOrder && (
                <span className="mt-2 block font-mono text-foreground">
                  Order #{manageOrder.orderId}
                </span>
              )}
              {manageOrder && isCancelledOrder(manageOrder) && (
                <span className="mt-3 block text-sm font-medium text-rose-600">
                  This order was cancelled. Tracking cannot be changed.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {manageOrder && (
            <div className="space-y-6">
              <div className="rounded-xl border border-stone-100 bg-stone-50/80 p-4">
                <p className="mb-3 text-xs font-bold tracking-wider text-stone-500 uppercase">
                  Current stage
                </p>
                <OrderTrackingTimeline stages={stagesForModal(manageOrder)} variant="light" />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold tracking-wider text-stone-500 uppercase">Next actions</p>
                <div className="flex flex-col gap-2">
                  {ADMIN_STAGE_ACTIONS.map((action) => {
                    const alreadyApplied = modalCurrent >= action.stage;
                    const isNext = action.stage === modalCurrent + 1;
                    const disabled =
                      trackingSubmitting ||
                      manageOrder.isDelivered ||
                      isCancelledOrder(manageOrder) ||
                      !isNext;

                    return (
                      <Button
                        key={action.trackingStatus}
                        type="button"
                        disabled={disabled}
                        variant={isNext ? 'default' : 'outline'}
                        className={`h-11 w-full justify-center rounded-xl ${alreadyApplied && !isNext
                            ? 'border-emerald-200 bg-emerald-50/50 text-emerald-800'
                            : ''
                          }`}
                        onClick={() => {
                          if (isNext) void handleTrackingAction(action.trackingStatus);
                        }}
                      >
                        {alreadyApplied && !isNext ? `✓ ${action.label}` : action.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {!isCancelledOrder(manageOrder) && !manageOrder.isDelivered && (
                <div className="pt-4 border-t border-stone-100">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={trackingSubmitting}
                    className="w-full"
                    onClick={() => void handleCancelOrder()}
                  >
                    Cancel Order
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setManageOrder(null)}>
              Close
            </Button>
            {manageOrder?.isDelivered && !isCancelledOrder(manageOrder) && (
              <span className="text-xs text-emerald-600">This order is delivered.</span>
            )}
            {manageOrder && isCancelledOrder(manageOrder) && (
              <span className="text-xs text-rose-600">Cancelled order.</span>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewOrder} onOpenChange={(open) => !open && setViewOrder(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border-stone-200 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              Order Details
            </DialogTitle>
            <DialogDescription>
              Full order information and customer details for Order #{viewOrder?.orderId || viewOrder?.id}
            </DialogDescription>
          </DialogHeader>

          {viewOrder && (
            <div className="grid gap-6 py-4 md:grid-cols-2">
              <div className="space-y-6">
                {/* Customer Info */}
                <section className="space-y-3">
                  <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    <UserIcon className="h-4 w-4" />
                    Customer Information
                  </h3>
                  <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-4 dark:border-white/5 dark:bg-white/5">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Name:</span>
                        <span className="font-bold">{viewOrder.shippingAddress?.fullName || viewOrder.customerName || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Email:</span>
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          <a href={`mailto:${viewOrder.customerEmail || viewOrder.user?.email || viewOrder.shippingAddress?.email}`} className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {viewOrder.customerEmail || viewOrder.user?.email || viewOrder.shippingAddress?.email || 'N/A'}
                          </a>
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Phone:</span>
                        <span className="font-medium">
                          <a href={`tel:${viewOrder.shippingAddress?.phone}`} className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {viewOrder.shippingAddress?.phone || 'N/A'}
                          </a>
                        </span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Shipping Address */}
                <section className="space-y-3">
                  <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    <Truck className="h-4 w-4" />
                    Shipping Details
                  </h3>
                  <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-4 dark:border-white/5 dark:bg-white/5">
                    <div className="text-sm leading-relaxed">
                      {viewOrder.shippingAddress ? (
                        <>
                          <p className="font-bold">{viewOrder.shippingAddress.address}</p>
                          <p>{viewOrder.shippingAddress.city}, {viewOrder.shippingAddress.state} {viewOrder.shippingAddress.zipCode}</p>
                          <p>{viewOrder.shippingAddress.country}</p>
                        </>
                      ) : (
                        <p className="italic text-muted-foreground">No shipping address provided (POS/In-store)</p>
                      )}
                    </div>
                    {viewOrder.trackingId && (
                      <div className="mt-3 pt-3 border-t border-stone-100 dark:border-white/5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Tracking ID:</span>
                          <span className="font-mono font-bold text-blue-600">{viewOrder.trackingId}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Payment Info */}
                <section className="space-y-3">
                  <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    <CreditCard className="h-4 w-4" />
                    Payment Information
                  </h3>
                  <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-4 dark:border-white/5 dark:bg-white/5">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Method:</span>
                        <span className="font-bold uppercase">{viewOrder.paymentMethod || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Status:</span>
                        <span className={`font-bold uppercase ${viewOrder.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {viewOrder.paymentStatus || 'Pending'}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total Amount:</span>
                        <span className="text-lg font-black">{formatINR(viewOrder.totalPrice || 0)}</span>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                {/* Order Items */}
                <section className="space-y-3">
                  <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    <ShoppingCart className="h-4 w-4" />
                    Order Items
                  </h3>
                  <div className="rounded-xl border border-stone-100 bg-white shadow-sm dark:border-white/5 dark:bg-black/20 overflow-hidden">
                    <div className="max-h-[300px] overflow-y-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-stone-50 dark:bg-white/5">
                          <tr>
                            <th className="px-4 py-2 font-bold">Item</th>
                            <th className="px-4 py-2 text-center font-bold">Qty</th>
                            <th className="px-4 py-2 text-right font-bold">Price</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 dark:divide-white/5">
                          {Array.isArray(viewOrder.items) && viewOrder.items.length > 0 ? (
                            viewOrder.items.map((item: any, i: number) => (
                              <tr key={i}>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    {item.image && (
                                      <img src={item.image} alt={item.name} className="h-8 w-8 rounded object-cover" />
                                    )}
                                    <span className="font-medium line-clamp-1">{item.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">{item.quantity}</td>
                                <td className="px-4 py-3 text-right font-bold">{formatINR(item.price)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground italic">
                                No item details available
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="bg-stone-50 p-3 dark:bg-white/5">
                      <div className="flex justify-between items-center px-1">
                        <span className="text-xs font-bold uppercase text-muted-foreground">Order Total</span>
                        <span className="text-xl font-black text-blue-600">{formatINR(viewOrder.totalPrice || 0)}</span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Status Timeline */}
                <section className="space-y-3">
                  <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Timeline & Status
                  </h3>
                  <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-4 dark:border-white/5 dark:bg-white/5">
                    <div className="mb-4 flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Placed on:</span>
                      <span className="text-xs font-medium">
                        {viewOrder.createdAt ? new Date(viewOrder.createdAt).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <OrderTrackingTimeline stages={stagesForModal(viewOrder)} variant="light" />
                  </div>
                </section>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setViewOrder(null)}>
              Close
            </Button>
            {isAdmin && !isCancelledOrder(viewOrder) && !viewOrder?.isDelivered && (
              <Button
                type="button"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => {
                  setManageOrder(viewOrder);
                  setViewOrder(null);
                }}
              >
                Update Tracking
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
