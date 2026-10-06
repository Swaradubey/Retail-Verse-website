import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { useAuth } from '../context/AuthContext';
import { canAccessInventoryEditor } from '../utils/inventoryPermissions';
import { isStaffRole, isCustomerAccountRole } from '../utils/staffRoles';
import { Plus, Package, ShoppingCart, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { fetchUserDashboardOverview } from '../api/orders';

const actions = [
  {
    label: 'New Sale',
    icon: Plus,
    iconBg: 'bg-[#FF6B00] text-[#F8FAFC]',
    description: 'Process a new customer order',
  },
  {
    label: 'Inventory',
    icon: Package,
    iconBg: 'bg-[#2563EB] text-[#F8FAFC]',
    description: 'Manage products and stock levels',
  },
  {
    label: 'Orders',
    icon: ShoppingCart,
    iconBg: 'bg-[#0B1F3A] text-[#F8FAFC]',
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
      <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0B1F3A] mb-5 px-0.5">
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
              className="group rounded-[1.125rem] bg-[#F8FAFC] border border-[#0B1F3A]/20 hover:border-[#2563EB] shadow-md transition-all duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] cursor-pointer hover:shadow-lg"
            >
              <Card className="relative overflow-hidden rounded-[1.0625rem] border-0 bg-transparent h-full pointer-events-none">
                <CardContent className="p-6">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${action.iconBg} shadow-md mb-5 ring-2 ring-[#0B1F3A]/10 transition-transform duration-300 ease-out group-hover:scale-105 ${
                      action.label === 'Orders' && orderCount !== null ? 'scale-105' : ''
                    }`}
                  >
                    {action.label === 'Orders' ? (
                      loadingCount ? (
                        <span className="w-6 h-6 animate-pulse bg-[#F8FAFC]/30 rounded-full"></span>
                      ) : (
                        <span className="font-bold text-sm text-[#F8FAFC]">{orderCount || 0}</span>
                      )
                    ) : (
                      <action.icon className="w-6 h-6" strokeWidth={2.25} />
                    )}
                  </div>
                  <h4 className="text-lg font-bold mb-1.5 tracking-tight text-[#0B1F3A] transition-colors duration-300 group-hover:text-[#2563EB]">
                    {action.label}
                  </h4>
                  <p className="text-sm text-[#0B1F3A]/70 leading-relaxed mb-4">{action.description}</p>
                  <div className="flex items-center text-xs font-bold text-[#FF6B00] uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity duration-300">
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
