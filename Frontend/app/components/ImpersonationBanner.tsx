import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from './ui/button';
import { IMPERSONATION_SUPER_TOKEN_BACKUP_KEY, useAuth } from '../context/AuthContext';
import { superadminApi } from '../api/superadmin';
import { toast } from 'sonner';
import { roleDisplayName } from '../utils/roleOpenPanelConfig';

/**
 * Shown when the JWT was issued with `impersonatedBy` (Super Admin viewing another account).
 * Used on full-screen surfaces that are outside the main Dashboard shell (e.g. POS).
 */
export function ImpersonationBanner() {
  const navigate = useNavigate();
  const { user, refreshSession } = useAuth();
  const [returningToSuperAdmin, setReturningToSuperAdmin] = useState(false);

  const handleReturnToSuperAdmin = useCallback(async () => {
    setReturningToSuperAdmin(true);
    try {
      const res = await superadminApi.stopImpersonation();
      if (!res.success || !res.data?.token) {
        throw new Error(res.message || 'Could not restore Super Admin session');
      }
      localStorage.setItem('eco_shop_token', res.data.token);
      localStorage.removeItem(IMPERSONATION_SUPER_TOKEN_BACKUP_KEY);
      await refreshSession();
      toast.success('Returned to Super Admin');
      navigate('/super-admin');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to return to Super Admin');
    } finally {
      setReturningToSuperAdmin(false);
    }
  }, [navigate, refreshSession]);

  if (!user?.impersonation?.active) {
    return null;
  }

  const roleLabel = roleDisplayName(user.role);

  return (
    <div
      role="status"
      className="sticky top-0 z-[60] w-full shrink-0 flex flex-col gap-2 border-b border-amber-300/60 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/80 dark:text-amber-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <p className="min-w-0 font-medium whitespace-normal break-words">
        Viewing as <span className="font-semibold">{roleLabel}</span>:{' '}
        <span className="font-semibold">{user?.name}</span>
        <span className="text-amber-800/90 dark:text-amber-200/90"> — opened by Super Admin</span>
        {user.impersonation.superAdminName ? (
          <span className="text-amber-900/80 dark:text-amber-100/80"> ({user.impersonation.superAdminName})</span>
        ) : null}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 border-amber-400/80 bg-white/90 text-amber-950 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-50 dark:hover:bg-amber-900/70"
        disabled={returningToSuperAdmin}
        onClick={() => void handleReturnToSuperAdmin()}
      >
        {returningToSuperAdmin ? 'Returning…' : 'Return to Super Admin'}
      </Button>
    </div>
  );
}
