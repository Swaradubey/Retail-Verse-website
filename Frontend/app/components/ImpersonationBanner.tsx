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
      className="sticky top-0 z-[60] w-full shrink-0 flex flex-col gap-2 border-b border-[#2563EB] bg-[#0B1F3A] px-4 py-2.5 text-sm text-[#F8FAFC] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <p className="min-w-0 font-medium whitespace-normal break-words">
        Viewing as <span className="font-semibold text-[#FF6B00]">{roleLabel}</span>:{' '}
        <span className="font-semibold text-[#F8FAFC]">{user?.name}</span>
        <span className="text-[#F8FAFC]/80"> — opened by Super Admin</span>
        {user.impersonation.superAdminName ? (
          <span className="text-[#F8FAFC]/70"> ({user.impersonation.superAdminName})</span>
        ) : null}
      </p>
      <Button
        type="button"
        size="sm"
        className="shrink-0 bg-[#FF6B00] hover:bg-[#2563EB] text-[#F8FAFC] border border-[#FF6B00] hover:border-[#2563EB] cursor-pointer"
        disabled={returningToSuperAdmin}
        onClick={() => void handleReturnToSuperAdmin()}
      >
        {returningToSuperAdmin ? 'Returning…' : 'Return to Super Admin'}
      </Button>
    </div>
  );
}
