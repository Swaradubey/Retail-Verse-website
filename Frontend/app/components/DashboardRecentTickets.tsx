import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { motion } from 'framer-motion';
import { Headphones, Clock, Mail, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getAdminTickets, type SupportTicket, TICKET_STATUS_LABELS } from '../api/supportTickets';

function statusBadgeClass(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'resolved' || s === 'closed')
    return 'bg-[#2563EB] text-[#F8FAFC] border-none';
  if (s === 'open')
    return 'bg-[#FF6B00] text-[#F8FAFC] border-none';
  if (s === 'pending' || s === 'in_progress')
    return 'bg-[#0B1F3A] text-[#F8FAFC] border-none';
  return 'bg-[#0B1F3A] text-[#F8FAFC] border-none';
}

export function DashboardRecentTickets() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminTickets({ limit: 5 });
      setTickets(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="mt-8 overflow-hidden rounded-[1.125rem] border border-[#0B1F3A]/20 bg-[#F8FAFC] shadow-md transition-all duration-300 ease-out hover:border-[#2563EB] hover:shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between pt-6 px-6 pb-2">
        <div>
          <CardTitle className="text-lg font-bold tracking-tight text-[#0B1F3A]">Recent Support Tickets</CardTitle>
          <CardDescription className="text-sm mt-1 text-[#0B1F3A]/70 leading-relaxed">Most recent user-raised support requests.</CardDescription>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard/support')}
          className="text-sm font-semibold text-[#FF6B00] hover:text-[#2563EB] transition-colors duration-200 cursor-pointer"
        >
          View All
        </button>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 pb-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 rounded-2xl border border-transparent">
                <Skeleton className="h-4 w-48 mb-2 bg-[#0B1F3A]/10" />
                <Skeleton className="h-3 w-64 bg-[#0B1F3A]/10" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-[#0B1F3A]/70 py-6 text-center">{error}</p>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-[#0B1F3A]/70 py-6 text-center">No recent tickets found</p>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {tickets.map((ticket, index) => (
              <motion.button
                key={ticket._id}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06, duration: 0.3 }}
                onClick={() => navigate(`/dashboard/support?ticketId=${ticket._id}`)}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 group w-full text-left p-4 rounded-2xl border border-[#0B1F3A]/10 transition-all duration-200 ease-out hover:border-[#2563EB] hover:bg-[#2563EB]/5 cursor-pointer"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#2563EB]/10 flex items-center justify-center shrink-0">
                    <Headphones className="w-5 h-5 text-[#2563EB]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight text-[#0B1F3A] truncate">
                      {ticket.subject}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                      <span className="text-xs text-[#0B1F3A]/70 flex items-center gap-1">
                        <Mail className="w-3 h-3 text-[#2563EB]" /> {ticket.userName || ticket.userEmail || 'User'}
                      </span>
                      <span className="text-[10px] text-[#0B1F3A]/60 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#FF6B00]" /> {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-14 sm:ml-0">
                  <Badge className={statusBadgeClass(ticket.status)}>
                    {TICKET_STATUS_LABELS[ticket.status] || ticket.status}
                  </Badge>
                  <Eye className="w-4 h-4 text-[#0B1F3A]/50 group-hover:text-[#2563EB] transition-colors" />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
