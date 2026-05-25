import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Mail, MessageSquareText, Inbox, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import {
  adminContactApi,
  type ContactMessage,
  type ContactMessageStatus,
} from '../../api/contact';
import { useAuth } from '../../context/AuthContext';
import { hasFullAdminPrivileges } from '../../utils/staffRoles';

function formatDate(iso: string | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function statusLabel(s: ContactMessageStatus): string {
  switch (s) {
    case 'new': return 'New';
    case 'in-progress': return 'In progress';
    case 'resolved': return 'Resolved';
    default: return s;
  }
}

function statusBadgeClass(s: ContactMessageStatus): string {
  switch (s) {
    case 'new': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-none';
    case 'in-progress': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-none';
    case 'resolved': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-none';
    default: return 'bg-gray-100 text-gray-800 border-none';
  }
}

function truncate(text: string, max: number) {
  if (!text) return '—';
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function containerVariants(stagger = 0.06) {
  return {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: stagger, delayChildren: 0.04 },
    },
  };
}

function itemVariants() {
  return {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
  };
}

export function DashboardCustomersContactForm() {
  const { token, user } = useAuth();
  const canView = hasFullAdminPrivileges(user?.role);

  const [rows, setRows] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'new'>('all');
  const sectionRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!token || !canView) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await adminContactApi.getAll();
      setRows(res.success && Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load contact messages');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, canView]);

  useEffect(() => { load(); }, [load]);

  const total = rows.length;
  const newCount = useMemo(() => rows.filter((r) => r.status === 'new').length, [rows]);
  const filteredRows = useMemo(() => filter === 'new' ? rows.filter((r) => r.status === 'new') : rows, [rows, filter]);
  const scrollToSection = () => {
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const DELETE_SELECT_VALUE = 'delete';

  const onStatusChange = async (id: string, value: string) => {
    if (value === DELETE_SELECT_VALUE) {
      if (!window.confirm('Delete this contact message permanently?')) return;
      setUpdatingId(id);
      try {
        const res = await adminContactApi.deleteMessage(id);
        if (res.success) {
          setRows((prev) => prev.filter((r) => r._id !== id));
          toast.success(res.message || 'Message deleted');
        } else {
          throw new Error((res as any).message || 'Delete failed');
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not delete message');
      } finally {
        setUpdatingId(null);
      }
      return;
    }
    setUpdatingId(id);
    try {
      const res = await adminContactApi.updateStatus(id, value as ContactMessageStatus);
      if (res.success && res.data) {
        setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...res.data! } : r)));
        toast.success('Status updated');
      } else {
        throw new Error((res as any).message || 'Update failed');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update status');
    } finally {
      setUpdatingId(null);
    }
  };

  if (!canView) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-8 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
        <p className="font-medium text-amber-900 dark:text-amber-100">
          Contact messages are restricted to authorized personnel.
        </p>
      </div>
    );
  }

  return (
    <motion.div className="space-y-8" variants={containerVariants()} initial="hidden" animate="show">
      {/* Stats row */}
      <motion.div variants={itemVariants()} className="grid gap-5 md:grid-cols-2">
        <motion.div variants={itemVariants()}>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => { setFilter('all'); scrollToSection(); }}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilter('all'); scrollToSection(); } }}
            className={`group relative overflow-hidden border bg-white/70 shadow-lg backdrop-blur-xl transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 cursor-pointer dark:bg-black/40 dark:shadow-black/20 ${
              filter === 'all'
                ? 'border-blue-300/60 shadow-blue-200/50 ring-2 ring-blue-500/30 dark:border-blue-500/40 dark:ring-blue-400/30'
                : 'border-white/20 shadow-gray-200/50 dark:border-white/5'
            }`}
          >
            <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-blue-500 to-blue-400 opacity-80" />
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <div className="space-y-0.5">
                <CardTitle className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/80">
                  Total Messages
                </CardTitle>
                <CardDescription className="text-[11px] leading-tight">
                  All-time contact form submissions
                </CardDescription>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 text-blue-600 shadow-sm ring-1 ring-blue-500/10 dark:text-blue-400 dark:ring-blue-400/20">
                <Mail className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">
                  {total}
                </span>
                <span className="text-sm font-semibold text-muted-foreground/60">total</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground/70">
                Messages from the website contact form
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants()}>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => { setFilter('new'); scrollToSection(); }}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilter('new'); scrollToSection(); } }}
            className={`group relative overflow-hidden bg-white/70 shadow-lg backdrop-blur-xl transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 cursor-pointer dark:bg-black/40 dark:shadow-black/20 ${
              filter === 'new'
                ? 'border-2 border-orange-300 shadow-[0_0_0_3px_rgba(251,146,60,0.20)] dark:border-orange-400 dark:shadow-[0_0_0_3px_rgba(251,146,60,0.30)]'
                : 'border border-white/20 shadow-gray-200/50 dark:border-white/5'
            }`}
          >
            <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-amber-500 to-amber-400 opacity-80" />
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <div className="space-y-0.5">
                <CardTitle className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/80">
                  New / Unread
                </CardTitle>
                <CardDescription className="text-[11px] leading-tight">
                  Submissions still marked as new
                </CardDescription>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 text-amber-600 shadow-sm ring-1 ring-amber-500/10 dark:text-amber-400 dark:ring-amber-400/20">
                <MessageSquareText className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">
                  {newCount}
                </span>
                <span className="text-sm font-semibold text-muted-foreground/60">new</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground/70">
                Messages awaiting review
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Contact Form Leads Section */}
      <div ref={sectionRef}>
      {loading ? (
        <motion.div variants={itemVariants()} className="flex flex-col items-center justify-center py-28 text-muted-foreground">
          <div className="relative mb-6">
            <div className="absolute inset-0 animate-ping rounded-full bg-blue-400/20 dark:bg-blue-600/20" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-50 to-blue-100 shadow-inner dark:from-blue-950/30 dark:to-blue-900/20">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <p className="text-sm font-semibold text-foreground/80">Loading contact messages…</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Please wait while we fetch the latest entries.</p>
        </motion.div>
      ) : error ? (
        <motion.div variants={itemVariants()} className="rounded-2xl border border-red-200/80 bg-red-50/80 px-6 py-8 text-center backdrop-blur-sm dark:border-red-900/50 dark:bg-red-950/20">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
          </div>
          <p className="font-semibold text-red-800 dark:text-red-200">{error}</p>
          <button type="button" onClick={() => load()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-red-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-200/50 transition-all hover:from-red-700 hover:to-red-600 hover:shadow-xl active:scale-[0.97] dark:shadow-red-900/30">
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </motion.div>
      ) : filteredRows.length === 0 ? (
        <motion.div variants={itemVariants()}>
          <Card className="overflow-hidden border border-dashed border-gray-200/70 bg-white/50 shadow-sm dark:border-white/10 dark:bg-black/20">
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 shadow-sm ring-1 ring-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 dark:ring-blue-900/40">
                <Inbox className="h-10 w-10 text-blue-500/70 dark:text-blue-400/60" />
              </div>
              {rows.length === 0 ? (
                <>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">No contact messages yet</h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground/80">
                    When visitors submit the contact form on your site, entries will appear here for you to review and manage.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">No {filter === 'new' ? 'new / unread' : 'matching'} messages</h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground/80">
                    {filter === 'new' ? 'All contact form submissions have been reviewed.' : 'Try selecting a different filter to see more results.'}
                  </p>
                </>
              )}
            </div>
          </Card>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants()}>
          <Card className="overflow-hidden border border-white/20 bg-white/80 shadow-xl shadow-gray-200/40 backdrop-blur-xl transition-all duration-300 dark:border-white/5 dark:bg-black/40 dark:shadow-black/20">
            <CardHeader className="flex flex-col gap-1 border-b border-gray-100/80 px-7 py-6 dark:border-white/5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-gray-900 dark:text-white">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-600/5 text-blue-600 shadow-sm ring-1 ring-blue-500/10 dark:text-blue-400 dark:ring-blue-400/20">
                    <Mail className="h-4 w-4" />
                  </span>
                  Contact Form Leads
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    filter === 'all'
                      ? 'bg-blue-100/80 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${filter === 'all' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                    {filter === 'all' ? 'All messages' : 'New / Unread'}
                  </span>
                </CardTitle>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground/80">
                  Manage inquiries and leads from the website contact page.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground dark:bg-white/5">
                  <Mail className="h-3.5 w-3.5" />
                  <span>{total} {total === 1 ? 'message' : 'messages'}</span>
                </div>
                {newCount > 0 && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100/80 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    <MessageSquareText className="h-3.5 w-3.5" />
                    <span>{newCount} unread</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100/80 dark:border-white/5">
                      <th className="px-7 py-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">Customer</th>
                      <th className="px-7 py-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">Phone</th>
                      <th className="px-7 py-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70 min-w-[200px]">Message</th>
                      <th className="px-7 py-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">Submitted</th>
                      <th className="px-7 py-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">Status</th>
                      <th className="px-7 py-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100/60 dark:divide-white/5">
                    {filteredRows.map((row) => (
                      <tr
                        key={row._id}
                        className="transition-colors duration-150 hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
                      >
                        <td className="px-7 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200 text-xs font-bold text-gray-600 shadow-sm dark:from-gray-800 dark:to-gray-700 dark:text-gray-300">
                              {row.firstName?.charAt(0)?.toUpperCase() || '?'}
                              {row.lastName?.charAt(0)?.toUpperCase() || ''}
                            </div>
                            <div className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">
                                {row.firstName} {row.lastName}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground/70">
                                {row.email}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-7 py-4">
                          <span className="text-sm text-muted-foreground/80">{row.phone || <span className="text-muted-foreground/40">—</span>}</span>
                        </td>
                        <td className="px-7 py-4">
                          <div className="min-w-0 max-w-xs">
                            <p className="truncate text-sm font-medium text-gray-900 dark:text-white" title={row.subject}>
                              {truncate(row.subject, 48)}
                            </p>
                            <p className="mt-0.5 truncate text-xs leading-relaxed text-muted-foreground/70" title={row.message}>
                              {truncate(row.message, 110)}
                            </p>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-7 py-4">
                          <span className="text-xs font-medium text-muted-foreground/70">
                            {formatDate(row.createdAt)}
                          </span>
                        </td>
                        <td className="px-7 py-4">
                          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                            <Badge className={statusBadgeClass(row.status)}>
                              {statusLabel(row.status)}
                            </Badge>
                            <label className="sr-only" htmlFor={`status-${row._id}`}>Update status for {row.email}</label>
                            <select
                              id={`status-${row._id}`}
                              className="w-full min-w-[120px] rounded-lg border border-gray-200/70 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-black/40 dark:text-gray-300 dark:hover:border-white/20"
                              value={row.status}
                              disabled={updatingId === row._id}
                              onChange={(e) => onStatusChange(row._id, e.target.value)}
                            >
                              <option value="new">New</option>
                              <option value="in-progress">In progress</option>
                              <option value="resolved">Resolved</option>
                            </select>
                          </div>
                        </td>
                        <td className="px-7 py-4">
                          <button
                            type="button"
                            title="Delete message"
                            onClick={() => onStatusChange(row._id, DELETE_SELECT_VALUE)}
                            disabled={updatingId === row._id}
                            className="inline-flex items-center justify-center rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
      </div>
    </motion.div>
  );
}
