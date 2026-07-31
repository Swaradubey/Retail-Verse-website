import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { useAuth } from '../context/AuthContext';
import { canAccessInventoryEditor } from '../utils/inventoryPermissions';
import { isStaffRole, isSuperAdminRole, isCustomerAccountRole } from '../utils/staffRoles';
import { Plus, Package, ShoppingCart, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { cn } from './ui/utils';
import { fetchUserDashboardOverview, type UserDashboardOverviewData } from '../api/orders';

const actions = [
  {
    label: 'New Sale',
    icon: Plus,
    gradient: 'from-[#d4af37] to-amber-800',
    ring: 'from-amber-300/60 via-amber-100/35 to-amber-400/45',
    description: 'Process a new customer order',
  },
  {
    label: 'Inventory',
    icon: Package,
    gradient: 'from-teal-600 to-emerald-800',
    ring: 'from-teal-300/50 via-emerald-100/30 to-teal-400/40',
    description: 'Manage products and stock levels',
  },
  {
    label: 'Orders',
    icon: ShoppingCart,
    gradient: 'from-amber-600 to-orange-800',
    ring: 'from-orange-300/50 via-amber-100/35 to-orange-400/45',
    description: 'Track and fulfill pending orders',
  },
] as const;

type DashboardQuickActionsProps = {
  onSync: () => void | Promise<void>;
  syncing: boolean;
};

export function DashboardQuickActions({ onSync, syncing }: DashboardQuickActionsProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const staff = isStaffRole(user?.role);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(true);

  const visibleActions = useMemo(
    () =>
      actions.filter((a) => {
        if (a.label === 'Inventory') return canAccessInventoryEditor(user?.role);
        if (a.label === 'Orders' && isCustomerAccountRole(user?.role)) return false;
        return true;
      }),
    [user?.role]
  );

  const loadOrderCount = useCallback(async () => {
    if (!user || isCustomerAccountRole(user?.role)) {
      setOrderCount(null);
      setLoadingCount(false);
      return;
    }
    setLoadingCount(true);
    try {
      const response = await fetchUserDashboardOverview();
      setOrderCount(response.totalOrders || 0);
    } catch (error) {
      console.error('Failed to load order count:', error);
      setOrderCount(null);
    } finally {
      setLoadingCount(false);
    }
  }, [user]);

  useEffect(() => {
    void loadOrderCount();
  }, [loadOrderCount]);

  const handleAction = useCallback(
    async (label: string) => {
      if (label === 'New Sale') {
        if (isCustomerAccountRole(user?.role)) {
          navigate('/shop?sale=true');
        } else {
          navigate('/pos?sale=true', { state: { fromDashboard: window.location.pathname } });
        }
        return;
      }
      if (label === 'Inventory') {
        if (!canAccessInventoryEditor(user?.role)) {
          toast.error('You do not have access to inventory.');
          return;
        }
        navigate('/dashboard/inventory');
        return;
      }
      if (label === 'Orders') {
        navigate('/dashboard/orders');
        return;
      }
    },
    [navigate, user?.role]
  );

  const onKeyActivate = (e: React.KeyboardEvent, label: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void handleAction(label);
    }
  };

  return (
    <div className="mt-2">
      <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-5 px-0.5">
        Quick Actions
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 sm:gap-6">
        {visibleActions.map((action, index) => {
          return (
            <motion.div
              key={action.label}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              role="button"
              tabIndex={0}
              onClick={() => void handleAction(action.label)}
              onKeyDown={(e) => onKeyActivate(e, action.label)}
              className={cn(
                'group rounded-[1.125rem] p-px bg-gradient-to-br shadow-sm transition-all duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fdf6e3] dark:focus-visible:ring-offset-zinc-950',
                action.ring,
                'cursor-pointer hover:shadow-[0_20px_48px_-16px_rgba(212,175,55,0.22)]'
              )}
            >
              <Card className="relative overflow-hidden rounded-[1.0625rem] border-0 bg-white/70 dark:bg-zinc-950/65 backdrop-blur-xl h-full transition-all duration-300 ease-out group-hover:bg-white/85 dark:group-hover:bg-zinc-950/75 pointer-events-none">
                <CardContent className="p-6">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${action.gradient} text-white shadow-lg mb-5 ring-4 ring-white/55 dark:ring-zinc-900/50 transition-transform duration-300 ease-out group-hover:scale-105 ${
                      action.label === 'Orders' && orderCount !== null ? 'scale-105' : ''
                    }`}
                  >
                    {action.label === 'Orders' ? (
                      loadingCount ? (
                        <span className="w-6 h-6 animate-pulse bg-white/30 rounded-full"></span>
                      ) : (
                        <span className="font-bold text-sm">{orderCount || 0}</span>
                      )
                    ) : (
                      <action.icon className="w-6 h-6" strokeWidth={2.25} />
                    )}
                  </div>
                  <h4 className="text-lg font-bold mb-1.5 tracking-tight text-zinc-900 dark:text-zinc-50 transition-colors duration-300 group-hover:text-[#9a7b28] dark:group-hover:text-amber-200">
                    {action.label}
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">{action.description}</p>
                  <div className="flex items-center text-xs font-bold text-[#b8860b] dark:text-amber-300 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    Get Started
                    <ArrowRight className="w-3.5 h-3.5 ml-2" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
