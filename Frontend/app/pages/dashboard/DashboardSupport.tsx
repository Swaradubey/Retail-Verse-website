import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router';
import {
  Headphones,
  Ticket,
  Eye,
  AlertCircle,
  Package,
  Mail,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Plus,
  LifeBuoy,
  X,
  Loader2,
  MessageSquare,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { useAuth } from '../../context/AuthContext';
import { SupportChatModal } from './SupportChatModal';
import ApiService from '../../api/apiService';

export function DashboardSupport() {
  const { user } = useAuth();
  const location = useLocation();
  const [stats, setStats] = useState({ total: 0, open: 0, resolved: 0, pending: 0 });
  const [tickets, setTickets] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewTicketsModalOpen, setIsViewTicketsModalOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    description: '',
    name: user?.name || '',
    email: user?.email || '',
    category: 'Customer Queries',
    priority: 'normal'
  });
  const [systemTickets, setSystemTickets] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingSystemTickets, setLoadingSystemTickets] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeletingTicket, setIsDeletingTicket] = useState(false);

  // Read backend base URL from env if needed, or rely on vite proxy
  // We'll use relative paths relying on Vite proxy or same-domain deployment.

  useEffect(() => {
    fetchStats();
    fetchSystemTickets();

    const handleInvalidate = () => {
      console.log('[DEBUG] Invalidating and refetching support tickets...');
      fetchStats();
      fetchSystemTickets();
    };

    window.addEventListener('invalidate-support-tickets', handleInvalidate);
    return () => {
      window.removeEventListener('invalidate-support-tickets', handleInvalidate);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ticketId = params.get('ticketId');
    if (ticketId && systemTickets.length > 0) {
      const found = systemTickets.find((t: any) => t._id === ticketId);
      if (found) {
        setSelectedTicket(found);
        setIsDetailModalOpen(true);
      }
    }
  }, [location.search, systemTickets]);

  useEffect(() => {
    let result = tickets;

    // Filter by status
    if (statusFilter !== "all") {
      result = result.filter((t: any) => String(t.status).toLowerCase() === statusFilter.toLowerCase());
    }

    // Filter by search query
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      result = result.filter((t: any) =>
        (t.subject && t.subject.toLowerCase().includes(q)) ||
        (t.id && String(t.id).includes(q)) ||
        (t.requesterName && t.requesterName.toLowerCase().includes(q)) ||
        (t.requesterEmail && t.requesterEmail.toLowerCase().includes(q)) ||
        (t.status && t.status.toLowerCase().includes(q)) ||
        (t.tags && t.tags.some((tag: string) => tag.toLowerCase().includes(q)))
      );
    }

    setFilteredTickets(result);
  }, [searchQuery, statusFilter, tickets]);

  const getFilteredSystemTickets = () => {
    let result = systemTickets;

    // Filter by status
    if (statusFilter !== "all") {
      result = result.filter((t: any) => {
        // Explicitly include if matches POS invoice support ticket rule (Requirement 4)
        const matchesInvoiceRule = 
          t.source === 'invoice_email' || 
          t.type === 'invoice' || 
          t.category === 'Order Support' || 
          (t.subject && t.subject.includes('Invoice Receipt'));
          
        if (matchesInvoiceRule) return true;
        
        return String(t.status).toLowerCase() === statusFilter.toLowerCase();
      });
    }

    // Filter by search query
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      result = result.filter((t: any) => {
        // Explicitly include if matches POS invoice support ticket rule (Requirement 4)
        const matchesInvoiceRule = 
          t.source === 'invoice_email' || 
          t.type === 'invoice' || 
          t.category === 'Order Support' || 
          (t.subject && t.subject.includes('Invoice Receipt'));
          
        if (matchesInvoiceRule) return true;

        return (
          (t.subject && t.subject.toLowerCase().includes(q)) ||
          (t._id && String(t._id).toLowerCase().includes(q)) ||
          (t.userName && t.userName.toLowerCase().includes(q)) ||
          (t.userEmail && t.userEmail.toLowerCase().includes(q)) ||
          (t.status && t.status.toLowerCase().includes(q)) ||
          (t.issueType && t.issueType.toLowerCase().includes(q))
        );
      });
    }

    return result;
  };

  // Dynamic stats calculated from active fetched ticket list (Requirement 5)
  const dynamicStats = React.useMemo(() => {
    const total = systemTickets.length;
    const open = systemTickets.filter((t: any) => String(t.status).toLowerCase() === 'open').length;
    const resolved = systemTickets.filter((t: any) => String(t.status).toLowerCase() === 'resolved').length;
    const pending = systemTickets.filter((t: any) => String(t.status).toLowerCase() === 'pending').length;
    return { total, open, resolved, pending };
  }, [systemTickets]);

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await ApiService.get('/support-tickets/stats', { pageName: 'Support' });
      if (res.success && res.data) {
        setStats(res.data);
      }
    } catch (err: any) {
      console.error("[Zendesk Stats Error]", err);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchTickets = async () => {
    setLoadingTickets(true);
    try {
      const res = await ApiService.get('/support-tickets/zendesk', { pageName: 'Support' });

      if (res.success && res.data && res.data.length > 0) {
        setTickets(res.data);
      } else {
        console.log("[Debug] Zendesk returned empty, falling back to Admin MongoDB tickets...");
        const adminRes = await ApiService.get('/support-tickets/admin', { pageName: 'Support' });
        if (adminRes.success && adminRes.data) {
          setTickets(adminRes.data);
        }
      }
    } catch (err: any) {
      console.error("[Zendesk Tickets Error]", err);
      toast.error(err.message || "Failed to load tickets.");
    } finally {
      setLoadingTickets(false);
    }
  };

  const fetchSystemTickets = async () => {
    setLoadingSystemTickets(true);
    try {
      const res = await ApiService.get('/support-tickets/admin', { pageName: 'Support' });
      if (res.success && res.data) {
        setSystemTickets(res.data);
      }
    } catch (err) {
      console.error("[System Tickets Error]", err);
    } finally {
      setLoadingSystemTickets(false);
    }
  };

  const handleDeleteTicket = async () => {
    if (!selectedTicket?._id) return;
    setIsDeletingTicket(true);
    try {
      const res = await ApiService.delete(`/support-tickets/${selectedTicket._id}`, { pageName: 'Support' });
      if (res.success) {
        toast.success('Ticket deleted successfully');
        // Remove from state without page reload
        setSystemTickets((prev: any[]) => prev.filter((t: any) => t._id !== selectedTicket._id));
        setDeleteConfirmOpen(false);
        setIsDetailModalOpen(false);
        setSelectedTicket(null);
      } else {
        toast.error(res.message || 'Failed to delete ticket');
      }
    } catch (err: any) {
      toast.error(err.message || 'Network error while deleting ticket');
    } finally {
      setIsDeletingTicket(false);
    }
  };

  const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
    try {
      const res = await ApiService.patch(`/support-tickets/${ticketId}/status`, { status: newStatus }, { pageName: 'Support' });
      if (res.success) {
        toast.success(`Ticket marked as ${newStatus}`);
        fetchStats();
        fetchSystemTickets();
        setIsDetailModalOpen(false);
      } else {
        toast.error(res.message || "Failed to update status");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error while updating status");
    }
  };

  const handleOpenViewTickets = () => {
    setIsViewTicketsModalOpen(true);
    fetchTickets();
  };

  const handleOpenChat = () => {
    setIsChatOpen(true);
    fetchTickets();
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingTicket(true);
    try {
      const res = await ApiService.post('/support-tickets/zendesk', ticketForm, { pageName: 'Support' });
      if (res.success) {
        toast.success("Ticket created successfully in Zendesk.");
        setIsModalOpen(false);
        setTicketForm({ subject: '', description: '', name: '', email: '', category: 'Customer Queries', priority: 'normal' });
        fetchStats();
        if (isViewTicketsModalOpen) {
          fetchTickets();
        }
      } else {
        toast.error(res.message || "Failed to create ticket.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error.");
    } finally {
      setCreatingTicket(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-start gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-gray-900 via-gray-700 to-gray-800 dark:from-white dark:via-gray-200 dark:to-gray-300 bg-clip-text text-transparent">
              Support Center
            </h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-xl">
            Manage your support operations, track team performance, and view detailed insights in one place.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 lg:ml-10">
          <div className="hidden sm:flex -space-x-3 mr-2">
            {['JH', 'AK', 'MR'].map((initials, i) => (
              <div
                key={i}
                className="w-10 h-10 rounded-full border-2 border-white dark:border-zinc-900 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-zinc-700 dark:to-zinc-800 flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-300 shadow-sm"
                style={{ zIndex: 3 - i }}
              >
                {initials}
              </div>
            ))}
          </div>
          <button
            onClick={handleOpenViewTickets}
            className="w-full sm:min-w-[170px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-200 font-semibold hover:bg-gray-50 dark:hover:bg-zinc-700 hover:text-gray-900 dark:hover:text-white transition-all duration-300 ease-out hover:scale-[1.03] shadow-sm">
            <Eye className="w-4 h-4" />
            View Tickets
          </button>
          <button
            onClick={handleOpenChat}
            className="w-full sm:min-w-[170px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all duration-300 ease-out hover:scale-[1.03] shadow-sm">
            <MessageSquare className="w-4 h-4" />
            Open Chat
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:min-w-[170px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold transition-all duration-300 ease-out hover:scale-[1.05] shadow-[0_4px_14px_0_rgba(245,158,11,0.39)] hover:shadow-[0_6px_20px_rgba(245,158,11,0.23)] border-none">
            <Ticket className="w-4 h-4" />
            Raise Ticket
          </button>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Tickets", value: loadingSystemTickets ? "..." : (dynamicStats.total || "0"), icon: Ticket, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-500/20" },
          { label: "Open", value: loadingSystemTickets ? "..." : (dynamicStats.open || "0"), icon: AlertCircle, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-500/20" },
          { label: "Resolved", value: loadingSystemTickets ? "..." : (dynamicStats.resolved || "0"), icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-500/20" },
          { label: "Pending", value: loadingSystemTickets ? "..." : (dynamicStats.pending || "0"), icon: Clock, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-500/20" },
        ].map((stat, idx) => (
          <Card key={idx} className="border border-gray-100 dark:border-white/5 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 rounded-2xl overflow-hidden group">
            <div className="p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white group-hover:scale-105 transition-transform origin-left">{stat.value}</h3>
              </div>
              <div className={`w-12 h-12 rounded-full ${stat.bg} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Action Bar (Search & Filter) mb-2 */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-sm p-2 md:p-3 rounded-2xl border border-gray-100 dark:border-zinc-800/80 shadow-sm mt-2">
        <div className="relative w-full sm:w-96 pl-2">
          <Search className="w-4 h-4 text-gray-400 absolute left-5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search for tickets, users, or issues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-none rounded-xl pl-10 pr-4 py-2 text-sm outline-none placeholder:text-gray-400 text-gray-800 dark:text-gray-200 focus:ring-0"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto pr-2 pb-2 sm:pb-0">
          <div className="relative flex items-center bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 transition-colors w-full sm:w-auto">
            <Filter className="w-4 h-4 mr-2 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent border-none p-0 outline-none text-sm font-semibold text-gray-700 dark:text-gray-200 focus:ring-0 cursor-pointer pr-8"
            >
              <option value="all" className="bg-white dark:bg-zinc-800 text-gray-900 dark:text-white">Filter: All Statuses</option>
              <option value="open" className="bg-white dark:bg-zinc-800 text-gray-900 dark:text-white">Filter: Open</option>
              <option value="pending" className="bg-white dark:bg-zinc-800 text-gray-900 dark:text-white">Filter: Pending</option>
              <option value="resolved" className="bg-white dark:bg-zinc-800 text-gray-900 dark:text-white">Filter: Resolved</option>
            </select>
          </div>
        </div>
      </div>

      {/* Categories Cards */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white px-1">Support Categories</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="group relative border border-gray-100/80 bg-gradient-to-br from-white to-gray-50/80 shadow-sm dark:border-white/5 dark:from-zinc-900/80 dark:to-zinc-900/40 rounded-[20px] transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/5">
            <CardHeader className="flex flex-row items-center gap-4 pb-2 pt-6">
              <div className="w-12 h-12 rounded-[14px] bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:bg-blue-100 dark:group-hover:bg-blue-500/20">
                <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors" />
              </div>
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">Customer Queries</CardTitle>
            </CardHeader>
            <CardContent className="pb-6 relative z-10">
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed pr-2">
                Handle customer inquiries and general questions. Provide rapid responses to improve user satisfaction.
              </p>
            </CardContent>
            <div className="absolute inset-0 border-2 border-transparent pointer-events-none rounded-[20px] transition-colors duration-300 group-hover:border-blue-500/20" />
          </Card>

          <Card className="group relative border border-gray-100/80 bg-gradient-to-br from-white to-gray-50/80 shadow-sm dark:border-white/5 dark:from-zinc-900/80 dark:to-zinc-900/40 rounded-[20px] transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-500/5">
            <CardHeader className="flex flex-row items-center gap-4 pb-2 pt-6">
              <div className="w-12 h-12 rounded-[14px] bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:bg-rose-100 dark:group-hover:bg-rose-500/20">
                <AlertCircle className="w-6 h-6 text-rose-600 dark:text-rose-400 group-hover:text-rose-700 dark:group-hover:text-rose-300 transition-colors" />
              </div>
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">Reported Issues</CardTitle>
            </CardHeader>
            <CardContent className="pb-6 relative z-10">
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed pr-2">
                Track and resolve platform bugs, technical difficulties, and critical system issues efficiently.
              </p>
            </CardContent>
            <div className="absolute inset-0 border-2 border-transparent pointer-events-none rounded-[20px] transition-colors duration-300 group-hover:border-rose-500/20" />
          </Card>

          <Card className="group relative border border-gray-100/80 bg-gradient-to-br from-white to-gray-50/80 shadow-sm dark:border-white/5 dark:from-zinc-900/80 dark:to-zinc-900/40 rounded-[20px] transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-500/5">
            <CardHeader className="flex flex-row items-center gap-4 pb-2 pt-6">
              <div className="w-12 h-12 rounded-[14px] bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/20">
                <Package className="w-6 h-6 text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors" />
              </div>
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">Order Support</CardTitle>
            </CardHeader>
            <CardContent className="pb-6 relative z-10">
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed pr-2">
                Assist with delivery logistics, refunds, cancellations, and real-time order tracking inquiries.
              </p>
            </CardContent>
            <div className="absolute inset-0 border-2 border-transparent pointer-events-none rounded-[20px] transition-colors duration-300 group-hover:border-emerald-500/20" />
          </Card>
        </div>
      </div>

      {/* Recent System Tickets Area */}
      <div className="pt-2">
        <div className="flex items-center justify-between px-1 mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Recent System Tickets</h2>
          <button
            onClick={fetchSystemTickets}
            className="text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors flex items-center gap-1"
          >
            <Clock className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {loadingSystemTickets ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-500 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm font-medium">Loading system tickets...</p>
          </div>
        ) : systemTickets.length === 0 ? (
          <Card className="border border-dashed border-gray-300 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/20 shadow-none rounded-[24px] overflow-hidden">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center relative">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="relative w-24 h-24 mb-6 group">
                <div className="absolute inset-0 bg-amber-500/10 rounded-full animate-ping opacity-75 duration-1000" />
                <div className="bg-white dark:bg-zinc-800 rounded-full w-full h-full flex items-center justify-center shadow-lg border border-gray-100 dark:border-zinc-700 relative z-10 transition-transform duration-300 group-hover:scale-110">
                  <Headphones className="w-10 h-10 text-amber-500" />
                </div>
              </div>

              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">No System Tickets Yet</h3>
              <p className="text-gray-500 dark:text-gray-400 text-[15px] max-w-sm mb-8 leading-relaxed">
                You're all caught up! No support requests are currently available or pending your review.
              </p>

              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-zinc-900 font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-all duration-300 ease-out hover:scale-[1.03] shadow-md hover:shadow-lg">
                <Plus className="w-4 h-4" />
                Create First Ticket
              </button>
            </CardContent>
          </Card>
        ) : getFilteredSystemTickets().length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-500 gap-3 text-center">
            <Ticket className="w-10 h-10 text-gray-400 opacity-60" />
            <p className="text-base font-bold text-gray-800 dark:text-gray-200">No matching tickets found</p>
            <p className="text-sm text-gray-500">Try adjusting your filters or search query.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {getFilteredSystemTickets().map((t: any) => (
              <Card key={t._id} className="border border-gray-100 dark:border-white/5 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 rounded-2xl overflow-hidden group">
                <div className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 items-center mb-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                        {t.issueType?.replace(/_/g, ' ')}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${t.status === 'open' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' :
                        t.status === 'resolved' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' :
                          'bg-gray-50 text-gray-600 dark:bg-gray-500/10 dark:text-gray-400'
                        }`}>
                        {t.status}
                      </span>
                      {t.priority && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                          {t.priority}
                        </span>
                      )}
                      {t.orderRef && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {t.orderRef}
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-gray-900 dark:text-white text-lg mb-1 truncate group-hover:text-amber-600 transition-colors">
                      {t.subject}
                    </h4>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
                        <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-[10px] font-bold text-amber-600 uppercase">
                          {t.userName?.charAt(0) || 'U'}
                        </div>
                        {t.userName}
                      </div>
                      <div className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        {t.userEmail}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(t.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedTicket(t);
                      setIsDetailModalOpen(true);
                    }}
                    className="w-full sm:w-auto px-5 py-2 rounded-xl bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 hover:bg-amber-500 hover:border-amber-500 hover:text-white transition-all duration-300 font-semibold shadow-sm flex items-center justify-center gap-2 group-hover:scale-105"
                  >
                    <Eye className="w-4 h-4" />
                    View Details
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )
        }
      </div>

      {/* Modals implementation */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-lg bg-white dark:bg-zinc-900 p-6 shadow-2xl relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold mb-6 dark:text-white">Raise New Ticket</h2>
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold dark:text-gray-300">Name</label>
                  <input required type="text" className="w-full px-3 py-2 rounded-lg border dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" value={ticketForm.name} onChange={e => setTicketForm({ ...ticketForm, name: e.target.value })} placeholder="User Name" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold dark:text-gray-300">Email</label>
                  <input required type="email" className="w-full px-3 py-2 rounded-lg border dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" value={ticketForm.email} onChange={e => setTicketForm({ ...ticketForm, email: e.target.value })} placeholder="user@example.com" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold dark:text-gray-300">Subject</label>
                <input required type="text" className="w-full px-3 py-2 rounded-lg border dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" value={ticketForm.subject} onChange={e => setTicketForm({ ...ticketForm, subject: e.target.value })} placeholder="Brief ticket subject" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold dark:text-gray-300">Category</label>
                  <select className="w-full px-3 py-2 rounded-lg border dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" value={ticketForm.category} onChange={e => setTicketForm({ ...ticketForm, category: e.target.value })}>
                    <option value="Customer Queries">Customer Queries</option>
                    <option value="Reported Issues">Reported Issues</option>
                    <option value="Order Support">Order Support</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold dark:text-gray-300">Priority</label>
                  <select className="w-full px-3 py-2 rounded-lg border dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" value={ticketForm.priority} onChange={e => setTicketForm({ ...ticketForm, priority: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold dark:text-gray-300">Description</label>
                <textarea required rows={4} className="w-full px-3 py-2 rounded-lg border dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" value={ticketForm.description} onChange={e => setTicketForm({ ...ticketForm, description: e.target.value })} placeholder="Detailed description of the issue..."></textarea>
              </div>
              <button type="submit" disabled={creatingTicket} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold transition disabled:opacity-50">
                {creatingTicket ? <Loader2 className="w-5 h-5 animate-spin" /> : <Ticket className="w-5 h-5" />}
                {creatingTicket ? "Creating..." : "Submit Ticket"}
              </button>
            </form>
          </Card>
        </div>
      )}

      {isViewTicketsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-5xl h-[80vh] flex flex-col bg-white dark:bg-zinc-900 shadow-2xl relative overflow-hidden rounded-2xl">
            <div className="p-6 border-b dark:border-zinc-800 flex justify-between items-center bg-gray-50 dark:bg-zinc-800/50">
              <h2 className="text-2xl font-bold dark:text-white flex items-center gap-2">
                <Eye className="w-6 h-6 text-blue-500" /> Zendesk Tickets
              </h2>
              <button onClick={() => setIsViewTicketsModalOpen(false)} className="p-2 rounded-full bg-white dark:bg-zinc-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-600 shadow-sm transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {loadingTickets ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-4">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                  Loading Zendesk Tickets...
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                  <Ticket className="w-16 h-16 mb-4 opacity-20" />
                  <p>No tickets found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredTickets.map((t: any) => (
                    <div key={t.id} className="p-4 border dark:border-zinc-800 rounded-xl hover:border-amber-500/50 transition-colors bg-white dark:bg-zinc-900 flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex gap-2 items-center mb-1 flex-wrap">
                          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">#{t.id}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${t.status === 'open' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' :
                            t.status === 'solved' || t.status === 'closed' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' :
                              'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                            }`}>
                            {t.status}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-300">
                            {t.priority}
                          </span>
                        </div>
                        <h4 className="font-bold text-gray-900 dark:text-white text-lg truncate mb-1">{t.subject}</h4>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <div className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
                            <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-[10px] font-bold text-blue-600 uppercase">
                              {t.requesterName?.charAt(0) || 'U'}
                            </div>
                            {t.requesterName}
                          </div>
                          <div className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5" />
                            {t.requesterEmail}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(t.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        {t.tags && t.tags.length > 0 && (
                          <div className="mt-2 flex gap-2 flex-wrap">
                            {t.tags.map((tag: string) => (
                              <span key={tag} className="px-2 py-1 bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 text-xs rounded-md">
                                {tag.replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        className="whitespace-nowrap px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 dark:border-zinc-700 hover:bg-amber-500 hover:border-amber-500 hover:text-white transition shadow-sm"
                        onClick={() => {
                          const subdomain = 'hexerve';
                          window.open(`https://${subdomain}.zendesk.com/agent/tickets/${t.id}`, '_blank');
                        }}
                      >
                        View in Zendesk
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
      {/* System Ticket Detail Modal */}
      {isDetailModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md overflow-x-hidden">
          <Card className="w-full max-w-[95vw] sm:max-w-[1000px] max-h-[90vh] bg-white dark:bg-zinc-900 shadow-2xl relative overflow-hidden rounded-[24px] border-none flex flex-col">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-blue-500/5 pointer-events-none" />

            <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-start sm:items-center bg-gray-50/50 dark:bg-zinc-800/30 relative z-10">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold dark:text-white flex items-center gap-2">
                  <Ticket className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" />
                  Ticket Details
                </h2>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">Ticket ID: {selectedTicket._id}</p>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-2 rounded-full bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700 shadow-sm transition hover:rotate-90 duration-300 flex-shrink-0"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 relative z-10 scrollbar-thin scrollbar-thumb-amber-200 dark:scrollbar-thumb-zinc-800 pb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 mb-6 sm:mb-8">
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Requester Info</h4>
                    <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-2xl p-3 sm:p-4 border border-gray-100 dark:border-zinc-800/80">
                      <p className="font-bold text-gray-900 dark:text-white text-base sm:text-lg">{selectedTicket.userName}</p>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-1">
                        <Mail className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        {selectedTicket.userEmail}
                      </p>
                      <span className="inline-block mt-2 sm:mt-3 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                        Role: {selectedTicket.role || 'user'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Status & Priority</h4>
                    <div className="flex flex-wrap gap-2 sm:gap-3">
                      <div className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold capitalize flex items-center gap-2 ${selectedTicket.status === 'open' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' :
                        selectedTicket.status === 'resolved' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' :
                          'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                        }`}>
                        <div className={`w-2 h-2 rounded-full ${selectedTicket.status === 'open' ? 'bg-rose-500' :
                          selectedTicket.status === 'resolved' ? 'bg-emerald-500' :
                            'bg-blue-500'
                          } animate-pulse`} />
                        {selectedTicket.status}
                      </div>
                      <div className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 text-xs sm:text-sm font-bold capitalize">
                        {selectedTicket.priority || 'Normal'} Priority
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Ticket Metadata</h4>
                    <div className="space-y-2 sm:space-y-3">
                      <div className="flex justify-between text-xs sm:text-sm py-1.5 sm:py-2 border-b border-gray-100 dark:border-zinc-800">
                        <span className="text-gray-500">Issue Type</span>
                        <span className="font-bold text-gray-900 dark:text-white capitalize text-right ml-2">{selectedTicket.issueType?.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="flex justify-between text-xs sm:text-sm py-1.5 sm:py-2 border-b border-gray-100 dark:border-zinc-800">
                        <span className="text-gray-500">Related Order</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 text-right ml-2">{selectedTicket.orderRef || 'None'}</span>
                      </div>
                      <div className="flex justify-between text-xs sm:text-sm py-1.5 sm:py-2 border-b border-gray-100 dark:border-zinc-800">
                        <span className="text-gray-500">Zendesk ID</span>
                        <span className="font-mono text-[10px] sm:text-xs font-bold text-amber-600 text-right ml-2">{selectedTicket.zendeskTicketId || 'Not Synced'}</span>
                      </div>
                      <div className="flex justify-between text-xs sm:text-sm py-1.5 sm:py-2">
                        <span className="text-gray-500">Created At</span>
                        <span className="font-bold text-gray-900 dark:text-white text-right ml-2">{new Date(selectedTicket.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-6 sm:mb-8">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Subject</h4>
                <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-tight">{selectedTicket.subject}</p>
              </div>

              <div className="mb-6 sm:mb-8">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Description</h4>
                <div className="bg-gray-50 dark:bg-zinc-800/30 rounded-2xl p-4 sm:p-6 text-gray-700 dark:text-gray-300 leading-relaxed text-sm whitespace-pre-wrap border border-gray-100 dark:border-zinc-800">
                  {selectedTicket.description}
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/30 flex flex-col sm:flex-row flex-wrap justify-end gap-2 sm:gap-3 relative z-10">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition shadow-sm"
              >
                Close
              </button>

              {/* Delete button — admin / super_admin only */}
              {user && ['admin', 'super_admin'].includes(String(user.role).toLowerCase()) && (
                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 font-bold hover:bg-red-100 dark:hover:bg-red-500/20 transition flex items-center justify-center gap-2 shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Ticket
                </button>
              )}

              {selectedTicket.status !== 'resolved' && (
                <>
                  {selectedTicket.status !== 'pending' && (
                    <button
                      className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-bold transition hover:bg-amber-200 dark:hover:bg-amber-900/50"
                      onClick={() => handleUpdateStatus(selectedTicket._id, 'pending')}
                    >
                      Mark Pending
                    </button>
                  )}
                  <button
                    className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-200/50 transition transform hover:-translate-y-0.5 active:translate-y-0"
                    onClick={() => handleUpdateStatus(selectedTicket._id, 'resolved')}
                  >
                    Resolve Ticket
                  </button>
                </>
              )}

              {selectedTicket.status === 'resolved' && (
                <button
                  className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl bg-gray-100 dark:bg-zinc-800 text-gray-500 font-bold transition"
                  onClick={() => handleUpdateStatus(selectedTicket._id, 'open')}
                >
                  Reopen Ticket
                </button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmOpen && selectedTicket && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-zinc-800 p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Delete Ticket?</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  Are you sure you want to delete this ticket? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={isDeletingTicket}
                className="px-5 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteTicket}
                disabled={isDeletingTicket}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-200/50 dark:shadow-red-900/30 transition disabled:opacity-50 flex items-center gap-2"
              >
                {isDeletingTicket ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {isDeletingTicket ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SupportChatModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        tickets={tickets}
        onRefreshTickets={fetchTickets}
      />

    </div>
  );
}